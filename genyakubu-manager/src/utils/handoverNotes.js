import { WEEKDAYS } from "../constants/schools";
import { isValidDateStr, parseLocalDate } from "./dateHelpers";

// ─── 引継ぎメモ ─────────────────────────────────────────────────────
// 責任者が日々気付いたこと (「10/1 事務からズバリ的中の提出催促。9 月の
// 会議で告知済み」) を 1 行ずつ書き溜めて、後任に渡すためのメモ。
//
// 引継ぎで効くのは「毎年この時期に何が起きるか」なので、読み方は 2 通り:
//   - 時系列 (書き溜めるときの見え方)
//   - 月別 = 年度 (4 月始まり) の流れ。年をまたいで同じ月のメモを並べる
// さらに「去年までの同じ時期のメモ」を画面の先頭に出す (seasonalNotes)。
// 日付に縛られない知識 (手順・連絡先・置き場所) は pinned にして、どちらの
// 並べ方でも「いつでも必要なこと」として先頭に固定する (月別・この時期には
// 混ぜない)。
// 自動で何かを学習・並べ替えるものではない (日付だけで決まる)。
//
// 保存先は管理者だけが読める adminData/ (useAppData)。閲覧者 (匿名
// ログイン) は appData/ を全部読めるので、そちらには置かない。

/** 分類。自由入力にしないのは、月別に読むときに揃っていないと探しにくいため */
export const HANDOVER_CATEGORIES = Object.freeze([
  "事務",
  "講師",
  "生徒・保護者",
  "行事・講習",
  "教材・テスト",
  "設備・システム",
  "その他",
]);

export const DEFAULT_HANDOVER_CATEGORY = "事務";

const str = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * 1 件を整える。形にならないもの (id / 日付 / 見出しが無い) は null。
 * undefined を含めない (Firebase の set() が例外を投げる)。空の任意項目は
 * キーごと落とす。
 */
export function normalizeHandoverNote(n) {
  if (n == null || typeof n !== "object" || Array.isArray(n)) return null;
  const id = Number(n.id);
  if (!Number.isFinite(id)) return null;
  const date = str(n.date);
  if (!isValidDateStr(date)) return null;
  const title = str(n.title);
  if (!title) return null;
  const out = { id, date, title, category: str(n.category) || "その他" };
  const body = str(n.body);
  if (body) out.body = body;
  const advice = str(n.advice);
  if (advice) out.advice = advice;
  if (n.annual === true) out.annual = true;
  if (n.pinned === true) out.pinned = true;
  if (str(n.createdAt)) out.createdAt = str(n.createdAt);
  if (str(n.updatedAt)) out.updatedAt = str(n.updatedAt);
  return out;
}

/** 保存値を整える (冪等)。配列でなければ空。id の重複は先勝ち */
export function migrateHandoverNotes(raw) {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.values(raw)
      : [];
  const out = [];
  const seen = new Set();
  for (const n of list) {
    const v = normalizeHandoverNote(n);
    if (!v || seen.has(v.id)) continue;
    seen.add(v.id);
    out.push(v);
  }
  return out;
}

/** 入力欄の初期値 (追加フォーム)。日付・分類は前回の値を引き継げる */
export const emptyHandoverDraft = (date, category = DEFAULT_HANDOVER_CATEGORY) => ({
  date,
  category,
  title: "",
  body: "",
  advice: "",
  annual: false,
  pinned: false,
});

/** 既存のメモ → 編集フォームの値 */
export const draftFromNote = (n) => ({
  date: n.date,
  category: n.category,
  title: n.title,
  body: n.body || "",
  advice: n.advice || "",
  annual: Boolean(n.annual),
  pinned: Boolean(n.pinned),
});

/** 保存できない理由 (無ければ null) */
export function validateHandoverDraft(d) {
  if (!isValidDateStr(str(d?.date))) return "日付を入れてください";
  if (!str(d?.title)) return "何があったかを 1 行で入れてください";
  return null;
}

