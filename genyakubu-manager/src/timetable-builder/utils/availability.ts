// 出勤可能調査 (講習期間の「出られる時間」をバイト等に書いてもらう調査票) の
// 回答を扱う純粋関数群。React 非依存。
//
// - 回答は Teacher.availability に「日付ラベル → 時限ラベル → 記号」で持つ。
//   記号は ok (○ 出られる) / maybe (△ 相談) / ng (× 出られない)。未記入は
//   キーが無いことで表し、空になった日付・講師はキーごと消す
// - × は「導出される NG」。autoNg.computeAutoNgByTeacher が他学年セッション
//   由来の自動NGと同じ Map に合流させるので、自動作成・違反チェック・Excel の
//   ⚠NG・修正提案は何も変えずに × を NG として扱う。手動NG (ngSlots) とは
//   別物なので、NG の一括解除で調査の回答は消えない
// - ○ と △ は制約に効かない (表示だけ)。△ を自動作成の重みに使うのは
//   ROADMAP L3c (ソフト希望) の範囲
// - 調査の対象マス (= 調査票に載る (日付, 時限)) は「どれかのタブがその日に
//   使う時限」(computeSurveyDays)。プールにあっても誰も使わない時限は載せない
// - 日付ラベルは年を持たないので、週の並び (調査票・入力画面) は本体と同じ
//   決まり (courseDates.resolveDateLabelYmd) で実日付に解決する (冬期講習の
//   12/25 → 1/7 の年またぎを含む)。授業のある日だけを解決する

import { makeNgKey, activeDatesForTab, activePeriodsForTab } from './scheduleKey';
import { sortPoolDatesByCalendar } from './dateGenerate';
import { resolveDateLabelYmd } from './courseDates';
import { formatHHmm, getPeriodTimeRange } from './timeRange';
import { isAvailabilityMark } from './availabilityShape';
import type { AvailabilityCell } from './availabilityShape';
import type { AvailabilityMark, Entity, Project, Teacher } from '../types';

// 形の操作 (マスの書き換え・ラベル追従・検証) は無依存モジュールに置いてある。
// 画面側の import 先を 1 つにするため再エクスポートする。
export {
  isAvailabilityMark,
  applyAvailabilityMarks,
  withAvailability,
  mapTeachersAvailability,
  renameAvailabilityDate,
  renameAvailabilityPeriod,
  dropAvailabilityDates,
  dropAvailabilityPeriods,
  sanitizeAvailability,
} from './availabilityShape';
export type { AvailabilityCell } from './availabilityShape';

export const AVAILABILITY_MARKS: readonly AvailabilityMark[] = ['ok', 'maybe', 'ng'];

/** 紙面・画面に出す記号 */
export const AVAILABILITY_SYMBOL: Record<AvailabilityMark, string> = {
  ok: '○',
  maybe: '△',
  ng: '×',
};

/** 読み上げ・凡例用の言葉 */
export const AVAILABILITY_WORD: Record<AvailabilityMark, string> = {
  ok: '出られる',
  maybe: '相談',
  ng: '出られない',
};

/** 未記入マスの記号 (回答のある講師の、書かれていないマス) */
export const BLANK_SYMBOL = '?';

/** 講師の placeholder。調査の対象にしない */
const PLACEHOLDER_TEACHER = '未定';

/** 調査の対象になる講師 (placeholder の「未定」を除く) */
export function isSurveyTeacher(t: Pick<Teacher, 'name'> | null | undefined): boolean {
  return !!t?.name && t.name !== PLACEHOLDER_TEACHER;
}

export function getAvailabilityMark(
  teacher: Pick<Teacher, 'availability'> | null | undefined,
  dateLabel: string,
  periodLabel: string,
): AvailabilityMark | null {
  const m = teacher?.availability?.[dateLabel]?.[periodLabel];
  return isAvailabilityMark(m) ? m : null;
}

/** 1 マスでも回答がある講師か (未回答 = 調査票がまだ戻っていない) */
export function hasAvailability(teacher: Pick<Teacher, 'availability'> | null | undefined): boolean {
  const map = teacher?.availability;
  if (!map) return false;
  return Object.keys(map).some(d => {
    const byPeriod = map[d];
    return !!byPeriod && Object.keys(byPeriod).some(p => isAvailabilityMark(byPeriod[p]));
  });
}

