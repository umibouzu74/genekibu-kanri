// useAnalysis の中身を純粋関数として切り出したもの。React 非依存で
// ユニットテスト可能にし、useAnalysis 側は useMemo の deps を最小化する
// orchestrator に専念させる (D4e + D2a)。

import { makeKey, makeExternalKey, parseKey, findCombinedGroup, findEntityById } from './scheduleKey';

// 全タブ横断の講師使用状況を集計する。
//
// 返り値:
//   - teacherDailyCounts: { [makeExternalKey(date, teacher)]: { current, external, total } }
//       日付×講師ごとの自タブ内コマ数 (current)、externalCounts (external)、
//       合計 (total)。
//   - globalUsage: { [`${date}-${period}-${teacher}`]: [{ tabId, combinedGroupId }, ...] }
//       同じ日時の同じ講師が複数タブで使われているかを後段の conflict 判定で
//       使う。合同グループ内の重複は同一 (tabId, combinedGroupId) ペアとして
//       1 回扱いにする。
//
// 「未定」は teacher 名として有効でも、コマ数集計の対象外。
//
// 入力 schema (v3):
//   tabs: [{ id, schedule: { [makeKey]: { subject, teacher, ... } }, config }]
//   combinedGroups: [{ id, subject, classes: string[], dates: string[]|null }]
//   externalCounts: { [makeExternalKey]: number }
export function computeGlobalUsage(tabs, combinedGroups, externalCounts) {
  const teacherDailyCounts = {};
  const globalUsage = {};
  const groups = combinedGroups || [];

  tabs.forEach(tab => {
    // 合同グループで既にカウント済みの (date, period, groupId) を追跡。
    // 同一タブ内の合同グループは 1 コマとしてカウントする。
    const tabCombinedCounted = new Set();

    Object.keys(tab.schedule).forEach(key => {
      const entry = tab.schedule[key];
      if (!entry || !entry.teacher || entry.teacher === '未定') return;
      const parsed = parseKey(key);
      if (!parsed) return;
      const { dateId, periodId, classId } = parsed;
      const dateEnt = findEntityById(tab.config.dates, dateId);
      const periodEnt = findEntityById(tab.config.periods, periodId);
      const classEnt = findEntityById(tab.config.classes, classId);
      if (!dateEnt || !periodEnt || !classEnt) return;
      const date = dateEnt.label;
      const period = periodEnt.label;
      const className = classEnt.label;

      const group = findCombinedGroup(groups, entry.subject, className, date);
      let isCombinedDuplicate = false;
      if (group) {
        const combinedTrackKey = `${date}-${period}-${group.id}`;
        if (tabCombinedCounted.has(combinedTrackKey)) {
          isCombinedDuplicate = true;
        } else {
          tabCombinedCounted.add(combinedTrackKey);
        }
      }

      const usageKey = `${date}-${period}-${entry.teacher}`;
      if (!globalUsage[usageKey]) globalUsage[usageKey] = [];
      globalUsage[usageKey].push({ tabId: tab.id, combinedGroupId: group?.id || null });

      if (!isCombinedDuplicate) {
        const dayKey = makeExternalKey(date, entry.teacher);
        if (!teacherDailyCounts[dayKey]) {
          const ext = (externalCounts?.[dayKey] || 0);
          teacherDailyCounts[dayKey] = { current: 0, external: ext, total: ext };
        }
        teacherDailyCounts[dayKey].current++;
        teacherDailyCounts[dayKey].total++;
      }
    });
  });

  return { teacherDailyCounts, globalUsage };
}

// globalUsage 内の (tabId, combinedGroupId) ペアを 1 回扱いにして、
// 実効的な使用回数を返す。合同グループ内の複数クラスは 1 コマとして
// カウントするため、conflict 判定に使う。
function getEffectiveUsageCount(usages) {
  const seen = new Set();
  let count = 0;
  usages.forEach(u => {
    if (u.combinedGroupId) {
      const key = `tab${u.tabId}-cg${u.combinedGroupId}`;
      if (seen.has(key)) return;
      seen.add(key);
    }
    count++;
  });
  return count;
}

// 現タブの分析結果を計算する (conflict / dailySubject / subjectOrder)。
//
// 返り値:
//   - conflictMap: { [`${date}-${period}-${teacher}`]: true }
//       同じ日時・同じ講師が複数箇所 (タブ横断) で使われている場合 true。
//       合同グループ内の重複はカウントしない。
//   - errorKeys: schedule key 配列。conflict があるセル。
//   - dailySubjectMap: { [`c${classId}-d${dateId}-${subject}`]: count }
//       現タブ内・同一クラス×同一日の科目重複検出用。> 1 で重複。
//   - subjectOrders: { [scheduleKey]: number }
//       現タブ内・同一クラス内での該当科目の連番 (1-based、何回目か)。
export function computeActiveAnalysis(currentConfig, currentSchedule, globalUsage) {
  const conflictMap = {};
  const errorKeys = [];
  const dailySubjectMap = {};
  const subjectOrders = {};

  currentConfig.dates.forEach(d => {
    currentConfig.periods.forEach(p => {
      currentConfig.classes.forEach(c => {
        const key = makeKey(d.id, p.id, c.id);
        const entry = currentSchedule[key];
        if (entry && entry.subject) {
          const subjKey = `c${c.id}-d${d.id}-${entry.subject}`;
          dailySubjectMap[subjKey] = (dailySubjectMap[subjKey] || 0) + 1;
        }
        if (entry && entry.teacher && entry.teacher !== '未定') {
          const usageKey = `${d.label}-${p.label}-${entry.teacher}`;
          const effectiveCount = getEffectiveUsageCount(globalUsage[usageKey] || []);
          if (effectiveCount > 1) {
            conflictMap[`${d.label}-${p.label}-${entry.teacher}`] = true;
            errorKeys.push(key);
          }
        }
      });
    });
  });

  currentConfig.classes.forEach(c => {
    const counts = {};
    currentConfig.dates.forEach(d => {
      currentConfig.periods.forEach(p => {
        const key = makeKey(d.id, p.id, c.id);
        const s = currentSchedule[key]?.subject;
        if (s) {
          counts[s] = (counts[s] || 0) + 1;
          subjectOrders[key] = counts[s];
        }
      });
    });
  });

  return { conflictMap, errorKeys, dailySubjectMap, subjectOrders };
}

// ダッシュボード集計 (進捗バー用)。
//   total: 設定された科目クォータの合計 × クラス数
//   filled: subject が割り当たっているセルの個数
//   progress: filled / total を百分率 (整数)。total=0 のとき 0。
export function computeDashboard(currentSchedule, currentConfig) {
  const total = Object.values(currentConfig.subjectCounts).reduce((a, b) => a + b, 0) * currentConfig.classes.length;
  let filled = 0;
  Object.values(currentSchedule).forEach(v => { if (v.subject) filled++; });
  return { progress: total > 0 ? Math.round((filled / total) * 100) : 0, filled, total };
}
