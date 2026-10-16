// ─── 有給・半休 (常勤の休暇の記録) ───────────────────────────────────
// 現役部の常勤 (講師の所属で「現役部 常勤」の人。utils/teacherAffiliations の
// tracksLeave) が、いつ有給・半休を取ったかを日付ごとに記録する。
//
//   records … 1 人 × 1 日に 1 件 { id, name, date, kind, memo? }
//             同じ日を入れ直したら置き換え (午前半休 → 有給に変える、など)
//   grants  … 年度ごとの持ち日数 (付与 + 繰越) { name, year, days }。
//             任意。入れてあれば年度のまとめに「残り」を出す
//   calendars    … 年度ごとの教員用の年間カレンダー (予定表の Excel から取り込む。
//                  utils/yoteihyo/annualCalendarSheet.calendarForLeave)。
//                  { year, source?, importedAt?, patterns: [{key, label, offDates, total?}],
//                    days: [{date, kind?, holiday?, event?}], notes }
//                  patterns = 休みの型 (「土日 休み」「日月 休み」) ごとの公休の日
//   workPatterns … 人ごとの休みの型。講師の所属と同じく「この年度からこの型」の
//                  変更だけを持つ { name, fromYear, pattern }。pattern は型の key
//                  (「土日」) か "none" (型なし = 公休を出さない)
//   calendars / workPatterns は空ならキーごと持たない (取り込む前の形のまま)
//
// 数え方: 有給 = 1 日、午前半休 / 午後半休 = 0.5 日。「その他の休み」(代休・
// 特別休暇など) は有給の日数には数えず、別に数える。集計の区切りは年度
// (4 月始まり。講師の所属と同じ)。
//
// **授業の欠勤とは別物**。有給の日に担当のコマがあれば、代行・欠勤の登録は
// これまでどおり欠勤組み換え / 複数日の欠勤登録で行う (このモジュールは
// 代行レコードを作らない)。画面はその日のコマに登録が無ければ知らせる。
//
// 保存先は管理者だけが読める adminData/ (useAppData)。閲覧者 (匿名ログイン)
// は appData/ を全部読めるので、人事の記録はそちらに置かない。

import { dateToDay, eachDateStrInRange, isValidDateStr } from "./dateHelpers";
import { fiscalYearOf, fiscalYearRange } from "./teacherAffiliations";

/**
 * 休暇の種類 (画面の並び順)。
 *   days  … 有給の日数に数える量 (その他の休みは 0 = 有給に数えない)
 *   short … 月の表のマスに出す 1 文字
 */
export const LEAVE_KINDS = Object.freeze([
  Object.freeze({
    key: "full",
    label: "有給",
    short: "有",
    days: 1,
    desc: "1 日休み",
    tone: { bg: "#d8f0dd", fg: "#1f6a3a", border: "#7cc08e" },
  }),
  Object.freeze({
    key: "am",
    label: "午前半休",
    short: "前",
    days: 0.5,
    desc: "前半だけ休み",
    tone: { bg: "#e4f1fb", fg: "#1f5a8a", border: "#8fbde0" },
  }),
  Object.freeze({
    key: "pm",
    label: "午後半休",
    short: "後",
    days: 0.5,
    desc: "後半だけ休み",
    tone: { bg: "#fff0dc", fg: "#9a5200", border: "#f0b468" },
  }),
  Object.freeze({
    key: "other",
    label: "その他の休み",
    short: "他",
    days: 0,
    desc: "代休・特別休暇など (有給に数えない)",
    tone: { bg: "#efe9f7", fg: "#5a3a8e", border: "#c2acdf" },
  }),
]);

const KIND_BY_KEY = new Map(LEAVE_KINDS.map((k) => [k.key, k]));

/** 種類の定義。知らない key は「その他の休み」扱い */
export const leaveKindMeta = (key) => KIND_BY_KEY.get(key) || KIND_BY_KEY.get("other");

/** 一度に登録できる最大日数 (期間で入れるとき。誤って 1 年分を作らない) */
export const LEAVE_RANGE_MAX_DAYS = 31;