/** × のマスを NG キー (makeNgKey) で返す。自動NG への合流に使う */
export function availabilityNgKeys(teacher: Pick<Teacher, 'availability'> | null | undefined): string[] {
  const out: string[] = [];
  const map = teacher?.availability;
  if (!map) return out;
  Object.keys(map).forEach(date => {
    const byPeriod = map[date];
    if (!byPeriod) return;
    Object.keys(byPeriod).forEach(period => {
      if (byPeriod[period] === 'ng') out.push(makeNgKey(date, period));
    });
  });
  return out;
}

// ─── 調査の対象マス ───────────────────────────────────────────

export interface SurveyDay {
  date: Entity;
  /** その日にどれかのタブが使う時限 (開始時刻順。時刻の読めない時限は後ろ) */
  periods: Entity[];
  /** その日に授業のあるタブ名 (タブの並び順) */
  tabNames: string[];
}

// 時限を開始時刻順に並べる (同時刻・時刻なしは元の並び順)。
export function sortPeriodsByTime(periods: Entity[]): Entity[] {
  return (periods || [])
    .map((p, idx) => ({ p, idx, start: getPeriodTimeRange(p)?.startMin ?? null }))
    .sort((a, b) => {
      if (a.start == null && b.start == null) return a.idx - b.idx;
      if (a.start == null) return 1;
      if (b.start == null) return -1;
      return a.start - b.start || a.idx - b.idx;
    })
    .map(e => e.p);
}

// プールの全日付 (カレンダー順) について、その日に調査するマスを求める。
// どのタブも使わない日は periods=[] のまま返す (調査票では空欄の日)。
export function computeSurveyDays(project: Pick<Project, 'dates' | 'periods' | 'tabs'>): SurveyDay[] {
  const poolPeriods = project.periods || [];
  const tabs = (project.tabs || []).map(t => ({
    name: t.name,
    dateIds: Array.isArray(t.config?.activeDateIds) ? new Set(t.config.activeDateIds) : null,
    periods: activePeriodsForTab(poolPeriods, t),
  }));
  return sortPoolDatesByCalendar(project.dates || []).map(date => {
    const ids = new Set<number>();
    const tabNames: string[] = [];
    tabs.forEach(t => {
      if (t.dateIds && !t.dateIds.has(date.id)) return;
      if (t.periods.length === 0) return;
      tabNames.push(t.name);
      t.periods.forEach(p => ids.add(p.id));
    });
    return {
      date,
      periods: sortPeriodsByTime(poolPeriods.filter(p => ids.has(p.id))),
      tabNames,
    };
  });
}

// 調査の対象マスを (date, period) ラベルの配列で返す。
export function surveyCells(surveyDays: SurveyDay[]): AvailabilityCell[] {
  const out: AvailabilityCell[] = [];
  surveyDays.forEach(sd => sd.periods.forEach(p => out.push({ date: sd.date.label, period: p.label })));
  return out;
}

export interface AvailabilityCounts {
  ok: number;
  maybe: number;
  ng: number;
  /** 調査の対象マスのうち未記入 */
  blank: number;
  /** 調査の対象マスの数 */
  total: number;
}

// 講師 1 人の回答を調査の対象マスで数える (対象外のマスに残っている古い回答は
// 数えない)。
export function countTeacherAvailability(
  teacher: Pick<Teacher, 'availability'> | null | undefined,
  surveyDays: SurveyDay[],
): AvailabilityCounts {
  const counts: AvailabilityCounts = { ok: 0, maybe: 0, ng: 0, blank: 0, total: 0 };
  surveyDays.forEach(sd => sd.periods.forEach(p => {
    counts.total++;
    const m = getAvailabilityMark(teacher, sd.date.label, p.label);
    if (m) counts[m]++;
    else counts.blank++;
  }));
  return counts;
}

export interface SlotAvailability {
  ok: Teacher[];
  maybe: Teacher[];
  ng: Teacher[];
  /** 回答はあるが、このマスは未記入 */
  blank: Teacher[];
  /** 回答が 1 マスも無い (調査票が戻っていない・調査しない講師) */
  unanswered: Teacher[];
}

// 1 マス (日付, 時限) について、講師を回答ごとに分ける。並びは teachers の順。
export function collectSlotAvailability(
  teachers: Teacher[],
  dateLabel: string,
  periodLabel: string,
): SlotAvailability {
  const out: SlotAvailability = { ok: [], maybe: [], ng: [], blank: [], unanswered: [] };
  (teachers || []).forEach(t => {
    if (!isSurveyTeacher(t)) return;
    const m = getAvailabilityMark(t, dateLabel, periodLabel);
    if (m) out[m].push(t);
    else if (hasAvailability(t)) out.blank.push(t);
    else out.unanswered.push(t);
  });
  return out;
}

// ─── 表示用の短いラベル ─────────────────────────────────────

