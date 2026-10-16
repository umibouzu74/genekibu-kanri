// ─── 有給・半休 (常勤の休暇の記録) ───────────────────────────────────
// 現役部の常勤 (講師の所属で「現役部 常勤」の人。utils/teacherAffiliations の
// tracksLeave) が、いつ有給・半休を取ったかを日付ごとに記録する。
//
//   records … 1 人 × 1 日に 1 件 { id, name, date, kind, memo? }
//             同じ日を入れ直したら置き換え (午前半休 → 有給に変える、など)
//   grants  … 年度ごとの持ち日数 (付与 + 繰越) { name, year, days }。
//             任意。入れてあれば年度のまとめに「残り」を出す
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

/**
 * 保存値を整える (冪等)。RTDB が空の配列を消すので、欠けていれば空で補う。
 * 同じ (講師, 日付) の記録・同じ (講師, 年度) の持ち日数は後勝ち。
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
  return {
    records: [...recByKey.values()].sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id - b.id
    ),
    grants: [...grantByKey.values()].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    ),
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
 * 期間で入れるときの日付 (日曜を除くかを選べる)。上限を超えたら errors。
 * @returns {{dates: string[], errors: string[]}}
 */
export function leaveRangeDates(fromDate, toDate, { skipSundays = true } = {}) {
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
  const dates = skipSundays ? all.filter((d) => dateToDay(d) != null) : all;
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