export const EMPTY_STAFF_LEAVE = Object.freeze({
  records: Object.freeze([]),
  grants: Object.freeze([]),
});

/**
 * 年間カレンダーの日の意味 (凡例の色から読む。utils/yoteihyo/annualCalendarSheet)。
 *   closed = 予備校授業なし→現役生も休み / open = 予備校授業あり→現役生も授業可能
 */
export const CALENDAR_DAY_KINDS = Object.freeze({
  closed: "塾の休み",
  open: "授業可能",
  half: "教員半休",
});

/** 休みの型を「なし」にした印 (前の年度の型を引き継がない) */
export const NO_WORK_PATTERN = "none";

// ─── 保存の形 ───────────────────────────────────────────────────────

const str = (v) => (typeof v === "string" ? v.trim() : "");
const asList = (raw) =>
  Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];

/** 1 件を整える。形にならないものは null。空の memo はキーごと落とす */
export function normalizeLeaveRecord(r) {
  if (r == null || typeof r !== "object" || Array.isArray(r)) return null;
  const id = Number(r.id);
  if (!Number.isFinite(id)) return null;
  const name = str(r.name);
  const date = str(r.date);
  if (!name || !isValidDateStr(date)) return null;
  const kind = KIND_BY_KEY.has(r.kind) ? r.kind : "other";
  const out = { id, name, date, kind };
  const memo = str(r.memo);
  if (memo) out.memo = memo;
  return out;
}

function normalizeGrant(g) {
  if (g == null || typeof g !== "object" || Array.isArray(g)) return null;
  const name = str(g.name);
  const year = Number(g.year);
  const days = Number(g.days);
  if (!name || !Number.isInteger(year) || !Number.isFinite(days) || days < 0) return null;
  // 0.5 日刻み (半休の単位) に丸める
  return { name, year, days: Math.round(days * 2) / 2 };
}

const CALENDAR_DAY_KIND_KEYS = new Set(Object.keys(CALENDAR_DAY_KINDS));

function normalizeCalendar(c) {
  if (c == null || typeof c !== "object" || Array.isArray(c)) return null;
  const year = Number(c.year);
  if (!Number.isInteger(year)) return null;
  const patterns = [];
  for (const p of asList(c.patterns)) {
    const key = str(p?.key);
    if (!key || key === NO_WORK_PATTERN || patterns.some((x) => x.key === key)) continue;
    const offDates = [...new Set(asList(p.offDates).map(str).filter(isValidDateStr))].sort();
    const total = Number(p.total);
    patterns.push({
      key,
      label: str(p.label) || key,
      offDates,
      ...(Number.isFinite(total) && total >= 0 ? { total } : {}),
    });
  }
  const dayByDate = new Map();
  for (const d of asList(c.days)) {
    const date = str(d?.date);
    if (!isValidDateStr(date)) continue;
    const kind = CALENDAR_DAY_KIND_KEYS.has(d.kind) ? d.kind : null;
    const event = str(d.event).slice(0, 100);
    if (!kind && d.holiday !== true && !event) continue;
    dayByDate.set(date, {
      date,
      ...(kind ? { kind } : {}),
      ...(d.holiday === true ? { holiday: true } : {}),
      ...(event ? { event } : {}),
    });
  }
  const notes = [...new Set(asList(c.notes).map(str).filter(Boolean))];
  const source = str(c.source);
  const importedAt = str(c.importedAt);
  return {
    year,
    ...(source ? { source } : {}),
    ...(importedAt ? { importedAt } : {}),
    patterns,
    days: [...dayByDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    notes,
  };
}

function normalizeWorkPattern(w) {
  if (w == null || typeof w !== "object" || Array.isArray(w)) return null;
  const name = str(w.name);
  const fromYear = Number(w.fromYear);
  const pattern = str(w.pattern);
  if (!name || !Number.isInteger(fromYear) || !pattern) return null;
  return { name, fromYear, pattern };
}

/**
 * 保存値を整える (冪等)。RTDB が空の配列を消すので、欠けていれば空で補う。
 * 同じ (講師, 日付) の記録・同じ (講師, 年度) の持ち日数は後勝ち。
 * 年間カレンダーは年度ごとに 1 つ、休みの型は (講師, 年度) ごとに 1 つ (後勝ち)。
 */
export function migrateStaffLeave(raw) {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const recByKey = new Map();
  const seenIds = new Set();
  for (const r of asList(obj.records)) {
    const v = normalizeLeaveRecord(r);
    if (!v || seenIds.has(v.id)) continue;
    seenIds.add(v.id);
    recByKey.set(`${v.name}\u0000${v.date}`, v);
  }
  const grantByKey = new Map();
  for (const g of asList(obj.grants)) {
    const v = normalizeGrant(g);
    if (v) grantByKey.set(`${v.name}\u0000${v.year}`, v);
  }
  const calByYear = new Map();
  for (const c of asList(obj.calendars)) {
    const v = normalizeCalendar(c);
    if (v) calByYear.set(v.year, v);
  }
  const patByKey = new Map();
  for (const w of asList(obj.workPatterns)) {
    const v = normalizeWorkPattern(w);
    if (v) patByKey.set(`${v.name}\u0000${v.fromYear}`, v);
  }
  const byNameYear = (a, b) =>
    a.name !== b.name ? (a.name < b.name ? -1 : 1) : a.fromYear - b.fromYear;
  return {
    records: [...recByKey.values()].sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id - b.id
    ),
    grants: [...grantByKey.values()].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    ),
    ...(calByYear.size
      ? { calendars: [...calByYear.values()].sort((a, b) => a.year - b.year) }
      : {}),
    ...(patByKey.size ? { workPatterns: [...patByKey.values()].sort(byNameYear) } : {}),
  };
}

