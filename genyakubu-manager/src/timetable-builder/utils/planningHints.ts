// ─── 講習の組み方の手がかり (B1・B2・B3 2026-10-31) ─────────────────────
//   - 普段の担当 (B1): utils/usualTeachersIndex
//   - 講師の使い方 (B3): 標準 / 控えめ / 使わない (Teacher.usage、所属からの既定)
//   - 連続出勤日数の上限 (B2): Project.dayStreakRules (暦日で数える)
// どれも時間割のデータ・人の設定から決まる (使用履歴は使わない、A18)。
// 本体のデータ (所属) は hostData から読み取り専用で受ける。自動作成は Web Worker で
// 走るので、ここで名前の集合まで解いた PlanningHints を渡す (worker は hostData を
// 持たない)。
import type { DayStreakRule, Project, Teacher, TeacherUsage } from '../types';
import { effectiveConfigForTab } from './scheduleKey';
import { getPeriodTimeRange } from './timeRange';
import { projectBaseYmd, resolveDateLabelsYmd } from './courseDates';
import type { UsualTeachersIndex } from './usualTeachersIndex';

export const YOBIKO_CATEGORY = 'yobiko';

/** 本体の講師の所属 (講習の初日の年度)。無ければ {} */
export function categoriesForSeason(
  categoriesByYear: Record<number, Record<string, string>> | undefined,
  refYmd: string,
): Record<string, string> {
  if (!categoriesByYear || !refYmd) return {};
  const [y, m] = refYmd.split('-').map(Number);
  const fy = m >= 4 ? y : y - 1;
  return categoriesByYear[fy] || {};
}

/** 講師の実際の使い方 (講師ごとの設定 > 所属からの既定 > 標準) */
export function resolveTeacherUsage(
  teacher: Pick<Teacher, 'name' | 'usage'> | null | undefined,
  project: Pick<Project, 'yobikoReserve'>,
  categories: Record<string, string>,
): TeacherUsage {
  if (!teacher) return 'normal';
  if (teacher.usage === 'reserve' || teacher.usage === 'never' || teacher.usage === 'normal') return teacher.usage;
  if (project.yobikoReserve && categories[teacher.name] === YOBIKO_CATEGORY) return 'reserve';
  return 'normal';
}

export const TEACHER_USAGE_LABEL: Record<TeacherUsage, string> = {
  normal: '標準',
  reserve: '控えめ',
  never: '使わない',
};

// ─── 連続出勤日数 (B2) ───────────────────────────────────────────

