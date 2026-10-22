// ─── テスト期間のまとめて登録 (表の貼り付け) ────────────────────────────
// 学校の行事予定表から読み取った考査日程を、1 行目が見出しの TSV で貼る。列:
//   学校 | 名称 | 発表日 | 考査日 | 終了日 (空=最後の考査日) | 対象学年 |
//   授業を止める (空=しない) | 出典
//
// 登録する形: startDate = 発表日 (空なら最初の考査日)、examDates = 考査日
// (表示専用)、tags = [学校]、stopsClasses = 授業を止める が「する」か。
// 高校の学校別テストは授業を止めないので、空は「しない」。
// 表の読み取り・日付・学年は特別イベントのまとめて登録と共有する
// (utils/specialEventImport の前半)。

import {
  buildImportedEvents,
  parseFlexibleDate,
  parseGradeList,
  parseTsvTable,
  splitList,
} from "./specialEventImport";
import { schoolKeyOf } from "./schoolSchedule";

export const EXAM_PERIOD_TSV_COLUMNS = Object.freeze({
  school: ["学校"],
  name: ["名称", "名前", "考査名", "テスト名"],
  announceDate: ["発表日", "発表", "開始日"],
  examDates: ["考査日", "考査", "試験日"],
  endDate: ["終了日", "終了"],
  targetGrades: ["対象学年", "学年", "対象"],
  stopsClasses: ["授業を止める", "授業停止", "授業休止"],
  source: ["出典"],
});

export const EXAM_PERIOD_TSV_HEADER = [
  "学校",
  "名称",
  "発表日",
  "考査日",
  "終了日",
  "対象学年",
  "授業を止める",
];

const plain = (s) => String(s ?? "").trim();
const norm = (s) => String(s ?? "").normalize("NFKC").trim();

const STOP_YES = new Set(["する", "止める", "休止", "はい", "yes", "true", "○", "〇", "1"]);
const STOP_NO = new Set(["", "しない", "止めない", "継続", "いいえ", "no", "false", "×", "0"]);

/** 「授業を止める」の欄を真偽値に。読めなければ null */
export function parseStopsClasses(raw) {
  const s = norm(raw).toLowerCase();
  if (STOP_YES.has(s)) return true;
  if (STOP_NO.has(s)) return false;
  return null;
}

/**
 * 考査日の欄 (「2026-05-19,2026-05-20」「11/26、11/27」) を日付の配列に。
 * 昇順・重複なし。読めない日付があれば { error }
 */
export function parseExamDateList(raw, fiscalYear) {
  const dates = new Set();
  for (const t of splitList(raw)) {
    const d = parseFlexibleDate(t, fiscalYear);
    if (!d) return { error: `考査日「${t}」が読めません` };
    dates.add(d);
  }
  return { dates: [...dates].sort() };
}

// 同じ学校・名称・発表日 (開始日) なら重複
const dupKey = (ep) => `${schoolKeyOf(ep) || ""}|${plain(ep.name)}|${ep.startDate}`;

/**
 * 貼り付けた表を読み、行ごとに OK / エラー / 重複 を判定する。
 *   existing: 登録済みのテスト期間
 *   fiscalYear: 「11/1」のように年の無い日付を補う年度
 *   source: 出典の列が無い (空の) 行に付ける出典
 * 戻り値: { rows: [{ line, status, error?, event? }], header }
 * (event = 登録するテスト期間。特別イベントの buildImportedEvents で id を振る)
 */
export function parseExamPeriodImport(text, { existing = [], fiscalYear, source = "" } = {}) {
  const { rows, header } = parseTsvTable(text, EXAM_PERIOD_TSV_COLUMNS);
  const seen = new Set((existing || []).map(dupKey));
  const out = rows.map(({ line, cells }) => {
    const fail = (error) => ({ line, status: "error", error, cells });
    const name = plain(cells.name);
    if (!name) return fail("名称が空です");
    const school = plain(cells.school);
    const exam = parseExamDateList(cells.examDates, fiscalYear);
    if (exam.error) return fail(exam.error);
    const dates = exam.dates;
    let announce = null;
    if (plain(cells.announceDate)) {
      announce = parseFlexibleDate(cells.announceDate, fiscalYear);
      if (!announce) return fail(`発表日「${cells.announceDate}」が読めません`);
    }
    const startDate = announce || dates[0];
    if (!startDate) return fail("発表日か考査日を入れてください");
    if (dates.length && dates[0] < startDate) return fail("考査日が発表日より前です");
    const last = dates[dates.length - 1];
    let endDate = last || startDate;
    if (plain(cells.endDate)) {
      endDate = parseFlexibleDate(cells.endDate, fiscalYear);
      if (!endDate) return fail(`終了日「${cells.endDate}」が読めません`);
    }
    if (endDate < startDate) return fail("終了日が発表日より前です");
    if (last && endDate < last) return fail("終了日が最後の考査日より前です");
    const grades = parseGradeList(cells.targetGrades);
    if (grades.error) return fail(grades.error);
    const stopsClasses = parseStopsClasses(cells.stopsClasses);
    if (stopsClasses == null) {
      return fail(`授業を止める「${cells.stopsClasses}」が読めません (する / しない)`);
    }
    const event = {
      name,
      startDate,
      endDate,
      targetGrades: grades.grades,
      stopsClasses,
      tags: school ? [school] : [],
    };
    if (dates.length) event.examDates = dates;
    const src = plain(cells.source) || plain(source);
    if (src) event.source = src;
    const k = dupKey(event);
    if (seen.has(k)) return { line, status: "duplicate", event };
    seen.add(k);
    return { line, status: "ok", event };
  });
  return { rows: out, header };
}

/** 登録する行を id 付きのテスト期間にする (特別イベントと同じ振り方) */
export const buildImportedExamPeriods = buildImportedEvents;

/** 出典ごとの件数 ([{ source, count }]、出典の五十音順) */
export function examPeriodSources(examPeriods) {
  const m = new Map();
  for (const ep of examPeriods || []) {
    if (!ep?.source) continue;
    m.set(ep.source, (m.get(ep.source) || 0) + 1);
  }
  return [...m.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => a.source.localeCompare(b.source, "ja"));
}