// ─── 書き換え ───────────────────────────────────────────────────────

const nextId = (records) => records.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;

/**
 * 1 人 × 1 日の休暇を入れる (同じ日にあれば置き換え。id はそのまま)。
 * kind が null なら消す。
 */
export function setLeave(leave, { name, date, kind, memo = "" }) {
  const cur = migrateStaffLeave(leave);
  const n = str(name);
  if (!n || !isValidDateStr(date)) return cur;
  const existing = cur.records.find((r) => r.name === n && r.date === date);
  const rest = cur.records.filter((r) => r !== existing);
  if (!kind) return { ...cur, records: rest };
  const rec = normalizeLeaveRecord({
    id: existing ? existing.id : nextId(cur.records),
    name: n,
    date,
    kind,
    memo,
  });
  return migrateStaffLeave({ ...cur, records: rec ? [...rest, rec] : rest });
}

/** 1 件を消す */
export function removeLeave(leave, name, date) {
  return setLeave(leave, { name, date, kind: null });
}

/**
 * 期間で入れるときの日付 (休みの日を除くかを選べる)。上限を超えたら errors。
 * 除く日は既定で日曜。isOff (日付 → 休みか) を渡すとそちらで決める
 * (年間カレンダーの公休。offDayPredicate)。
 * @returns {{dates: string[], errors: string[]}}
 */
export function leaveRangeDates(fromDate, toDate, { skipSundays = true, isOff = null } = {}) {
  const errors = [];
  if (!isValidDateStr(fromDate)) errors.push("開始日を入れてください");
  if (!isValidDateStr(toDate)) errors.push("終了日を入れてください");
  if (errors.length === 0 && toDate < fromDate) errors.push("終了日は開始日以降にしてください");
  if (errors.length > 0) return { dates: [], errors };
  const all = eachDateStrInRange(fromDate, toDate);
  if (all.length > LEAVE_RANGE_MAX_DAYS) {
    return { dates: [], errors: [`一度に入れられるのは ${LEAVE_RANGE_MAX_DAYS} 日までです`] };
  }
  // dateToDay は月〜土の曜日 / 日曜は null
  const off = isOff || ((d) => dateToDay(d) == null);
  const dates = skipSundays ? all.filter((d) => !off(d)) : all;
  return { dates, errors: dates.length === 0 ? ["入れる日がありません"] : [] };
}

