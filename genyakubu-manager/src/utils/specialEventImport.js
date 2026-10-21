// ─── 特別イベントのまとめて登録 (表の貼り付け) と書き出し ───────────────
// 予定表 Excel・スプレッドシートからそのまま貼れる TSV (1 行目が見出し) を
// 読む純関数。列:
//   開始日 | 終了日 (空=単日) | 種別 | 名称 | 対象学年 | タグ | メモ  (+ 任意で 出典)
//
// 前半 (parseTsvTable / parseFlexibleDate / parseGradeList / splitList) は
// 特別イベントに依存しない。休講・追加授業のまとめて登録を足すときはこれを
// 使い、列の対応 (columns) と 1 行の組み立てだけを書く。

import { ALL_GRADES, HIGH_GRADES, MIDDLE_GRADES } from "../constants/schools";
import {
  SPECIAL_EVENT_TYPES,
  SPECIAL_EVENT_TYPE_TAGS,
  specialEventTypeMeta,
} from "../constants/specialEvents";
import { isValidDateStr } from "./dateHelpers";

// ─── 汎用 ───────────────────────────────────────────────────────────

// 日付・学年・種別・見出しは全角を半角に寄せて読む (NFKC)。名称・タグ・メモは
// 書かれたまま (「（前半）」「④」を書き換えない)
const norm = (s) => String(s ?? "").normalize("NFKC").trim();
const plain = (s) => String(s ?? "").trim();

// Excel のセル内改行・タブは "…" で囲まれて来る。囲みを外し "" を " に戻す
function unquoteCell(cell) {
  const t = cell.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  return t;
}

/**
 * TSV を表に読む。columns = { key: [見出しの別名…] }。
 * 1 行目が見出しとして読めれば列を見出しで対応づける (並べ替え・省略可)。
 * 読めなければ columns の順に並んでいるものとして 1 行目からデータ扱い。
 * 戻り値: { rows: [{ line, cells: { key: string } }], header: boolean }
 */
export function parseTsvTable(text, columns) {
  const keys = Object.keys(columns);
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((raw, i) => ({ raw, line: i + 1 }))
    .filter(({ raw }) => raw.trim() !== "");
  if (lines.length === 0) return { rows: [], header: false };

  const headCells = lines[0].raw.split("\t").map((c) => norm(unquoteCell(c)));
  const index = {};
  headCells.forEach((h, i) => {
    const key = keys.find((k) => columns[k].some((alias) => h === alias || h.startsWith(alias)));
    if (key && index[key] == null) index[key] = i;
  });
  const header = Object.keys(index).length >= 2;
  if (!header) keys.forEach((k, i) => (index[k] = i));

  const rows = (header ? lines.slice(1) : lines).map(({ raw, line }) => {
    const parts = raw.split("\t").map(unquoteCell);
    const cells = {};
    for (const k of keys) cells[k] = index[k] == null ? "" : (parts[index[k]] ?? "").trim();
    return { line, cells };
  });
  return { rows, header };
}

