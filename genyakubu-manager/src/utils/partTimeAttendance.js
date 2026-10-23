// ─── バイトの出勤日数表 (給与用) ────────────────────────────────────
// バイトの給与は「出勤日数 × 単価」。手で作っていた月次の表
// (アルバイトコマ数YYYY.M.D-M.D.xlsx) を、授業時間の集計と同じ「実際に教えた
// 授業」から出す。画面 (授業時間の集計の「バイト出勤表」タブ) と Excel の
// 両方がこのモジュールの表データを使う。
//
// **表データは金額を持たない** (画面に金額・単価を出さない)。単価と金額は
// Excel の「金額入り」(開くのにパスワードが要る) にだけ入れる
// (utils/partTimeAttendanceExport)。
//
// **授業の拾い方は utils/teachingMinutes.computeTeachingMinutes に任せる**
// (代行・欠勤・振替・合同・休講・テスト期間・特別時程・時間割の有効期間・
// 特訓シフト・講習コマを反映した後の entries)。ここで授業を拾い直さない。
//
// 出勤日数の数え方 (1 日ごと):
//   1. その日の授業 (合計に含める種別だけ) を開始時刻順に並べる
//   2. 前の授業の終わりから次の授業の始まりまでが gapMinutes (既定 60 分) 以上
//      空いたら別の「かたまり」
//   3. 出勤日数 = かたまりの数。コマ数は関係ない (連続 3 コマでも 1、離れた
//      1 コマ + 1 コマは 2)。種別が混じっていても時刻だけで分ける
//   4. 「要確認」の印 (数は 1〜3 のまま): かたまりが 3 つ以上 / 時刻の読めない
//      授業がある (時刻の無い授業はかたまりを作らない。時刻のある授業が無い日は
//      1 として数える)
//   5. 1 日ずつ手で上書きできる (その月の表だけ。アプリのデータには書き戻さない)
//
// 既存の「出勤日数」(summarizeTeacherRow().days) は日付の数のままにしてある。

import { biweeklyPartner, splitTeacherField } from "./biweekly";
import { DAYS } from "../constants/schools";
import { dateToDay, isValidDateStr } from "./dateHelpers";
import { gradeToDept } from "./scheduleHelpers";
import { isTimetableActiveForDate } from "./timetable";
import { MINUTE_KINDS, currentPeriodYm } from "./teachingMinutes";

export const DEFAULT_GAP_MINUTES = 60;
export const DEFAULT_UNIT_PRICE = 5500;
// バイトの給与の締め日 (2026年10月分 = 9/21〜10/20)
export const DEFAULT_ATTENDANCE_CLOSING_DAY = 20;
// 空き時間のしきい値に選べる値 (分)
export const GAP_MINUTE_CHOICES = [30, 45, 60, 90, 120];
// 手での上書きに選べる値 (0 = その日は数えない)
export const OVERRIDE_CHOICES = [0, 1, 2, 3];
// 上書きを覚えておく期間の数 (古い月から捨てる。端末の保存領域を食わないように)
export const MAX_OVERRIDE_PERIODS = 12;

export const ATTENDANCE_FLAG = Object.freeze({
  MANY_BLOCKS: "manyBlocks",
  NO_TIME: "noTime",
});
export const ATTENDANCE_FLAG_LABELS = {
  [ATTENDANCE_FLAG.MANY_BLOCKS]: "時間の離れたかたまりが 3 つ以上",
  [ATTENDANCE_FLAG.NO_TIME]: "時刻の読めない授業がある",
};