/** 複数の日にまとめて同じ休暇を入れる (それぞれ置き換え) */
export function setLeaveForDates(leave, { name, dates, kind, memo = "" }) {
  let cur = migrateStaffLeave(leave);
  for (const date of dates || []) cur = setLeave(cur, { name, date, kind, memo });
  return cur;
}

/**
 * (講師, 日付) の記録を、前に控えておいた状態へ戻す (「元に戻す」用)。
 * 戻すのは控えた (講師, 日付) だけなので、その間に入った他の人・他の日の
 * 記録は消さない (保存値まるごとを書き戻さない)。
 * @param {object} leave 今の保存値
 * @param {string} name
 * @param {string[]} dates 戻す日付
 * @param {object[]} previous 控えておいた記録 (その日に無かったなら含めない)
 */
export function restoreLeaveRecords(leave, name, dates, previous) {
  const cur = migrateStaffLeave(leave);
  const ds = new Set(dates);
  const kept = cur.records.filter((r) => !(r.name === name && ds.has(r.date)));
  const used = new Set(kept.map((r) => r.id));
  let max = nextId([...kept, ...(previous || [])]) - 1;
  const back = (previous || []).map((r) => {
    // 控えた後に同じ id が別の記録に使われていたら付け直す
    if (used.has(r.id)) return { ...r, id: ++max };
    used.add(r.id);
    return r;
  });
  return migrateStaffLeave({ ...cur, records: [...kept, ...back] });
}

/** (講師, 日付) の今の記録 (「元に戻す」のために控える) */
export function leaveRecordsFor(leave, name, dates) {
  const ds = new Set(dates);
  return (leave?.records || []).filter((r) => r.name === name && ds.has(r.date));
}

/** その年度の持ち日数 (無ければ null) */
export function grantFor(leave, name, year) {
  const g = (leave?.grants || []).find((x) => x.name === name && x.year === year);
  return g ? g.days : null;
}

/** 年度の持ち日数を入れる (null / 空で消す) */
export function setGrant(leave, name, year, days) {
  const cur = migrateStaffLeave(leave);
  const rest = cur.grants.filter((g) => !(g.name === name && g.year === year));
  const v = days === null || days === "" ? null : normalizeGrant({ name, year, days });
  return migrateStaffLeave({ ...cur, grants: v ? [...rest, v] : rest });
}

// ─── 読む ───────────────────────────────────────────────────────────

/** (講師, 日付) → 記録。月の表のマスを O(1) で引くための索引 */
export function indexLeaveRecords(records) {
  const m = new Map();
  for (const r of records || []) m.set(`${r.name}\u0000${r.date}`, r);
  return m;
}

export const leaveKey = (name, date) => `${name}\u0000${date}`;

/** 期間内の記録 (日付順) */
export function recordsInRange(records, from, to, names = null) {
  const only = names ? new Set(names) : null;
  return (records || [])
    .filter((r) => r.date >= from && r.date <= to && (!only || only.has(r.name)))
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id - b.id));
}

/**
 * 記録を数える。
 * @returns {{paidDays: number, full: number, am: number, pm: number, other: number}}
 *   paidDays = 有給の日数 (有給 1 + 半休 0.5)
 */
export function countLeave(records) {
  const out = { paidDays: 0, full: 0, am: 0, pm: 0, other: 0 };
  for (const r of records || []) {
    const k = leaveKindMeta(r.kind);
    out[k.key] += 1;
    out.paidDays += k.days;
  }
  return out;
}

/** 日数の表記 (0.5 刻み)。3 → "3"、3.5 → "3.5" */
export const fmtLeaveDays = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * 年度のまとめ (講師ごと)。月 (4 月 → 3 月) ごとの有給の日数・合計・持ち日数・残り。
 * @param {object} leave
 * @param {string[]} names
 * @param {number} year 年度
 * @returns {{name: string, byMonth: number[], counts: object, grant: number|null, remaining: number|null}[]}
 */
