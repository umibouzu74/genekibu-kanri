// ─── 予備校部の予定 (年間カレンダーの上半分) ─────────────────────────
// 予備校部の「年間行事予定表 (教員用)」を写す。1 件 = 期間 × 種別 × 名称:
//   { id, name, startDate, endDate, kind, memo?, source? }
// kind は constants/yobikoEvents (休校日・出勤者休日・授業なしの登校日・
// 入寮日 = 日付の塗り / 行事 = 名称を欄に出す)。日の種別の行は名称が空でも
// よい (表示は種別の名前)。
//
// 現役部の特別イベント (specialEvents) とは別に持つ。特別イベントは講師の
// 月間・週間・ダッシュボード・附属の授業予定など多くの画面が読むので、
// 部門の印で混ぜると予備校部の予定が現役部の画面に漏れる。年間カレンダー
// 以外の画面はこれを読まない (2026-10-21 確定: まずはカレンダーだけ)。
//
// 予定の入れ方は特別イベントと同じく「表を貼ってまとめて登録」が主
// (予定表の写真・PDF を Claude が読んで表にする)。読み取りの汎用部分
// (parseTsvTable / parseFlexibleDate) は utils/specialEventImport を使う。

import {
  DEFAULT_YOBIKO_EVENT_KIND,
  YOBIKO_EVENT_KINDS,
  YOBIKO_EVENT_KIND_BY_KEY,
  isYobikoDayMark,
  yobikoKindMeta,
} from "../constants/yobikoEvents";
import { isValidDateStr } from "./dateHelpers";
import { parseFlexibleDate, parseTsvTable } from "./specialEventImport";

const plain = (s) => String(s ?? "").trim();

/** 欄・一覧に出す名前 (日の種別で名称が空なら種別の名前) */
export function yobikoEventLabel(ev) {
  return plain(ev?.name) || yobikoKindMeta(ev?.kind).label;
}

/**
 * 読み込んだ値を正しい形に揃える (RTDB は空文字のキーを落とさないが、
 * 古い端末・手で直したバックアップでも崩れないように)。読めない行は捨てる
 */
export function migrateYobikoEvents(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach((ev, i) => {
    if (!ev || typeof ev !== "object") return;
    const startDate = typeof ev.startDate === "string" ? ev.startDate : "";
    if (!isValidDateStr(startDate)) return;
    const endDate =
      typeof ev.endDate === "string" && isValidDateStr(ev.endDate) && ev.endDate >= startDate
        ? ev.endDate
        : startDate;
    const rec = {
      id: typeof ev.id === "number" ? ev.id : i + 1,
      name: typeof ev.name === "string" ? ev.name : "",
      startDate,
      endDate,
      kind: YOBIKO_EVENT_KIND_BY_KEY.has(ev.kind) ? ev.kind : DEFAULT_YOBIKO_EVENT_KIND,
    };
    if (typeof ev.memo === "string" && ev.memo) rec.memo = ev.memo;
    if (typeof ev.source === "string" && ev.source) rec.source = ev.source;
    out.push(rec);
  });
  return out;
}

// ─── 1 件の入力 (登録・編集のフォーム) ───────────────────────────────

export function emptyYobikoDraft(date = "") {
  return { startDate: date, endDate: "", kind: DEFAULT_YOBIKO_EVENT_KIND, name: "", memo: "", source: "" };
}

export function draftFromYobikoEvent(ev) {
  return {
    startDate: ev.startDate,
    endDate: ev.endDate && ev.endDate !== ev.startDate ? ev.endDate : "",
    kind: ev.kind || DEFAULT_YOBIKO_EVENT_KIND,
    name: ev.name || "",
    memo: ev.memo || "",
    source: ev.source || "",
  };
}

/**
 * フォームの値を検証してレコードの中身 (id 無し) にする。
 * 戻り値: { error } | { event }
 */
export function validateYobikoDraft(draft) {
  const startDate = plain(draft?.startDate);
  if (!isValidDateStr(startDate)) return { error: "開始日を入れてください" };
  const endRaw = plain(draft?.endDate);
  const endDate = endRaw || startDate;
  if (!isValidDateStr(endDate)) return { error: "終了日が読めません" };
  if (endDate < startDate) return { error: "終了日が開始日より前です" };
  const kind = YOBIKO_EVENT_KIND_BY_KEY.has(draft?.kind) ? draft.kind : DEFAULT_YOBIKO_EVENT_KIND;
  const name = plain(draft?.name);
  if (!name && !isYobikoDayMark(kind)) return { error: "名称を入れてください" };
  const event = { name, startDate, endDate, kind };
  const memo = plain(draft?.memo);
  if (memo) event.memo = memo;
  const source = plain(draft?.source);
  if (source) event.source = source;
  return { event };
}

// ─── まとめて登録 (表の貼り付け) ─────────────────────────────────────

export const YOBIKO_TSV_COLUMNS = Object.freeze({
  startDate: ["開始日", "開始", "日付"],
  endDate: ["終了日", "終了"],
  kind: ["種別"],
  name: ["名称", "名前", "行事", "予定"],
  memo: ["メモ", "備考"],
  source: ["出典"],
});