const HM_RE = /^\s*(\d{1,2}):(\d{2})\s*$/;
function hmToMin(text) {
  const m = HM_RE.exec(String(text ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 47 || min > 59) return null;
  return h * 60 + min;
}

/** 分 → "14:00" */
export function minToHm(min) {
  if (min == null || !Number.isFinite(min)) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * "18:30-20:00" → {start: 1110, end: 1200}。開始だけ ("18:30") は end = null、
 * 読めなければ両方 null。終了が開始以前なら end = null (読めない扱い)。
 */
export function parseTimeRange(time) {
  const [a, b] = String(time ?? "").split(/[-〜~–]/);
  const start = hmToMin(a);
  if (start == null) return { start: null, end: null };
  const end = hmToMin(b);
  return { start, end: end != null && end > start ? end : null };
}

function sanitizeGap(gapMinutes) {
  const n = Number(gapMinutes);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GAP_MINUTES;
}

/**
 * 1 日ぶんの授業から出勤日数 (かたまりの数) を出す。entries は合計に含める
 * 種別だけに絞ってから渡す (この関数は種別を見ない)。
 *
 * @param {{time?: string}[]} entries その日の授業 (computeTeachingMinutes の entries)
 * @param {{gapMinutes?: number}} [opts]
 * @returns {{
 *   units: number,
 *   blocks: {start: string, end: string, entries: object[]}[],
 *   koma: number,
 *   flags: string[],
 *   untimed: object[],
 * }}
 *   - units: 出勤日数 (かたまりの数。授業なしは 0、時刻のある授業が無ければ 1)
 *   - blocks: かたまり (開始・終了の "H:MM"。終了の読めない授業で終わるときは
 *     その授業の開始を終わりとみなす)
 *   - koma: 授業の数
 *   - flags: ATTENDANCE_FLAG の値 (要確認の理由)
 *   - untimed: 開始時刻の読めない授業 (どのかたまりにも入れていない)
 */
export function countDayAttendance(entries, { gapMinutes = DEFAULT_GAP_MINUTES } = {}) {
  const gap = sanitizeGap(gapMinutes);
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const timed = [];
  const untimed = [];
  let missingEnd = false;
  for (const e of list) {
    const { start, end } = parseTimeRange(e.time);
    if (start == null) untimed.push(e);
    else {
      if (end == null) missingEnd = true;
      timed.push({ e, start, end: end ?? start });
    }
  }
  timed.sort((a, b) => a.start - b.start || a.end - b.end);

  const raw = [];
  for (const t of timed) {
    const cur = raw[raw.length - 1];
    // 重なっている (次の開始が今の終わりより前) ときも同じかたまり
    if (cur && t.start - cur.end < gap) {
      cur.end = Math.max(cur.end, t.end);
      cur.entries.push(t.e);
    } else {
      raw.push({ start: t.start, end: t.end, entries: [t.e] });
    }
  }
  const blocks = raw.map((b) => ({ start: minToHm(b.start), end: minToHm(b.end), entries: b.entries }));

  const flags = [];
  if (blocks.length >= 3) flags.push(ATTENDANCE_FLAG.MANY_BLOCKS);
  if (untimed.length > 0 || missingEnd) flags.push(ATTENDANCE_FLAG.NO_TIME);
  const units = list.length === 0 ? 0 : Math.max(blocks.length, 1);
  return { units, blocks, koma: list.length, flags, untimed };
}

const clean = (name) => String(name ?? "").trim();

/** partTimeStaff (旧形式 string[] / 新形式 {name}[]) → 名前の配列 (並び順のまま・重複なし) */
export function staffNamesOf(staff) {
  const out = [];
  const seen = new Set();
  for (const s of staff || []) {
    const name = clean(typeof s === "string" ? s : s?.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** 単価 (円)。0 以上の整数でなければ既定値 (Excel の金額入りを書き出すときだけ使う) */
export function sanitizeUnitPrice(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 10_000_000 ? n : DEFAULT_UNIT_PRICE;
}

/** 空き時間のしきい値 (分)。選べる値でなければ既定値 */
export function sanitizeGapMinutes(v) {
  const n = Number(v);
  return GAP_MINUTE_CHOICES.includes(n) ? n : DEFAULT_GAP_MINUTES;
}

function isOverrideValue(v) {
  return Number.isInteger(v) && v >= 0 && v <= 9;
}

/**
 * 上書きの保存形: { "<開始日>_<終了日>": { 講師名: { "YYYY-MM-DD": 0〜9 } } }。
 * 形の崩れたところは捨てる。
 */
export function sanitizeAttendanceOverrides(v) {
  const out = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [period, byTeacher] of Object.entries(v)) {
    if (!byTeacher || typeof byTeacher !== "object" || Array.isArray(byTeacher)) continue;
    const p = {};
    for (const [teacher, byDate] of Object.entries(byTeacher)) {
      if (!byDate || typeof byDate !== "object" || Array.isArray(byDate)) continue;
      const t = {};
      for (const [date, n] of Object.entries(byDate)) {
        if (isValidDateStr(date) && isOverrideValue(n)) t[date] = n;
      }
      if (Object.keys(t).length > 0) p[teacher] = t;
    }
    if (Object.keys(p).length > 0) out[period] = p;
  }
  return out;
}

/** 上書きを持つ期間のキー */
export function attendancePeriodKey(startDate, endDate) {
  return `${startDate}_${endDate}`;
}

/**
 * 1 日ぶんの上書きを入れる / 外す (value = null で外す)。新しいオブジェクトを返す。
 * 期間は MAX_OVERRIDE_PERIODS まで (開始日の新しい方から残す)。
 */
export function setAttendanceOverride(store, periodKey, teacher, date, value) {
  const next = sanitizeAttendanceOverrides(store);
  const period = { ...(next[periodKey] || {}) };
  const byDate = { ...(period[teacher] || {}) };
  if (value == null) delete byDate[date];
  else if (isOverrideValue(value)) byDate[date] = value;
  if (Object.keys(byDate).length > 0) period[teacher] = byDate;
  else delete period[teacher];
  if (Object.keys(period).length > 0) next[periodKey] = period;
  else delete next[periodKey];
  const keys = Object.keys(next).sort().reverse();
  for (const k of keys.slice(MAX_OVERRIDE_PERIODS)) delete next[k];
  return next;
}

/**
 * 画面と Excel の両方が使う表データ (日数まで。金額は持たない)。
 *
 * @param {object} args
 * @param {Map<string, {entries: object[]}>} args.rows computeTeachingMinutes の rows
 * @param {(string|{name: string})[]} args.staff バイト (LS.partTime の並び順のまま行にする)
 * @param {string[]} args.dates 期間の日付 (列)
 * @param {Iterable<string>} [args.included] 合計に含める種別 (既定 = 全種別)
 * @param {Record<string, Record<string, number>>} [args.overrides] 講師名 → 日付 → 手で決めた日数 (この期間のぶん)
 * @param {number} [args.gapMinutes] 別のかたまりにする空き時間 (分)
 */
export function buildPartTimeAttendanceSheet({
  rows,
  staff,
  dates = [],
  included = MINUTE_KINDS,
  overrides = {},
  gapMinutes = DEFAULT_GAP_MINUTES,
} = {}) {
  const inc = included instanceof Set ? included : new Set(included);
  const gap = sanitizeGap(gapMinutes);
  const dateSet = new Set(dates);
  const checks = [];
  const overridden = [];

  const sheetRows = staffNamesOf(staff).map((teacher) => {
    const byDate = new Map();
    for (const e of rows?.get?.(teacher)?.entries || []) {
      if (!dateSet.has(e.date)) continue;
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date).push(e);
    }
    const ov = overrides?.[teacher] || {};
    let days = 0;
    const cells = dates.map((date) => {
      const all = byDate.get(date) || [];
      const counted = all.filter((e) => inc.has(e.kind));
      const excluded = all.filter((e) => !inc.has(e.kind));
      const auto = countDayAttendance(counted, { gapMinutes: gap });
      const manual = ov[date];
      const isOverridden = isOverrideValue(manual);
      const units = isOverridden ? manual : auto.units;
      days += units;
      const cell = {
        date,
        units,
        auto: auto.units,
        overridden: isOverridden,
        flags: auto.flags,
        needsCheck: auto.flags.length > 0,
        blocks: auto.blocks,
        untimed: auto.untimed,
        koma: auto.koma,
        entries: counted,
        excluded,
      };
      if (cell.needsCheck) checks.push({ teacher, date, flags: auto.flags, units, auto: auto.units });
      if (isOverridden) overridden.push({ teacher, date, units, auto: auto.units });
      return cell;
    });
    return { teacher, cells, days };
  });

  const totalDays = sheetRows.reduce((s, r) => s + r.days, 0);
  return {
    dates,
    gapMinutes: gap,
    rows: sheetRows,
    totalDays,
    checks,
    overridden,
  };
}

// ─── 担当の目安 (「（火H2・水T3・木T3・金H2）」) ──────────────────────

// "中3" → [3]、"中1-3" → [1,2,3]、"高1高2" → [1,2]
function gradeNumbers(grade) {
  const g = String(grade ?? "");
  const range = /(\d)\s*[-〜~～]\s*(\d)/.exec(g);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a <= b) return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return [...new Set((g.match(/\d/g) || []).map(Number))];
}

/**
 * コマの区分。中学 = T、高校 = H、中学のプレップ (中1-3 のプレップ個別指導) = P。
 * 決められなければ null。
 */
export function dutyTokenOf(slot) {
  const grade = String(slot?.grade ?? "");
  const dept = grade ? gradeToDept(grade) : null;
  const isPrep = /プレップ/.test(`${slot?.note ?? ""} ${slot?.subj ?? ""}`);
  if (dept === "中学部" && isPrep) return { kind: "P", grades: [] };
  const grades = gradeNumbers(grade);
  if (dept === "中学部" && grades.length > 0) return { kind: "T", grades };
  if (dept === "高校部" && grades.length > 0) return { kind: "H", grades };
  return null;
}

/**
 * バイトごとの担当の目安。期間中に有効な通常の時間割から曜日ごとに作る
 * (例: 金曜に中1と中3 →「金T1.3」、土曜に中3とプレップ →「土T3.P」)。
 * 複数講師のコマは splitTeacherField で分け、隔週の相手 (B 週) も担当に入れる。
 *
 * @param {{slots?: object[], timetables?: object[], staffNames: string[], dates: string[]}} args
 * @returns {Map<string, string>} 名前 → 「（火H2・水T3）」(作れないときは "")
 */
export function buildDutyHints({ slots = [], timetables = [], staffNames = [], dates = [] }) {
  const names = new Set(staffNames);
  const datesByDay = new Map();
  for (const d of dates) {
    const dow = dateToDay(d);
    if (!dow) continue;
    if (!datesByDay.has(dow)) datesByDay.set(dow, []);
    datesByDay.get(dow).push(d);
  }
  const timetableById = new Map((timetables || []).map((t) => [t.id, t]));
  // 名前 → 曜日 → { T: Set, H: Set, P: bool }
  const acc = new Map();
  for (const slot of slots || []) {
    const dayDates = datesByDay.get(slot?.day);
    if (!dayDates) continue;
    const active =
      timetableById.size === 0 ||
      dayDates.some((d) =>
        isTimetableActiveForDate(timetableById.get(slot.timetableId ?? 1), d, slot.grade)
      );
    if (!active) continue;
    const token = dutyTokenOf(slot);
    if (!token) continue;
    const people = new Set(splitTeacherField(slot.teacher));
    const partner = biweeklyPartner(slot.note);
    if (partner) people.add(partner);
    for (const name of people) {
      if (!names.has(name)) continue;
      if (!acc.has(name)) acc.set(name, new Map());
      const byDay = acc.get(name);
      if (!byDay.has(slot.day)) byDay.set(slot.day, { T: new Set(), H: new Set(), P: false });
      const d = byDay.get(slot.day);
      if (token.kind === "P") d.P = true;
      else for (const g of token.grades) d[token.kind].add(g);
    }
  }
  const out = new Map();
  for (const name of staffNames) {
    const byDay = acc.get(name);
    const parts = [];
    for (const day of DAYS) {
      const d = byDay?.get(day);
      if (!d) continue;
      const seg = [];
      if (d.T.size > 0) seg.push(`T${[...d.T].sort((a, b) => a - b).join(".")}`);
      if (d.H.size > 0) seg.push(`H${[...d.H].sort((a, b) => a - b).join(".")}`);
      if (d.P) seg.push("P");
      if (seg.length > 0) parts.push(`${day}${seg.join(".")}`);
    }
    out.set(name, parts.length > 0 ? `（${parts.join("・")}）` : "");
  }
  return out;
}

/**
 * 締め終わった最新の「◯月分」(その日を含む月分の 1 つ前)。給与を締めるのは
 * 締め日の後なので、バイト出勤表を初めて開いたときはこの月から見せる
 * (20 日締めの 10/23 → 10 月分 = 9/21〜10/20。締め日当日の 10/20 は 9 月分)。
 * @param {string} todayStr "YYYY-MM-DD"
 * @param {number} closingDay
 * @returns {{y: number, m: number}}
 */
export function latestClosedPeriodYm(todayStr, closingDay) {
  const cur = currentPeriodYm(todayStr, closingDay);
  if (!Number.isFinite(cur.y)) return cur;
  return cur.m === 1 ? { y: cur.y - 1, m: 12 } : { y: cur.y, m: cur.m - 1 };
}

/**
 * Excel のファイル名。2026-09-21〜2026-10-20 → "アルバイトコマ数2026.9.21-10.20.xlsx"
 * (金額入り = 手で作っていた表と同じ名前)。金額なしは "…_日数のみ.xlsx"
 * @param {string} startDate
 * @param {string} endDate
 * @param {{withAmounts?: boolean}} [opts]
 */
export function attendanceFileName(startDate, endDate, { withAmounts = true } = {}) {
  const suffix = withAmounts ? "" : "_日数のみ";
  const [y, m, d] = String(startDate || "").split("-").map(Number);
  const [, m2, d2] = String(endDate || "").split("-").map(Number);
  if (!y || !m || !d || !m2 || !d2) return `アルバイトコマ数${suffix}.xlsx`;
  return `アルバイトコマ数${y}.${m}.${d}-${m2}.${d2}${suffix}.xlsx`;
}