export function summarizeYear(leave, names, year) {
  const { start, end } = fiscalYearRange(year);
  const inYear = recordsInRange(leave?.records, start, end, names);
  return (names || []).map((name) => {
    const mine = inYear.filter((r) => r.name === name);
    const byMonth = Array(12).fill(0);
    for (const r of mine) {
      const m = Number(r.date.slice(5, 7));
      byMonth[(m + 8) % 12] += leaveKindMeta(r.kind).days;
    }
    const counts = countLeave(mine);
    const grant = grantFor(leave, name, year);
    return {
      name,
      byMonth,
      counts,
      grant,
      remaining: grant == null ? null : grant - counts.paidDays,
    };
  });
}

/** 年度の月の並び (4 月 → 3 月) */
export const FISCAL_MONTHS = Object.freeze([4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]);

/** 記録のある年度 (新しい順)。年度の選択肢に出す */
export function yearsWithLeave(leave) {
  const ys = new Set();
  for (const r of leave?.records || []) {
    const y = fiscalYearOf(r.date);
    if (y != null) ys.add(y);
  }
  for (const g of leave?.grants || []) ys.add(g.year);
  return [...ys].sort((a, b) => b - a);
}

/**
 * 今日から days 日のうちに休暇のある人 (ダッシュボードの「近日の休暇」)。
 * @returns {{date: string, records: object[]}[]} 日付順、記録のある日だけ
 */
export function upcomingLeave(leave, todayStr, days = 7) {
  if (!isValidDateStr(todayStr)) return [];
  const base = new Date(`${todayStr}T12:00:00`);
  const end = new Date(base);
  end.setDate(end.getDate() + days - 1);
  const pad = (n) => String(n).padStart(2, "0");
  const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  const byDate = new Map();
  for (const r of recordsInRange(leave?.records, todayStr, endStr)) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  return [...byDate.entries()].map(([date, records]) => ({ date, records }));
}

// ─── 年間カレンダー (常勤の公休) ─────────────────────────────────────
// 予定表の Excel に入っている教員用の年間カレンダー (「土日 休み」「日月 休み」の
// 列に公休の印) を年度ごとに取り込み、人ごとの休みの型 (土日 / 日月) と合わせて
// 「その人のその日は公休か」を出す。月の表で公休の日を薄く見せ、期間で入れる
// ときに公休を除く (有給の日数に公休を数えない)。
//
// 型の決め方は講師の所属と同じ「この年度からこの型」。年間カレンダーは年度ごと
// (前の年度のカレンダーは翌年度に使わない — 祝日も塾の休みも年度で違う)。

/** その年度の年間カレンダー (無ければ null) */
export function calendarFor(leave, year) {
  return (leave?.calendars || []).find((c) => c.year === year) || null;
}

/** 年間カレンダーを入れる (同じ年度のものは置き換え) */
export function setCalendar(leave, calendar) {
  const cur = migrateStaffLeave(leave);
  const v = normalizeCalendar(calendar);
  if (!v) return cur;
  const rest = (cur.calendars || []).filter((c) => c.year !== v.year);
  return migrateStaffLeave({ ...cur, calendars: [...rest, v] });
}

/**
 * 年度の年間カレンダーを、控えておいた状態へ戻す (「元に戻す」・外す)。
 * previous に無い年度は外す。控えた年度以外のカレンダーには触らない。
 */
export function restoreCalendars(leave, years, previous) {
  const cur = migrateStaffLeave(leave);
  const ys = new Set(years);
  const kept = (cur.calendars || []).filter((c) => !ys.has(c.year));
  return migrateStaffLeave({ ...cur, calendars: [...kept, ...(previous || [])] });
}