// 「,」「、」「・」(と全角カンマ・改行) で区切る。空は捨て、重複は 1 つに
export function splitList(raw) {
  const out = [];
  for (const t of plain(raw).split(/[,、・，\n]/)) {
    const s = t.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * 日付を "YYYY-MM-DD" に。受ける形: 2026-11-01 / 2026/11/1 / 2026年11月1日 /
 * 11/1 / 11月1日 (年は年度から補う: 4〜12 月 = fiscalYear、1〜3 月 = 翌年)。
 * 読めなければ null
 */
export function parseFlexibleDate(raw, fiscalYear) {
  const s = norm(raw).replace(/\s*\(.+?\)\s*$/, ""); // 「11/1 (土)」の曜日を落とす
  if (!s) return null;
  let y, m, d;
  let mt = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (mt) {
    [, y, m, d] = mt.map(Number);
  } else if ((mt = s.match(/^(\d{1,2})[/月](\d{1,2})日?$/))) {
    [, m, d] = mt.map(Number);
    if (!Number.isFinite(fiscalYear)) return null;
    y = m >= 4 ? fiscalYear : fiscalYear + 1;
  } else {
    return null;
  }
  const ds = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidDateStr(ds) ? ds : null;
}

/**
 * 対象学年を学年の配列に。空 / 全学年 = [] (全学年)。中学部 / 高校部 は
 * まとめて、「中1〜3」「附中1~3」のような範囲も受ける。並びは ALL_GRADES 順。
 * 読めない学年があれば { error }
 */
export function parseGradeList(raw) {
  const tokens = splitList(norm(raw));
  if (tokens.length === 0) return { grades: [] };
  const set = new Set();
  for (const t of tokens) {
    if (t === "全学年" || t === "全部") return { grades: [] };
    if (t === "中学部" || t === "中学") {
      MIDDLE_GRADES.forEach((g) => set.add(g));
      continue;
    }
    if (t === "高校部" || t === "高校") {
      HIGH_GRADES.forEach((g) => set.add(g));
      continue;
    }
    const range = t.match(/^(附中|中|高)(\d)[〜~-](?:\1)?(\d)$/);
    if (range) {
      const [, pre, a, b] = range;
      for (let n = Number(a); n <= Number(b); n++) {
        const g = `${pre}${n}`;
        if (!ALL_GRADES.includes(g)) return { error: `学年「${t}」が読めません` };
        set.add(g);
      }
      continue;
    }
    if (!ALL_GRADES.includes(t)) return { error: `学年「${t}」が読めません` };
    set.add(t);
  }
  const grades = ALL_GRADES.filter((g) => set.has(g));
  return { grades: grades.length === ALL_GRADES.length ? [] : grades };
}

// ─── 特別イベント ─────────────────────────────────────────────────

export const SPECIAL_EVENT_TSV_COLUMNS = Object.freeze({
  startDate: ["開始日", "開始", "日付"],
  endDate: ["終了日", "終了"],
  eventType: ["種別"],
  name: ["名称", "名前", "イベント", "行事"],
  targetGrades: ["対象学年", "学年", "対象"],
  tags: ["タグ"],
  memo: ["メモ", "備考"],
  source: ["出典"],
});

// 書き出し・見出し行の見本に使う列名 (SPECIAL_EVENT_TSV_COLUMNS の先頭の名前)
export const SPECIAL_EVENT_TSV_HEADER = ["開始日", "終了日", "種別", "名称", "対象学年", "タグ", "メモ"];

/** 種別はラベル (「塾のテスト」「📝 塾のテスト」) でも key (jukuTest) でも。空は other */
export function parseSpecialEventType(raw) {
  const s = norm(raw);
  if (!s) return "other";
  for (const t of SPECIAL_EVENT_TYPES) {
    if (s === t.key || s.toLowerCase() === t.key.toLowerCase()) return t.key;
    if (s === t.label || s === `${t.icon}${t.label}` || s === `${t.icon} ${t.label}`) return t.key;
  }
  // 種別が足りなかった間の仮置きの呼び方 (「公立中」「塾テスト」…)
  if (SPECIAL_EVENT_TYPE_TAGS[s]) return SPECIAL_EVENT_TYPE_TAGS[s];
  return null;
}

const dupKey = (ev) => `${plain(ev.name)}|${ev.startDate}|${ev.endDate}`;

/**
 * 貼り付けた表を読み、行ごとに OK / エラー / 重複 を判定する。
 *   existing: 登録済みの特別イベント (同じ名称・開始日・終了日なら重複)
 *   fiscalYear: 「11/1」のように年の無い日付を補う年度
 *   source: 出典の列が無い (空の) 行に付ける出典
 * 戻り値: { rows: [{ line, status: "ok"|"error"|"duplicate", error?, event? }], header }
 * 表の中で同じものが 2 回出てきたときも 2 回目を重複にする。
 */
export function parseSpecialEventImport(text, { existing = [], fiscalYear, source = "" } = {}) {
  const { rows, header } = parseTsvTable(text, SPECIAL_EVENT_TSV_COLUMNS);
  const seen = new Set((existing || []).map(dupKey));
  const out = rows.map(({ line, cells }) => {
    const fail = (error) => ({ line, status: "error", error, cells });
    const name = plain(cells.name);
    if (!name) return fail("名称が空です");
    const startDate = parseFlexibleDate(cells.startDate, fiscalYear);
    if (!startDate) return fail(`開始日「${cells.startDate}」が読めません`);
    const endDate = cells.endDate ? parseFlexibleDate(cells.endDate, fiscalYear) : startDate;
    if (!endDate) return fail(`終了日「${cells.endDate}」が読めません`);
    if (endDate < startDate) return fail("終了日が開始日より前です");
    const eventType = parseSpecialEventType(cells.eventType);
    if (!eventType) return fail(`種別「${cells.eventType}」が読めません`);
    const grades = parseGradeList(cells.targetGrades);
    if (grades.error) return fail(grades.error);
    const event = {
      name,
      startDate,
      endDate,
      eventType,
      targetGrades: grades.grades,
      memo: plain(cells.memo),
      tags: splitList(cells.tags),
    };
    const src = plain(cells.source) || plain(source);
    if (src) event.source = src;
    const k = dupKey(event);
    if (seen.has(k)) return { line, status: "duplicate", event };
    seen.add(k);
    return { line, status: "ok", event };
  });
  return { rows: out, header };
}

/**
 * 登録する行を id 付きのイベントにする。includeDuplicates で重複の行も入れる。
 * startId から順に id を振る (呼び出し側が nextNumericId で決める)
 */
export function buildImportedEvents(rows, { startId, includeDuplicates = false }) {
  let id = startId;
  return (rows || [])
    .filter((r) => r.status === "ok" || (includeDuplicates && r.status === "duplicate"))
    .map((r) => ({ id: id++, ...r.event }));
}

// ─── 書き出し (表として点検する) ───────────────────────────────────

const tsvCell = (v) => {
  const s = String(v ?? "");
  return /[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 特別イベントを TSV に (貼り戻すと同じ内容で読める形)。出典があれば列を足す */
export function specialEventsToTsv(events) {
  const list = [...(events || [])].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id
  );
  const withSource = list.some((e) => e.source);
  const head = withSource ? [...SPECIAL_EVENT_TSV_HEADER, "出典"] : SPECIAL_EVENT_TSV_HEADER;
  const lines = [head.join("\t")];
  for (const e of list) {
    const cells = [
      e.startDate,
      e.endDate && e.endDate !== e.startDate ? e.endDate : "",
      specialEventTypeMeta(e.eventType).label,
      e.name,
      (e.targetGrades || []).length === 0 ? "全学年" : e.targetGrades.join(","),
      (e.tags || []).join(","),
      e.memo || "",
    ];
    if (withSource) cells.push(e.source || "");
    lines.push(cells.map(tsvCell).join("\t"));
  }
  return lines.join("\n");
}

// 種別の書き方の案内 (ダイアログの説明用)
export const SPECIAL_EVENT_TYPE_HINT = SPECIAL_EVENT_TYPES.map((t) => t.label).join(" / ");