/** 追加後の一覧。id は既存の最大 + 1 */
export function addHandoverNote(notes, draft, nowIso) {
  const id = notes.reduce((m, n) => Math.max(m, Number(n.id) || 0), 0) + 1;
  const note = normalizeHandoverNote({ ...draft, id, createdAt: nowIso, updatedAt: nowIso });
  return note ? [...notes, note] : notes;
}

/** 1 件を書き換えた一覧 (id と作成日時は保つ) */
export function updateHandoverNote(notes, id, draft, nowIso) {
  return notes.map((n) =>
    n.id === id
      ? normalizeHandoverNote({ ...draft, id: n.id, createdAt: n.createdAt, updatedAt: nowIso }) || n
      : n
  );
}

/** 日付の新しい順 (同じ日は後から書いた方を上)。元の配列は変えない */
export function sortNotesDesc(notes) {
  return [...notes].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.id - a.id
  );
}

const fold = (s) => String(s || "").normalize("NFKC").toLowerCase();

/**
 * 検索語 (空白区切りで AND) と分類で絞る。見出し・詳細・次の担当者へ・
 * 分類・日付 ("2026-10" / "10/1" のような打ち方) を対象にする。
 */
export function filterNotes(notes, { query = "", category = "" } = {}) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  return notes.filter((n) => {
    if (category && n.category !== category) return false;
    if (terms.length === 0) return true;
    const [, m, d] = n.date.split("-").map(Number);
    const hay = fold(
      [n.title, n.body, n.advice, n.category, n.date, `${m}/${d}`, `${m}月`].join("\n")
    );
    return terms.every((t) => hay.includes(t));
  });
}

/**
 * 「いつでも必要なこと」(pinned) と日付で読むメモに分ける。pinned は分類順
 * (HANDOVER_CATEGORIES の並び) → 見出しの順で、どの並べ方でも同じ位置に出す
 */
export function splitPinned(notes) {
  const pinned = [];
  const dated = [];
  for (const n of notes) (n.pinned ? pinned : dated).push(n);
  const catIndex = (c) => {
    const i = HANDOVER_CATEGORIES.indexOf(c);
    return i === -1 ? HANDOVER_CATEGORIES.length : i;
  };
  pinned.sort(
    (a, b) => catIndex(a.category) - catIndex(b.category) || a.title.localeCompare(b.title, "ja")
  );
  return { pinned, dated };
}

/** 時系列の見出し単位 ("2026-10" → "2026年10月")。新しい月から */
export function groupByYearMonth(notes) {
  const map = new Map();
  for (const n of sortNotesDesc(notes)) {
    const ym = n.date.slice(0, 7);
    if (!map.has(ym)) map.set(ym, []);
    map.get(ym).push(n);
  }
  return [...map.entries()].map(([ym, list]) => {
    const [y, m] = ym.split("-").map(Number);
    return { key: ym, label: `${y}年${m}月`, notes: list };
  });
}

/** 年度の並び (4 月始まり) での月の位置。4 月 = 0 … 3 月 = 11 */
export const schoolMonthIndex = (month) => (month + 8) % 12;

/**
 * 月別 (年度の流れ)。年をまたいで同じ月のメモを 1 つにまとめ、4 月 → 3 月の
 * 順に並べる。月の中は月日順、同じ月日なら新しい年を先に。
 */
export function groupByMonthOfYear(notes) {
  const map = new Map();
  for (const n of notes) {
    const m = Number(n.date.slice(5, 7));
    if (!map.has(m)) map.set(m, []);
    map.get(m).push(n);
  }
  return [...map.entries()]
    .sort((a, b) => schoolMonthIndex(a[0]) - schoolMonthIndex(b[0]))
    .map(([m, list]) => ({
      key: String(m),
      label: `${m}月`,
      notes: [...list].sort((a, b) => {
        const ad = a.date.slice(5);
        const bd = b.date.slice(5);
        if (ad !== bd) return ad < bd ? -1 : 1;
        return a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id;
      }),
    }));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / DAY_MS);