// カレンダー → 型ごとの公休の Set・日付 → 日。カレンダーは保存値の中の
// オブジェクトなので、同じものなら作り直さない
const calendarIndexCache = new WeakMap();
export function calendarIndex(calendar) {
  if (!calendar) return null;
  let idx = calendarIndexCache.get(calendar);
  if (!idx) {
    idx = {
      offByPattern: new Map((calendar.patterns || []).map((p) => [p.key, new Set(p.offDates)])),
      patternByKey: new Map((calendar.patterns || []).map((p) => [p.key, p])),
      dayByDate: new Map((calendar.days || []).map((d) => [d.date, d])),
    };
    calendarIndexCache.set(calendar, idx);
  }
  return idx;
}

/** その年度のその人の休みの型の key (前の年度から引き継ぐ。無し / "none" は null) */
export function workPatternFor(leave, name, year) {
  let best = null;
  for (const w of leave?.workPatterns || []) {
    if (w.name !== name || w.fromYear > year) continue;
    if (!best || w.fromYear > best.fromYear) best = w;
  }
  return best && best.pattern !== NO_WORK_PATTERN ? best.pattern : null;
}

/**
 * その年度からの休みの型を入れる。pattern は型の key / NO_WORK_PATTERN (なし)。
 * 前の年度から引き継ぐ型と同じなら、その年度の変更は持たない (最小の形)。
 */
export function setWorkPattern(leave, name, year, pattern) {
  const cur = migrateStaffLeave(leave);
  const n = str(name);
  if (!n || !Number.isInteger(year)) return cur;
  const rest = (cur.workPatterns || []).filter((w) => !(w.name === n && w.fromYear === year));
  const inherited = workPatternFor({ workPatterns: rest }, n, year) || NO_WORK_PATTERN;
  const want = str(pattern) || NO_WORK_PATTERN;
  const next = want === inherited ? rest : [...rest, { name: n, fromYear: year, pattern: want }];
  return migrateStaffLeave({ ...cur, workPatterns: next });
}

/**
 * その人のその日の公休。年間カレンダーと休みの型の両方がそろったときだけ答える。
 * @returns {null | {off: boolean, pattern: string, label: string}}
 */
export function publicOffOf(leave, name, date) {
  const year = fiscalYearOf(date);
  if (year == null) return null;
  const idx = calendarIndex(calendarFor(leave, year));
  if (!idx) return null;
  const pattern = workPatternFor(leave, name, year);
  const p = pattern ? idx.patternByKey.get(pattern) : null;
  if (!p) return null;
  return { off: idx.offByPattern.get(pattern).has(date), pattern, label: p.label };
}

/** 年間カレンダーのその日 ({kind?, holiday?, event?}。無ければ null) */
export function calendarDayOf(leave, date) {
  const year = fiscalYearOf(date);
  if (year == null) return null;
  return calendarIndex(calendarFor(leave, year))?.dayByDate.get(date) || null;
}

/**
 * 期間で入れるときに除く日 (leaveRangeDates の isOff)。年間カレンダーと休みの型が
 * そろう年度は公休、そろわない年度は日曜。どの日もそろわなければ null
 * (呼び出し側は「日曜を除く」のまま)。
 */
export function offDayPredicate(leave, name, from, to) {
  if (!isValidDateStr(from) || !isValidDateStr(to)) return null;
  const years = new Set([fiscalYearOf(from), fiscalYearOf(to)]);
  const any = [...years].some((y) => {
    const idx = calendarIndex(calendarFor(leave, y));
    const pattern = workPatternFor(leave, name, y);
    return !!(idx && pattern && idx.patternByKey.has(pattern));
  });
  if (!any) return null;
  return (date) => {
    const info = publicOffOf(leave, name, date);
    return info ? info.off : dateToDay(date) == null;
  };
}

/**
 * その年度のその人の公休の日数 (表の「年間の休日数」があればそれ、無ければ印の数)。
 * 年間カレンダーか休みの型が無ければ null
 */
export function publicOffCount(leave, name, year) {
  const idx = calendarIndex(calendarFor(leave, year));
  const pattern = workPatternFor(leave, name, year);
  const p = idx && pattern ? idx.patternByKey.get(pattern) : null;
  if (!p) return null;
  return p.total ?? p.offDates.length;
}