const hmToMin = (s: string | undefined): number | null => {
  const m = String(s ?? '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** 時限がルールの時間帯にかかるか (時刻の読めない時限は数えない) */
function periodInWindow(period: { label: string; startTime?: string; endTime?: string }, rule: DayStreakRule): boolean {
  const from = hmToMin(rule.fromTime);
  const to = hmToMin(rule.toTime);
  if (from == null && to == null) return true;
  const r = getPeriodTimeRange(period);
  if (!r) return false;
  const start = r.startMin;
  const end = r.endMin ?? r.startMin + 1;
  if (from != null && end <= from) return false;
  if (to != null && start >= to) return false;
  return true;
}

export interface ResolvedStreakRule {
  rule: DayStreakRule;
  teachers: Set<string>;
  /** 数えるタブ (null = 全部) */
  tabIds: Set<number> | null;
  /** 時間帯にかかる時限 id */
  periodIds: Set<number>;
  /** 日付 id → 暦日の通し番号 (隣の日 = +1)。読めない日は無い */
  dayIndexByDateId: Map<number, number>;
}

/** ルールの対象 (講師・タブ・時限・暦日) を解く */
export function resolveStreakRules(
  project: Project,
  categories: Record<string, string>,
): ResolvedStreakRule[] {
  const rules = (project.dayStreakRules || []).filter(r => r && r.maxDays >= 1);
  if (rules.length === 0) return [];
  const ymd = resolveDateLabelsYmd((project.dates || []).map(d => d.label), projectBaseYmd(project, null) || '2000-01-01');
  const dayIndexByDateId = new Map<number, number>();
  for (const d of project.dates || []) {
    const v = ymd.get(d.label);
    if (!v) continue;
    const [y, m, dd] = v.split('-').map(Number);
    dayIndexByDateId.set(d.id, Math.round(Date.UTC(y, m - 1, dd) / 86400000));
  }
  return rules.map(rule => {
    const teachers = new Set<string>();
    for (const t of project.teachers || []) {
      if ((rule.teachers || []).includes(t.name)) teachers.add(t.name);
      else if ((rule.categories || []).includes(categories[t.name])) teachers.add(t.name);
    }
    const periodIds = new Set((project.periods || []).filter(p => periodInWindow(p, rule)).map(p => p.id));
    const tabIds = Array.isArray(rule.tabIds) && rule.tabIds.length > 0 ? new Set(rule.tabIds) : null;
    return { rule, teachers, tabIds, periodIds, dayIndexByDateId };
  });
}

/** 暦日の通し番号の集合で、day を入れたときの連続の長さ */
export function streakLengthWith(days: Set<number>, day: number): number {
  let n = 1;
  for (let d = day - 1; days.has(d); d--) n++;
  for (let d = day + 1; days.has(d); d++) n++;
  return n;
}

export interface StreakViolation {
  ruleId: number;
  teacher: string;
  maxDays: number;
  /** 続いた日の日付ラベル (暦日順) */
  dateLabels: string[];
  /** そのうちの 1 つのセル (→ で飛ぶ先) */
  firstCell: { tabId: number; dateId: number; periodId: number; classId: number } | null;
}

/** 講師ごとに、ルールの対象に「入った日」(暦日の通し番号 → 最初のセル) */
function workedDays(project: Project, r: ResolvedStreakRule): Map<string, Map<number, { tabId: number; dateId: number; periodId: number; classId: number }>> {
  const out = new Map<string, Map<number, { tabId: number; dateId: number; periodId: number; classId: number }>>();
  for (const tab of project.tabs || []) {
    if (r.tabIds && !r.tabIds.has(tab.id)) continue;
    const cfg = effectiveConfigForTab(project, tab);
    const dateIds = new Set(cfg.dates.map(d => d.id));
    const periodIds = new Set(cfg.periods.map(p => p.id));
    for (const [key, e] of Object.entries(tab.schedule || {})) {
      const t = e?.teacher;
      if (!t || !r.teachers.has(t)) continue;
      const m = key.match(/^d(\d+)-p(\d+)-c(\d+)$/);
      if (!m) continue;
      const dateId = Number(m[1]);
      const periodId = Number(m[2]);
      if (!dateIds.has(dateId) || !periodIds.has(periodId) || !r.periodIds.has(periodId)) continue;
      const day = r.dayIndexByDateId.get(dateId);
      if (day == null) continue;
      if (!out.has(t)) out.set(t, new Map());
      const byDay = out.get(t)!;
      if (!byDay.has(day)) byDay.set(day, { tabId: tab.id, dateId, periodId, classId: Number(m[3]) });
    }
  }
  return out;
}

/** 連続出勤日数の上限を超えたところ (⚠ の一覧) */
export function computeStreakViolations(project: Project, categories: Record<string, string>): StreakViolation[] {
  const out: StreakViolation[] = [];
  const labelById = new Map((project.dates || []).map(d => [d.id, d.label]));
  for (const r of resolveStreakRules(project, categories)) {
    const dateIdByDay = new Map<number, number>();
    for (const [id, day] of r.dayIndexByDateId) dateIdByDay.set(day, id);
    for (const [teacher, byDay] of workedDays(project, r)) {
      const days = [...byDay.keys()].sort((a, b) => a - b);
      let run: number[] = [];
      const flush = () => {
        if (run.length > r.rule.maxDays) {
          out.push({
            ruleId: r.rule.id,
            teacher,
            maxDays: r.rule.maxDays,
            dateLabels: run.map(d => labelById.get(dateIdByDay.get(d)!) || ''),
            firstCell: byDay.get(run[0]) || null,
          });
        }
      };
      for (const d of days) {
        if (run.length > 0 && d !== run[run.length - 1] + 1) {
          flush();
          run = [];
        }
        run.push(d);
      }
      flush();
    }
  }
  return out;
}

// ─── 自動作成に渡す手がかり ───────────────────────────────────────

export interface PlanningHints {
  /** `${classId}:${subject}` → 普段の担当 (作るタブの分だけ) */
  usual?: Record<string, string[]>;
  /** 講師名 → 使い方 (標準は持たない) */
  usage?: Record<string, TeacherUsage>;
  /** 連続出勤日数の上限 (名前の集合まで解いたもの。Set は worker に送れないので配列) */
  streaks?: Array<{
    maxDays: number;
    teachers: string[];
    tabIds: number[] | null;
    periodIds: number[];
    dayIndexByDateId: Array<[number, number]>;
  }>;
}

export function buildPlanningHints(
  project: Project,
  activeTabId: number,
  usualIndex: UsualTeachersIndex | null,
  categories: Record<string, string>,
): PlanningHints {
  const hints: PlanningHints = {};
  const tab = (project.tabs || []).find(t => t.id === activeTabId);
  if (tab && usualIndex?.hasLinks) {
    const usual: Record<string, string[]> = {};
    for (const c of tab.config?.classes || []) {
      for (const s of project.subjects || []) {
        const list = usualIndex.forClass(tab.id, c.id, s);
        if (list.length) usual[`${c.id}:${s}`] = list;
      }
    }
    hints.usual = usual;
  }
  const usage: Record<string, TeacherUsage> = {};
  for (const t of project.teachers || []) {
    const u = resolveTeacherUsage(t, project, categories);
    if (u !== 'normal') usage[t.name] = u;
  }
  if (Object.keys(usage).length) hints.usage = usage;
  const streaks = resolveStreakRules(project, categories);
  if (streaks.length) {
    hints.streaks = streaks.map(r => ({
      maxDays: r.rule.maxDays,
      teachers: [...r.teachers],
      tabIds: r.tabIds ? [...r.tabIds] : null,
      periodIds: [...r.periodIds],
      dayIndexByDateId: [...r.dayIndexByDateId.entries()],
    }));
  }
  return hints;
}