// 年だけ差し替えた日付。2/29 は平年なら 2/28 にする
function sameDayInYear(src, year) {
  const m = src.getMonth();
  const d = Math.min(src.getDate(), new Date(year, m + 1, 0).getDate());
  return new Date(year, m, d);
}

/**
 * 「去年までの、今の時期のメモ」。各メモの月日を今年の前後に当てはめ、
 * 今日の before 日前 〜 after 日後に入るものを返す (近い順)。
 * 書いたばかりのメモ (今日から minAgeDays 日以内) は「この時期」ではなく
 * 今年の出来事なので出さない。
 *
 * @returns {{note: object, on: string, offset: number}[]}
 *   on = 今年に当てはめた日付 ("YYYY-MM-DD")、offset = 今日からの日数
 */
export function seasonalNotes(
  notes,
  today,
  { before = 7, after = 30, minAgeDays = 180 } = {}
) {
  const t = parseLocalDate(today);
  if (!t) return [];
  const out = [];
  for (const n of notes) {
    if (n.pinned) continue;
    const src = parseLocalDate(n.date);
    if (!src || daysBetween(src, t) < minAgeDays) continue;
    let best = null;
    for (const y of [t.getFullYear() - 1, t.getFullYear(), t.getFullYear() + 1]) {
      const on = sameDayInYear(src, y);
      const offset = daysBetween(t, on);
      if (offset < -before || offset > after) continue;
      if (best == null || Math.abs(offset) < Math.abs(best.offset)) best = { on, offset };
    }
    if (!best) continue;
    const on = best.on;
    out.push({
      note: n,
      on: `${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, "0")}-${String(on.getDate()).padStart(2, "0")}`,
      offset: best.offset,
    });
  }
  return out.sort((a, b) => a.offset - b.offset || (a.note.date < b.note.date ? 1 : -1));
}

/** "2026-10-01" → "2026/10/1 (木)" */
export function fmtNoteDate(date) {
  const d = parseLocalDate(date);
  if (!d) return String(date || "");
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}

/** seasonalNotes の offset → "今日" / "3 日後" / "5 日前" */
export function fmtOffset(offset) {
  if (offset === 0) return "今日";
  return offset > 0 ? `${offset} 日後` : `${-offset} 日前`;
}

/**
 * 引継ぎ資料としてのテキスト (Markdown)。アプリの外 (後任へのメール・
 * 紙の引継ぎ書) に持ち出す用。月別 (年度の流れ) で並べる。
 */
export function notesToMarkdown(notes, { title = "引継ぎメモ", generatedOn = "" } = {}) {
  const lines = [`# ${title}`, ""];
  if (generatedOn) lines.push(`出力日: ${fmtNoteDate(generatedOn)}`, "");
  if (notes.length === 0) lines.push("(メモはありません)");
  const pushNote = (n, head) => {
    const tags = [n.category, n.annual ? "毎年" : ""].filter(Boolean).join("・");
    lines.push(`- ${head}[${tags}] ${n.title}`);
    if (n.body) for (const l of n.body.split("\n")) lines.push(`  ${l}`);
    if (n.advice) {
      const [first, ...rest] = n.advice.split("\n");
      lines.push(`  - 次の担当者へ: ${first}`);
      for (const l of rest) lines.push(`    ${l}`);
    }
  };
  const { pinned, dated } = splitPinned(notes);
  if (pinned.length > 0) {
    lines.push("## いつでも必要なこと", "");
    for (const n of pinned) pushNote(n, "");
    lines.push("");
  }
  for (const g of groupByMonthOfYear(dated)) {
    lines.push(`## ${g.label}`, "");
    for (const n of g.notes) pushNote(n, `**${fmtNoteDate(n.date)}** `);
    lines.push("");
  }
  return lines.join("\n").replace(/\n+$/, "\n");
}
