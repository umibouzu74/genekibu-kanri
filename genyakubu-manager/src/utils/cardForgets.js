// ─── バイトのカード忘れ (出退勤のカードを通し忘れた日) ────────────────
// 出勤・退勤のときに通すカードの記録 (塾の別のシステム) を、給与の締めで経理が
// バイト出勤表と突き合わせる。カードを忘れた日はカードの記録が無いので、
// 責任者が「この日はカードを忘れたが出勤している」をここに残し、経理が
// バイト出勤表 (画面・印刷・Excel) と講師の月間で見られるようにする。
//
// 1 件 = 1 人 × 1 日 (同じ人・同じ日に入れ直すと置き換え。staffLeave と同じ)。
//   { id, name, date, missing, inTime?, outTime?, memo?, recordedAt? }
//   - missing … 打刻できなかったもの (CARD_MISSING: 出勤・退勤 / 出勤だけ / 退勤だけ)
//   - inTime / outTime … 実際の出勤・退勤の時刻 (任意、"16:50")。打刻できなかった
//     側だけ持つ (退勤だけ忘れた日の出勤はカードに残っている)
//   - recordedAt … 最後に記録した日時 (ISO 文字列)
// 空の値はキーごと持たない (RTDB は空を消す)。
//
// **出勤日数は変えない** (授業から数える。出勤表の数え方には関与しない)。
// 記録は閲覧者 (経理) も読める appData に置き、書くのは管理者だけ。

import { isValidDateStr } from "./dateHelpers";

export const CARD_MISSING = Object.freeze({ BOTH: "both", IN: "in", OUT: "out" });

/** 打刻できなかったものの選択肢 (並びは画面のボタンの順) */
export const CARD_MISSING_CHOICES = Object.freeze([
  { key: CARD_MISSING.BOTH, label: "出勤・退勤" },
  { key: CARD_MISSING.IN, label: "出勤だけ" },
  { key: CARD_MISSING.OUT, label: "退勤だけ" },
]);

const MISSING_BY_KEY = new Map(CARD_MISSING_CHOICES.map((c) => [c.key, c]));

/** 知らない値は「出勤・退勤」 */
export const cardMissingMeta = (key) => MISSING_BY_KEY.get(key) || MISSING_BY_KEY.get(CARD_MISSING.BOTH);

/** 出勤の時刻を持つか (出勤を打刻できなかったとき) */
export const missesIn = (missing) => missing !== CARD_MISSING.OUT;
/** 退勤の時刻を持つか (退勤を打刻できなかったとき) */
export const missesOut = (missing) => missing !== CARD_MISSING.IN;

// ─── 時刻 ─────────────────────────────────────────────────────────

/**
 * 入力された時刻を "16:50" に整える。全角数字・「時」「分」・区切りなしの
 * "1650"・"9:05" のゆれを吸収する (IME の素の入力 "１６：５０" をそのまま受ける)。
 * 空の入力は {ok: true, time: ""} (時刻なし)。
 * @param {string} input
 * @returns {{ok: true, time: string} | {ok: false, error: string}}
 */