// "1限 (13:00~13:45)" → "1限"。括弧 (半角/全角) 以降を落とす。落とすと空に
// なるラベル (時刻だけのラベル等) は時刻の開始を返す。
export function periodShortLabel(period: Entity): string {
  const s = String(period?.label ?? '');
  const short = s.replace(/\s*[(（].*$/, '').trim();
  if (short && !/^\d{1,2}[:：]\d{2}/.test(short)) return short;
  const range = getPeriodTimeRange(period);
  return range ? (formatHHmm(range.startMin) || s) : (short || s);
}

// 調査票に書く時刻 "13:00-13:45"。終了の無い時限は "13:00〜"、時刻の読めない
// 時限はラベルそのもの。
export function periodTimeText(period: Entity): string {
  const range = getPeriodTimeRange(period);
  if (!range) return String(period?.label ?? '');
  const start = formatHHmm(range.startMin);
  return range.endMin != null ? `${start}-${formatHHmm(range.endMin)}` : `${start}〜`;
}

// ─── 調査票の紙面 (週 × 曜日) ────────────────────────────────

// 時間帯のまとまり (昼の部・夜の部など) に分ける。開始時刻順に並べ、前の
// まとまりの終わりから BAND_GAP_MIN 分以上空いたら次のまとまりにする。
// 終了時刻の無い時限は ASSUMED_LESSON_MIN 分の授業とみなす (「1限 (13:00~)」
// 「2限 (14:10~)」が 1 時限ずつ別のまとまりに割れないように)。時刻の読めない
// 時限は最後のまとまりに元の順でまとめる。
export const BAND_GAP_MIN = 40;
const ASSUMED_LESSON_MIN = 60;

export function groupPeriodsIntoBands(periods: Entity[], gapMin = BAND_GAP_MIN): Entity[][] {
  const timed: Array<{ p: Entity; start: number; end: number; idx: number }> = [];
  const untimed: Entity[] = [];
  (periods || []).forEach((p, idx) => {
    const r = getPeriodTimeRange(p);
    if (!r) { untimed.push(p); return; }
    timed.push({ p, idx, start: r.startMin, end: r.endMin ?? r.startMin + ASSUMED_LESSON_MIN });
  });
  timed.sort((a, b) => a.start - b.start || a.idx - b.idx);
  const bands: Entity[][] = [];
  let current: Entity[] | null = null;
  let currentEnd = -Infinity;
  timed.forEach(({ p, start, end }) => {
    if (current && start - currentEnd < gapMin) {
      current.push(p);
      currentEnd = Math.max(currentEnd, end);
    } else {
      current = [p];
      bands.push(current);
      currentEnd = end;
    }
  });
  if (untimed.length > 0) bands.push(untimed);
  return bands;
}

function parseYmdNoon(ymd: string): Date | null {
  const m = String(ymd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return dt.getMonth() === Number(m[2]) - 1 ? dt : null;
}

export function toYmd(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// 日付ラベル → 実日付 (YYYY-MM-DD)。本体の月間カレンダーと同じ決まり
// (courseDates.resolveDateLabelYmd) で置くので、調査票の曜日の列と本体の
// 「講」の日付が食い違わない。M/D として読めないラベルは null。
export function resolveCourseYmds(labels: string[], baseYmd: string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  (labels || []).forEach(label => out.set(label, resolveDateLabelYmd(label, baseYmd)));
  return out;
}

// タブの開始・終講の注記 ("中3開始" / "中3終講日")。日付ラベル → 注記の配列。
// 授業の時限を 1 つも使わないタブは載せない。1 日だけのタブはタブ名だけ。
export function computeTabMilestones(project: Pick<Project, 'dates' | 'periods' | 'tabs'>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const push = (label: string, note: string) => {
    if (!out.has(label)) out.set(label, []);
    out.get(label)!.push(note);
  };
  (project.tabs || []).forEach(tab => {
    if (activePeriodsForTab(project.periods, tab).length === 0) return;
    const dates = activeDatesForTab(project.dates, tab);
    if (dates.length === 0) return;
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (first.id === last.id) {
      push(first.label, tab.name);
      return;
    }
    push(first.label, `${tab.name}開始`);
    push(last.label, `${tab.name}終講日`);
  });
  return out;
}

export interface SurveyLayoutDay {
  /** カレンダー上の日付 (YYYY-MM-DD) */
  ymd: string;
  month: number;
  day: number;
  /** 0=日 .. 6=土 */
  weekday: number;
  /** プールにある日ならその調査日 (時限が 0 の日も含む)。プールに無い日は null */
  survey: SurveyDay | null;
  /** 時間帯のまとまりごとの、この日の時限 (上から詰める) */
  bandPeriods: Entity[][];
  /** タブの開始・終講の注記 */
  notes: string[];
}

export interface SurveyLayoutWeek {
  /** 週の月曜日 (YYYY-MM-DD) */
  mondayYmd: string;
  days: SurveyLayoutDay[];
  /** 時間帯のまとまりごとの行数 (その週で最も時限の多い日に合わせる。0 = この週は無い) */
  bandRows: number[];
}

export interface SurveyLayout {
  weeks: SurveyLayoutWeek[];
  /** 時間帯のまとまり (全期間) */
  bands: Entity[][];
  /** 日曜の列を出すか (日曜に授業のある日が 1 つでもあるとき) */
  includeSunday: boolean;
  /** 実日付に解決できなかった日 (M/D でないラベル)。紙面の末尾に並べる */
  unplaced: SurveyDay[];
}

// 調査票の紙面 (週 × 月〜土) を組む。調査票の Excel と入力画面が共有する。
// - 週は月曜始まり。授業 (時限) のある日が 1 つも無い週は飛ばす
// - 各週の各日は、時間帯のまとまりごとにその日の時限を上から詰める
//   (昼の部・夜の部の行が週の中で揃い、日によって時限の数が違っても崩れない)
export function buildSurveyLayout(
  surveyDays: SurveyDay[],
  { baseYmd, milestones }: { baseYmd: string; milestones?: Map<string, string[]> },
): SurveyLayout {
  const allPeriods: Entity[] = [];
  const seen = new Set<number>();
  surveyDays.forEach(sd => sd.periods.forEach(p => {
    if (!seen.has(p.id)) { seen.add(p.id); allPeriods.push(p); }
  }));
  const bands = groupPeriodsIntoBands(allPeriods);
  const bandOf = new Map<number, number>();
  bands.forEach((b, i) => b.forEach(p => bandOf.set(p.id, i)));

  // 置くのは授業のある日だけ。どのタブも使わない日 (前の季節の残り・作り直す
  // 前の既定の日付) は解決しない — 同じ実日付に当たる古いラベルに授業の日が
  // 押し出されないように
  const lessonDays = surveyDays.filter(sd => sd.periods.length > 0);
  const ymdByLabel = resolveCourseYmds(lessonDays.map(sd => sd.date.label), baseYmd);
  const byYmd = new Map<string, SurveyDay>();
  const unplaced: SurveyDay[] = [];
  lessonDays.forEach(sd => {
    const ymd = ymdByLabel.get(sd.date.label);
    // 読めないラベル・同じ実日付に当たる 2 つ目のラベルは週の枠に入れず、
    // 末尾に並べる (黙って調査票から落とさない)
    if (!ymd || byYmd.has(ymd)) {
      unplaced.push(sd);
      return;
    }
    byYmd.set(ymd, sd);
  });

  const includeSunday = [...byYmd.keys()].some(ymd => parseYmdNoon(ymd)?.getDay() === 0);

  // 授業のある日を含む週の月曜日
  const mondays: string[] = [];
  const mondaySet = new Set<string>();
  [...byYmd.keys()]
    .map(ymd => parseYmdNoon(ymd)!)
    .sort((a, b) => a.getTime() - b.getTime())
    .forEach(dt => {
      const monday = new Date(dt);
      monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      const key = toYmd(monday);
      if (!mondaySet.has(key)) { mondaySet.add(key); mondays.push(key); }
    });

  const weekLength = includeSunday ? 7 : 6;
  const weeks: SurveyLayoutWeek[] = mondays.map(mondayYmd => {
    const monday = parseYmdNoon(mondayYmd)!;
    const days: SurveyLayoutDay[] = [];
    for (let i = 0; i < weekLength; i++) {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + i);
      const ymd = toYmd(dt);
      const survey = byYmd.get(ymd) || null;
      const bandPeriods: Entity[][] = bands.map(() => []);
      survey?.periods.forEach(p => {
        const b = bandOf.get(p.id);
        if (b != null) bandPeriods[b].push(p);
      });
      days.push({
        ymd,
        month: dt.getMonth() + 1,
        day: dt.getDate(),
        weekday: dt.getDay(),
        survey,
        bandPeriods,
        notes: survey ? (milestones?.get(survey.date.label) || []) : [],
      });
    }
    const bandRows = bands.map((_, b) => Math.max(0, ...days.map(d => d.bandPeriods[b].length)));
    return { mondayYmd, days, bandRows };
  });

  return { weeks, bands, includeSunday, unplaced };
}
