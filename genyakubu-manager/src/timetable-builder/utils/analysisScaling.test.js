// E4d: useAnalysis 再計算コストの計測 (手動実行のベンチマーク)。
//
// 通常の `npm test` ではスキップされる。実行: `npm run bench:analysis`
//
// useAnalysis (hooks/useAnalysis.ts) は 5 段 useMemo の合成で、編集操作の
// 種類ごとに再計算される純粋関数が異なる:
//   - セル編集 (currentSchedule 変化):
//     computeActiveAnalysis / computeViolations / computeInfeasibilities
//     (+buildFixSuggestions) / computeDashboard
//     ※ tabs 参照も変わるので実際は computeGlobalUsage /
//       computeTabViolationCounts も走る (reducer は tabs を差し替える)
//   - 講師・設定編集: 上記に加えて computeAutoNgByTeacher
// ここでは「フル再計算 1 回分」の関数別コストを大きめの合成 project で
// 実測し、キー入力〜フレーム予算 (16ms) に収まっているかを確認する。
import { describe, expect, it } from 'vitest';
import {
  computeGlobalUsage,
  computeActiveAnalysis,
  computeDashboard,
  computeTabViolationCounts,
  computeViolations,
  computeInfeasibilities,
} from './analysisHelpers';
import { computeAutoNgByTeacher } from './autoNg';
import { buildFixSuggestions } from './fixSuggestions';
import { effectiveConfigForTab, makeKey } from './scheduleKey';

const SUBJECTS = ['英語', '数学', '国語', '理科', '社会'];

function wrapEntities(labels) {
  return labels.map((label, i) => ({ id: i + 1, label }));
}

// TABS タブ × CLASSES クラス × DATES 日 × PERIODS 限、全セル充填の
// 合成 project。講師はラウンドロビンで割り当てる (違反が混ざるのは分析
// コスト計測上は問題ない — 実運用でも違反ありの状態で毎編集走る)。
function buildProject({ tabs = 3, classes = 7, days = 12, periods = 4 }) {
  const dates = wrapEntities(Array.from({ length: days }, (_, i) => `7/${i + 1}`));
  const periodEnts = wrapEntities(Array.from({ length: periods }, (_, i) => `${i + 1}限`));
  const teachers = [];
  for (const s of SUBJECTS) {
    for (let i = 0; i < 6; i++) {
      teachers.push({ name: `${s}T${i + 1}`, subjects: [s], ngSlots: [], ngClasses: [], priorityClasses: [] });
    }
  }
  const total = days * periods;
  const subjectCounts = {};
  SUBJECTS.forEach((s, i) => {
    subjectCounts[s] = Math.floor(total / SUBJECTS.length) + (i < total % SUBJECTS.length ? 1 : 0);
  });
  const tabList = [];
  for (let t = 1; t <= tabs; t++) {
    const classEnts = wrapEntities(
      Array.from({ length: classes }, (_, i) => `T${t}C${i + 1}`)
    );
    const schedule = {};
    let n = 0;
    for (const d of dates) {
      for (const p of periodEnts) {
        for (const c of classEnts) {
          const s = SUBJECTS[n % SUBJECTS.length];
          const teacher = `${s}T${(n % 6) + 1}`;
          schedule[makeKey(d.id, p.id, c.id)] = { subject: s, teacher };
          n++;
        }
      }
    }
    tabList.push({ id: t, name: `tab${t}`, config: { classes: classEnts, subjectCounts }, schedule });
  }
  return {
    version: 4,
    name: 'bench',
    teachers,
    activeTabId: 1,
    dates,
    periods: periodEnts,
    tabs: tabList,
    externalCounts: {},
    externalSessions: [],
    combinedGroups: [],
    subjects: SUBJECTS,
    subjectColors: {},
  };
}

// fn を warmup 後 n 回実行して平均 ms を返す。
function measure(fn, n = 20) {
  for (let i = 0; i < 3; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn();
  return +((performance.now() - t0) / n).toFixed(2);
}

describe.skipIf(!process.env.BENCH)('useAnalysis 再計算コスト計測 (E4d)', () => {
  it('関数別のフル再計算コストを計測する', () => {
    const project = buildProject({ tabs: 3, classes: 7, days: 12, periods: 4 });
    const tab = project.tabs[0];
    const currentSchedule = tab.schedule;
    const currentConfig = effectiveConfigForTab(project, tab);
    const maxDailyHours = 6;

    const rows = [];
    const rec = (name, fn) => {
      const ms = measure(fn);
      rows.push({ fn: name, 'avg ms': ms });
      return fn();
    };

    const { teacherDailyCounts, globalUsage } = rec('computeGlobalUsage (3タブ)', () =>
      computeGlobalUsage(project.tabs, project.combinedGroups, project.externalCounts, project.externalSessions, project.dates, project.periods)
    );
    const autoNgByTeacher = rec('computeAutoNgByTeacher', () =>
      computeAutoNgByTeacher(project.teachers, project.externalSessions, project.periods)
    );
    const activeAnalysis = rec('computeActiveAnalysis', () =>
      computeActiveAnalysis(currentConfig, currentSchedule, globalUsage, project.teachers, autoNgByTeacher)
    );
    rec('computeTabViolationCounts', () =>
      computeTabViolationCounts({
        tabs: project.tabs, globalUsage, teachers: project.teachers,
        externalSessions: project.externalSessions,
        dates: project.dates, periods: project.periods,
      })
    );
    rec('computeViolations', () =>
      computeViolations({
        currentConfig, currentSchedule,
        errorKeys: activeAnalysis.errorKeys,
        dailySubjectMap: activeAnalysis.dailySubjectMap,
        subjectOrders: activeAnalysis.subjectOrders,
        ngViolationKeys: activeAnalysis.ngViolationKeys,
        teacherDailyCounts, maxDailyHours,
        teachers: project.teachers,
      })
    );
    rec('computeInfeasibilities+fix', () =>
      buildFixSuggestions(
        computeInfeasibilities({
          teachers: project.teachers,
          commonSubjects: project.subjects,
          currentConfig, maxDailyHours, autoNgByTeacher,
          combinedGroups: project.combinedGroups,
          currentSchedule,
        }),
        { currentConfig, teachers: project.teachers, maxDailyHours, autoNgByTeacher },
      )
    );
    rec('computeDashboard', () =>
      computeDashboard(currentSchedule, currentConfig)
    );

    const totalMs = rows.reduce((a, r) => a + r['avg ms'], 0);
    rows.push({ fn: '合計 (フル再計算 1 回)', 'avg ms': +totalMs.toFixed(2) });
    // eslint-disable-next-line no-console
    console.table(rows);
    expect(totalMs).toBeGreaterThan(0);
  }, 120_000);
});
