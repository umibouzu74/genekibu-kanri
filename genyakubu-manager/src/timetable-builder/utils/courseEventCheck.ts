// 本体の行事予定 (特別イベントの種別「📚 講習」) と、講習時間割作成のタブの使う日の
// 食い違い (2026-10-27)。2026 冬期講習で、行事予定は「冬期講習（後半）1/4〜1/6」の
// まま中３のタブだけ 1/7 を使っていて、気付くのが遅れた。
//
// 見るのは 2 つ:
// - タブが使う日なのに、そのタブの学年に当たる講習の行事予定の期間に入っていない日
//   (行事予定を直し忘れた / タブの日付を打ち間違えた)
// - 行事予定の講習の期間の日 (日曜・塾の全体休講日を除く) なのに、その行事予定の
//   学年のどのタブも使っていない日
// どちらも知らせるだけ (行事予定は本体のデータなので、講習側からは書き換えない)。
//
// 学年はタブ名から読む (「中３」「中1・中2」「中123」→ 中1〜中3)。読めないタブ・学年の
// 無い行事予定は、どの学年にも当たるものとして比べる。

import { isFullDayHoliday } from '../../utils/scheduleHelpers';
import { effectiveConfigForTab } from './scheduleKey';
import { projectBaseYmd, resolveDateLabelsYmd, usedDateLabels } from './courseDates';
import type { Project } from '../types';

export interface CourseEventLike {
  id?: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  eventType?: string;
  targetGrades?: string[];
}

export interface CourseEventFinding {
  kind: 'outside' | 'unused';
  /** outside: そのタブ / unused: 行事予定の学年に当たるタブ */
  tabNames: string[];
  /** 日付ラベル (outside) か YYYY-MM-DD (unused) を表示用に整えたもの */
  dates: string[];
  /** 関係する行事予定 (outside は近いもの、unused はその行事予定) */
  eventName: string;
  eventRange: string;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function parseYmd(ymd: string): Date | null {
  const m = String(ymd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(ymd: string, n: number): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

function daysBetween(a: string, b: string): number {
  const da = parseYmd(a);
  const db = parseYmd(b);
  return da && db ? Math.round((db.getTime() - da.getTime()) / 86400000) : 0;
}

/** "2027-01-06" → "1/6(水)" */
export function ymdLabel(ymd: string): string {
  const d = parseYmd(ymd);
  return d ? `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})` : ymd;
}

function rangeLabel(start: string, end: string): string {
  const a = parseYmd(start);
  const b = parseYmd(end);
  if (!a || !b) return `${start}〜${end}`;
  return start === end ? `${a.getMonth() + 1}/${a.getDate()}` : `${a.getMonth() + 1}/${a.getDate()}〜${b.getMonth() + 1}/${b.getDate()}`;
}

/** タブ名の学年: 「中３」→ [中3]、「中1・中2」「中1・2」→ [中1, 中2]、「中123」→ [中1, 中2, 中3]、「中学」→ 中1〜3 */
export function gradesFromTabName(name: string): string[] {
  const s = String(name ?? '').normalize('NFKC');
  const out: string[] = [];
  const add = (g: string) => { if (!out.includes(g)) out.push(g); };
  let prefix: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '中' || ch === '高') {
      prefix = ch;
      // 「中学」「高校」で数字が続かなければ 1〜3 年すべて
      const next = s[i + 1];
      if ((next === '学' || next === '校') && !/[1-3]/.test(s[i + 2] ?? '')) {
        [1, 2, 3].forEach(n => add(`${ch}${n}`));
      }
      continue;
    }
    if (prefix && /[1-3]/.test(ch)) { add(`${prefix}${ch}`); continue; }
    if (prefix && /[・,、/\s\-〜~]/.test(ch)) continue;
    if (prefix && (ch === '学' || ch === '校' || ch === '部' || ch === '年')) continue;
    prefix = null;
  }
  return out;
}

/** 行事予定の対象学年 (「中1-3」「附中3」も) を タブの学年の形 (中1 …) に */
function normalizeEventGrades(grades: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const raw of grades || []) {
    const g = String(raw ?? '').normalize('NFKC').replace(/^附/, '').trim();
    const range = g.match(/^([中高])(\d)-(\d)$/);
    if (range) {
      for (let n = Number(range[2]); n <= Number(range[3]); n++) out.add(`${range[1]}${n}`);
      continue;
    }
    gradesFromTabName(g).forEach(x => out.add(x));
  }
  return [...out];
}

