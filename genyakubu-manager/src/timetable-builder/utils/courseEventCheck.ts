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
import { normalizeEventName } from './eventName';
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

export { normalizeEventName };

// タブ名から学年の部分を除いた語 (「中３直前 火木」→「直前火木」)。結び付けの提案に使う
function tabTopic(name: string): string {
  return normalizeEventName(name)
    .replace(/[中高][1-3１-３](?:[・,、/\-〜~]?[1-3１-３])*/g, '')
    .replace(/[中高]学?/g, '')
    .replace(/年/g, '');
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

// 2 つの語の近さ (2 文字ずつの重なり、0〜1)
function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let common = 0;
  A.forEach(x => { if (B.has(x)) common++; });
  return common / Math.min(A.size, B.size);
}

/** 照合に使う行事予定 1 件 (画面の「行事予定との対応」) */
export interface CourseEventRow {
  name: string;
  /** normalizeEventName(name) */
  key: string;
  range: string;
  grades: string[];
  /** この名前を結び付けたタブ */
  linkedTabIds: number[];
  /** 「この講習の対象外」 */
  ignored: boolean;
  /** 名前から結び付けを提案するタブ (結び付けが無いときだけ) */
  suggestedTabIds: number[];
}

type TabDays = { id: number; name: string; grades: string[]; days: Array<{ label: string; ymd: string }>; links: Set<string> };