export const YOBIKO_TSV_HEADER = ["開始日", "終了日", "種別", "名称", "メモ"];

// 種別の書き方の揺れ (「〜」「～」「~」、空白、短い呼び方) を吸収するキー
const kindToken = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/[〜～~－-]/g, "~")
    .replace(/\s+/g, "");

const KIND_ALIASES = (() => {
  const m = new Map();
  const add = (key, ...names) => names.forEach((n) => m.set(kindToken(n), key));
  for (const k of YOBIKO_EVENT_KINDS) add(k.key, k.key, k.label, k.short);
  add("event", "", "予定", "イベント");
  add("closed", "休校", "休");
  add("dorm", "入寮");
  add("noClass", "授業のない日", "授業なし", "授業なしの登校日", "登校日(授業なし)");
  add("offTueSat", "火~土出勤者休", "火~土出勤者の休日", "火~土", "火土");
  add("offMonFri", "月~金出勤者休", "月~金出勤者の休日", "月~金", "月金");
  return m;
})();

/** 種別はラベル (「休校日」) でも key (closed) でも短い呼び方 (「休校」) でも。空は行事 */
export function parseYobikoKind(raw) {
  const t = kindToken(raw);
  if (KIND_ALIASES.has(t)) return KIND_ALIASES.get(t);
  const lower = t.toLowerCase();
  for (const k of YOBIKO_EVENT_KINDS) if (k.key.toLowerCase() === lower) return k.key;
  return null;
}

const dupKey = (ev) => `${plain(ev.name)}|${ev.kind}|${ev.startDate}|${ev.endDate}`;

/**
 * 貼り付けた表を読み、行ごとに OK / エラー / 重複 を判定する
 * (特別イベントのまとめて登録と同じ形。utils/specialEventImport)。
 *   existing: 登録済みの予備校部の予定 (同じ名称・種別・期間なら重複)
 *   fiscalYear: 「11/1」のように年の無い日付を補う年度
 *   source: 出典の列が無い (空の) 行に付ける出典
 */
export function parseYobikoEventImport(text, { existing = [], fiscalYear, source = "" } = {}) {
  const { rows, header } = parseTsvTable(text, YOBIKO_TSV_COLUMNS);
  const seen = new Set((existing || []).map(dupKey));
  const out = rows.map(({ line, cells }) => {
    const fail = (error) => ({ line, status: "error", error, cells });
    const startDate = parseFlexibleDate(cells.startDate, fiscalYear);
    if (!startDate) return fail(`開始日「${cells.startDate}」が読めません`);
    const endDate = cells.endDate ? parseFlexibleDate(cells.endDate, fiscalYear) : startDate;
    if (!endDate) return fail(`終了日「${cells.endDate}」が読めません`);
    if (endDate < startDate) return fail("終了日が開始日より前です");
    const kind = parseYobikoKind(cells.kind);
    if (!kind) return fail(`種別「${cells.kind}」が読めません`);
    const name = plain(cells.name);
    if (!name && !isYobikoDayMark(kind)) return fail("名称が空です");
    const event = { name, startDate, endDate, kind };
    const memo = plain(cells.memo);
    if (memo) event.memo = memo;
    const src = plain(cells.source) || plain(source);
    if (src) event.source = src;
    const k = dupKey(event);
    if (seen.has(k)) return { line, status: "duplicate", event };
    seen.add(k);
    return { line, status: "ok", event };
  });
  return { rows: out, header };
}

// ─── 書き出し (表として点検する・貼り戻す) ─────────────────────────────

const tsvCell = (v) => {
  const s = String(v ?? "");
  return /[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 予備校部の予定を TSV に (貼り戻すと同じ内容で読める形)。出典があれば列を足す */
export function yobikoEventsToTsv(events) {
  const list = [...(events || [])].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id
  );
  const withSource = list.some((e) => e.source);
  const head = withSource ? [...YOBIKO_TSV_HEADER, "出典"] : YOBIKO_TSV_HEADER;
  const lines = [head.join("\t")];
  for (const e of list) {
    const cells = [
      e.startDate,
      e.endDate && e.endDate !== e.startDate ? e.endDate : "",
      yobikoKindMeta(e.kind).label,
      e.name || "",
      e.memo || "",
    ];
    if (withSource) cells.push(e.source || "");
    lines.push(cells.map(tsvCell).join("\t"));
  }
  return lines.join("\n");
}

// 種別の書き方の案内 (ダイアログの説明用)
export const YOBIKO_KIND_HINT = YOBIKO_EVENT_KINDS.map((k) => k.label).join(" / ");

/** 出典の一覧 (件数付き、出典の名前順) */
export function yobikoSources(events) {
  const m = new Map();
  for (const e of events || []) {
    if (!e.source) continue;
    m.set(e.source, (m.get(e.source) || 0) + 1);
  }
  return [...m.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => a.source.localeCompare(b.source, "ja"));
}