function overlaps(tabGrades: string[], eventGrades: string[]): boolean {
  if (tabGrades.length === 0 || eventGrades.length === 0) return true;
  return tabGrades.some(g => eventGrades.includes(g));
}

// 行事予定を見て比べる範囲: 講習で使う日の前後 2 週間にかかる講習の行事予定
const WINDOW_DAYS = 14;

export function checkCourseEvents({
  project,
  specialEvents,
  holidays = [],
  todayYmd,
}: {
  project: Project;
  specialEvents: CourseEventLike[];
  holidays?: unknown[];
  todayYmd?: string;
}): { events: CourseEventLike[]; findings: CourseEventFinding[] } {
  const empty = { events: [], findings: [] };
  const used = usedDateLabels(project);
  if (used.size === 0) return empty;
  const baseYmd = projectBaseYmd(project, todayYmd);
  if (!baseYmd) return empty;
  const ymdByLabel = resolveDateLabelsYmd(used, baseYmd);
  const allYmd = [...ymdByLabel.values()].filter((v): v is string => !!v).sort();
  if (allYmd.length === 0) return empty;
  const windowStart = addDays(allYmd[0], -WINDOW_DAYS);
  const windowEnd = addDays(allYmd[allYmd.length - 1], WINDOW_DAYS);

  const events = (specialEvents || [])
    .filter(e => e && e.eventType === 'course' && parseYmd(e.startDate || '') && parseYmd(e.endDate || e.startDate || ''))
    .map(e => ({ ...e, endDate: e.endDate || e.startDate }))
    .filter(e => e.startDate! <= windowEnd && e.endDate! >= windowStart)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  if (events.length === 0) return { events: [], findings: [] };

  const holidayDates = new Set(
    (holidays as Array<{ date?: string }>).filter(h => isFullDayHoliday(h)).map(h => h.date).filter(Boolean) as string[],
  );
  const tabs = (project.tabs || [])
    .map(tab => {
      const cfg = effectiveConfigForTab(project, tab);
      if (cfg.periods.length === 0) return null;
      const days = cfg.dates
        .map(d => ({ label: d.label, ymd: ymdByLabel.get(d.label) }))
        .filter((d): d is { label: string; ymd: string } => !!d.ymd);
      return { name: tab.name, grades: gradesFromTabName(tab.name), days };
    })
    .filter((t): t is { name: string; grades: string[]; days: Array<{ label: string; ymd: string }> } => !!t && t.days.length > 0);

  const findings: CourseEventFinding[] = [];
  // タブが使う日なのに、学年に当たる講習の行事予定の期間に入っていない日
  for (const tab of tabs) {
    const mine = events.filter(e => overlaps(tab.grades, normalizeEventGrades(e.targetGrades)));
    if (mine.length === 0) continue;
    const outside = tab.days.filter(d => !mine.some(e => d.ymd >= e.startDate! && d.ymd <= e.endDate!));
    if (outside.length === 0) continue;
    // 近い行事予定 (最初の外れた日から期間の端までが一番近いもの)
    const ref = outside[0].ymd;
    const gap = (e: CourseEventLike) => Math.abs(daysBetween(ref, ref < e.startDate! ? e.startDate! : e.endDate!));
    const near = [...mine].sort((a, b) => gap(a) - gap(b))[0];
    findings.push({
      kind: 'outside',
      tabNames: [tab.name],
      dates: outside.map(d => d.label),
      eventName: near.name || '講習',
      eventRange: rangeLabel(near.startDate!, near.endDate!),
    });
  }
  // 行事予定の期間の日なのに、その学年のどのタブも使っていない日
  for (const e of events) {
    const eventGrades = normalizeEventGrades(e.targetGrades);
    const mine = tabs.filter(t => overlaps(t.grades, eventGrades));
    if (mine.length === 0) continue;
    const usedYmd = new Set(mine.flatMap(t => t.days.map(d => d.ymd)));
    const unused: string[] = [];
    for (let d = e.startDate!; d <= e.endDate!; d = addDays(d, 1)) {
      const dt = parseYmd(d);
      if (!dt || dt.getDay() === 0 || holidayDates.has(d)) continue;
      if (!usedYmd.has(d)) unused.push(d);
      if (unused.length > 60) break;
    }
    if (unused.length === 0) continue;
    findings.push({
      kind: 'unused',
      tabNames: mine.map(t => t.name),
      dates: unused.map(ymdLabel),
      eventName: e.name || '講習',
      eventRange: rangeLabel(e.startDate!, e.endDate!),
    });
  }
  return { events, findings };
}