export function normalizeClockTime(input) {
  const s = String(input ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/時/, ":")
    .replace(/分$/, "")
    .replace(".", ":");
  if (!s) return { ok: true, time: "" };
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(s) || /^(\d{1,2})(\d{2})$/.exec(s) || /^(\d{1,2}):?$/.exec(s);
  if (!m) return { ok: false, error: "時刻は「16:50」の形で入れてください" };
  const h = Number(m[1]);
  const mi = m[2] == null ? 0 : Number(m[2]);
  if (h > 23 || mi > 59) return { ok: false, error: "時刻は 0:00〜23:59 で入れてください" };
  return { ok: true, time: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` };
}

// ─── 保存の形 ───────────────────────────────────────────────────────

const str = (v) => (typeof v === "string" ? v.trim() : "");
const asList = (raw) =>
  Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];

/** 1 件を整える。形にならないものは null。空の値はキーごと落とす */
export function normalizeCardForget(r) {
  if (r == null || typeof r !== "object" || Array.isArray(r)) return null;
  const id = Number(r.id);
  if (!Number.isFinite(id)) return null;
  const name = str(r.name);
  const date = str(r.date);
  if (!name || !isValidDateStr(date)) return null;
  const missing = MISSING_BY_KEY.has(r.missing) ? r.missing : CARD_MISSING.BOTH;
  const out = { id, name, date, missing };
  const inTime = missesIn(missing) ? normalizeClockTime(r.inTime) : null;
  if (inTime?.ok && inTime.time) out.inTime = inTime.time;
  const outTime = missesOut(missing) ? normalizeClockTime(r.outTime) : null;
  if (outTime?.ok && outTime.time) out.outTime = outTime.time;
  const memo = str(r.memo);
  if (memo) out.memo = memo;
  const recordedAt = str(r.recordedAt);
  if (recordedAt) out.recordedAt = recordedAt;
  return out;
}

// 保存の並びは日付 → id (講師名の並びはよみ順なので、画面に出すときに
// cardForgetsInRange へ compareTeacherNames を渡して決める)
const byDateId = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);

/**
 * 保存値を整える (読み込み・同期のたび)。同じ人・同じ日が 2 件あれば後の方を残す。
 * 並びは日付 → id。
 */
export function migrateCardForgets(raw) {
  const byKey = new Map();
  for (const r of asList(raw)) {
    const rec = normalizeCardForget(r);
    if (rec) byKey.set(cardForgetKey(rec.name, rec.date), rec);
  }
  return [...byKey.values()].sort(byDateId);
}

export const cardForgetKey = (name, date) => `${name}\u0000${date}`;

/** (名前, 日付) → 記録 */
export function indexCardForgets(records) {
  const m = new Map();
  for (const r of records || []) m.set(cardForgetKey(r.name, r.date), r);
  return m;
}

/** その人・その日の記録 (無ければ null) */
export function findCardForget(records, name, date) {
  return (records || []).find((r) => r.name === name && r.date === date) || null;
}

// ─── 書き換え ───────────────────────────────────────────────────────

const nextId = (records) => records.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;

/**
 * 1 人 × 1 日の記録を入れる (同じ日にあれば置き換え。id はそのまま)。
 * missing が null なら消す。
 * @param {object[]} records 今の保存値
 * @param {{name: string, date: string, missing: string|null, inTime?: string, outTime?: string, memo?: string}} input
 * @param {{now?: Date}} [opts]
 */
export function setCardForget(records, { name, date, missing, inTime = "", outTime = "", memo = "" }, { now = new Date() } = {}) {
  const cur = migrateCardForgets(records);
  const n = str(name);
  if (!n || !isValidDateStr(date)) return cur;
  const existing = cur.find((r) => r.name === n && r.date === date);
  const rest = cur.filter((r) => r !== existing);
  if (!missing) return rest;
  const rec = normalizeCardForget({
    id: existing ? existing.id : nextId(cur),
    name: n,
    date,
    missing,
    inTime,
    outTime,
    memo,
    recordedAt: now.toISOString(),
  });
  return migrateCardForgets(rec ? [...rest, rec] : rest);
}

/** 1 件を消す */
export function removeCardForget(records, name, date) {
  return setCardForget(records, { name, date, missing: null });
}

/**
 * (名前, 日付) の記録を、前に控えておいた状態へ戻す (「元に戻す」用)。戻すのは
 * その (名前, 日付) だけなので、その間に入った他の人・他の日の記録は消さない
 * (保存値まるごとを書き戻さない。有給・半休の restoreLeaveRecords と同じ)。
 * @param {object[]} records 今の保存値
 * @param {string} name
 * @param {string} date
 * @param {object|null} previous 控えておいた記録 (その日に無かったなら null)
 */
export function restoreCardForget(records, name, date, previous) {
  const cur = migrateCardForgets(records);
  const kept = cur.filter((r) => !(r.name === name && r.date === date));
  if (!previous) return kept;
  // 控えた後に同じ id が別の記録に使われていたら付け直す
  const id = kept.some((r) => r.id === previous.id) ? nextId(kept) : previous.id;
  return migrateCardForgets([...kept, { ...previous, id }]);
}

// ─── 読む ───────────────────────────────────────────────────────────

/**
 * 期間 (両端を含む) の記録。日付 → 名前の順。名前の並びは compareName
 * (講師名なので teacherKana.compareTeacherNames を渡す。無ければ記録した順)
 * @param {object[]} records
 * @param {string} from
 * @param {string} to
 * @param {(a: string, b: string) => number} [compareName]
 */
export function cardForgetsInRange(records, from, to, compareName = null) {
  return (records || [])
    .filter((r) => r.date >= from && r.date <= to)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (compareName ? compareName(a.name, b.name) : 0) || a.id - b.id;
    });
}

/** "出勤 16:50 / 退勤 21:05" (時刻の無い側は書かない。どちらも無ければ "") */
export function cardForgetTimesText(rec) {
  const parts = [];
  if (rec?.inTime) parts.push(`出勤 ${rec.inTime}`);
  if (rec?.outTime) parts.push(`退勤 ${rec.outTime}`);
  return parts.join(" / ");
}

/** "出勤・退勤の打刻なし (出勤 16:50 / 退勤 21:05)。メモ" */
export function describeCardForget(rec) {
  if (!rec) return "";
  const times = cardForgetTimesText(rec);
  return (
    `${cardMissingMeta(rec.missing).label}の打刻なし` +
    (times ? ` (${times})` : "") +
    (rec.memo ? `。${rec.memo}` : "")
  );
}

/** 記録した日時 "10/27 18:05" (読めなければ "") */
export function formatRecordedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