// 週ごとのコース (火木・水金・土曜・月水金) なら、比べる曜日をタブが使う曜日に絞る。
// 行事予定の期間が 1 週間以上あり、タブが使う曜日 (日曜を除く) が 3 つ以下のとき。
// 冬期講習のような毎日の講習は全曜日 (日曜を除く) を比べる
function weeklyWeekdays(event: { startDate: string; endDate: string }, tabs: TabDays[]): Set<number> | null {
  const inRange = tabs.flatMap(t => t.days.filter(d => d.ymd >= event.startDate && d.ymd <= event.endDate));
  if (inRange.length === 0 || daysBetween(event.startDate, event.endDate) < 7) return null;
  const wd = new Set(inRange.map(d => parseYmd(d.ymd)!.getDay()).filter(w => w !== 0));
  return wd.size > 0 && wd.size <= 3 ? wd : null;
}

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
}): { events: CourseEventLike[]; findings: CourseEventFinding[]; rows: CourseEventRow[] } {
  const empty = { events: [], findings: [], rows: [] };
  const used = usedDateLabels(project);
  if (used.size === 0) return empty;
  const baseYmd = projectBaseYmd(project, todayYmd);
  if (!baseYmd) return empty;
  const ymdByLabel = resolveDateLabelsYmd(used, baseYmd);
  const allYmd = [...ymdByLabel.values()].filter((v): v is string => !!v).sort();
  if (allYmd.length === 0) return empty;
  const windowStart = addDays(allYmd[0], -WINDOW_DAYS);
  const windowEnd = addDays(allYmd[allYmd.length - 1], WINDOW_DAYS);

  const inWindow = (specialEvents || [])
    .filter(e => e && e.eventType === 'course' && parseYmd(e.startDate || '') && parseYmd(e.endDate || e.startDate || ''))
    .map(e => ({ ...e, endDate: e.endDate || e.startDate }))
    .filter(e => e.startDate! <= windowEnd && e.endDate! >= windowStart)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  if (inWindow.length === 0) return empty;

  const ignoredKeys = new Set((project.ignoredCourseEvents || []).map(normalizeEventName));
  const holidayDates = new Set(
    (holidays as Array<{ date?: string }>).filter(h => isFullDayHoliday(h)).map(h => h.date).filter(Boolean) as string[],
  );
  const tabs: TabDays[] = (project.tabs || [])
    .map(tab => {
      const cfg = effectiveConfigForTab(project, tab);
      if (cfg.periods.length === 0) return null;
      const days = cfg.dates
        .map(d => ({ label: d.label, ymd: ymdByLabel.get(d.label) }))
        .filter((d): d is { label: string; ymd: string } => !!d.ymd);
      const links = new Set((tab.config.courseEventNames || []).map(normalizeEventName).filter(Boolean));
      return { id: tab.id, name: tab.name, grades: gradesFromTabName(tab.name), days, links };
    })
    .filter((t): t is TabDays => !!t && t.days.length > 0);

  // 結び付けたタブ (名前の一致) を行事予定ごとに
  const linkedTabsOf = (e: CourseEventLike) => tabs.filter(t => t.links.has(normalizeEventName(e.name)));
  const linkedKeys = new Set(tabs.flatMap(t => [...t.links]));
  // 比べる行事予定 (対象外を除く)
  const events = inWindow.filter(e => !ignoredKeys.has(normalizeEventName(e.name)));
  // 結び付けの無い行事予定は、結び付けの無いタブと学年で比べる (従来どおり)
  const unlinkedEvents = events.filter(e => !linkedKeys.has(normalizeEventName(e.name)));

  // タブが比べる行事予定: 結び付けがあればその名前の行事予定 (同じ名前が何件もあれば
  // 学年の合うもの、無ければ全部)、無ければ学年の合う結び付けの無い行事予定
  const eventsForTab = (tab: TabDays): CourseEventLike[] => {
    if (tab.links.size === 0) return unlinkedEvents.filter(e => overlaps(tab.grades, normalizeEventGrades(e.targetGrades)));
    const named = events.filter(e => tab.links.has(normalizeEventName(e.name)));
    const byGrade = named.filter(e => overlaps(tab.grades, normalizeEventGrades(e.targetGrades)));
    return byGrade.length > 0 ? byGrade : named;
  };
  const tabsForEvent = (e: CourseEventLike): TabDays[] => {
    const linked = linkedTabsOf(e);
    if (linked.length > 0) return linked.filter(t => eventsForTab(t).includes(e));
    return tabs.filter(t => t.links.size === 0 && overlaps(t.grades, normalizeEventGrades(e.targetGrades)));
  };

  const findings: CourseEventFinding[] = [];
  // タブが使う日なのに、比べる行事予定の期間に入っていない日
  for (const tab of tabs) {
    const mine = eventsForTab(tab);
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
  // 行事予定の期間の日なのに、比べるタブのどれも使っていない日 (週ごとのコースは
  // タブが使う曜日だけ。日曜・塾の全体休講日は比べない)
  for (const e of events) {
    const mine = tabsForEvent(e);
    if (mine.length === 0) continue;
    const usedYmd = new Set(mine.flatMap(t => t.days.map(d => d.ymd)));
    const weekly = weeklyWeekdays(e as { startDate: string; endDate: string }, mine);
    const unused: string[] = [];
    for (let d = e.startDate!; d <= e.endDate!; d = addDays(d, 1)) {
      const dt = parseYmd(d);
      if (!dt || dt.getDay() === 0 || holidayDates.has(d)) continue;
      if (weekly && !weekly.has(dt.getDay())) continue;
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

  // 画面の「行事予定との対応」: 名前ごとに 1 行 (同じ名前の行事予定は学年をまとめる)
  const rowsByKey = new Map<string, CourseEventRow>();
  for (const e of inWindow) {
    const key = normalizeEventName(e.name);
    if (!key) continue;
    const row = rowsByKey.get(key);
    const grades = normalizeEventGrades(e.targetGrades);
    if (row) {
      grades.forEach(g => { if (!row.grades.includes(g)) row.grades.push(g); });
      continue;
    }
    const linked = tabs.filter(t => t.links.has(key)).map(t => t.id);
    rowsByKey.set(key, {
      name: e.name || '',
      key,
      range: rangeLabel(e.startDate!, e.endDate!),
      grades,
      linkedTabIds: linked,
      ignored: ignoredKeys.has(key),
      suggestedTabIds: [],
    });
  }
  const rows = [...rowsByKey.values()];
  // 名前から結び付けを提案: 学年を除いたタブ名と行事予定の名前が近いもの (結び付けも
  // 対象外も無い行事予定・結び付けの無いタブだけ)。いちばん近いもの 1 つ
  for (const t of (project.tabs || [])) {
    if ((t.config.courseEventNames || []).length > 0) continue;
    const topic = tabTopic(t.name);
    if (topic.length < 2) continue;
    let best: { row: CourseEventRow; score: number } | null = null;
    for (const row of rows) {
      if (row.ignored || row.linkedTabIds.length > 0) continue;
      const score = similarity(topic, row.key);
      if (score >= 0.5 && (!best || score > best.score)) best = { row, score };
    }
    if (best) best.row.suggestedTabIds.push(t.id);
  }
  return { events: inWindow, findings, rows };
}
