import { DAYS, WEEKDAYS } from "../constants/schools";

// "YYYY-MM-DD" 形式かつ実在する日付か。
// HolidayManager / ExamPeriodManager / SpecialEventManager の入力検証で共有。
// Date.parse は V8 で "2026-02-31" を 3/3 として通してしまう (月の日数を
// 見ない) ので、ローカル Date に組み立てて年月日が往復一致するかで確かめる
// (2026-09-04)。通してしまうと文字列一致で照合する休講日・テスト期間に
// 永久にヒットしない日付が保存される。
export function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// "19:00-20:20" / "19:00" → 開始時刻の分数。パース不能・空は 0
// (ソート用途で末尾に落とさず先頭寄せ)。timeToMin と違い range 文字列を
// そのまま受け、失敗時に NaN でなく 0 を返す。sessionCount / extraLessons
// のソートで共有。
export function timeStartToMin(time) {
  const m = String(time || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDateWeekday(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${dateStr} (${WEEKDAYS[dt.getDay()]})`;
}

export function dateToDay(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const w = WEEKDAYS[dt.getDay()];
  return DAYS.includes(w) ? w : null;
}

// "YYYY-MM-DD" をローカルタイムの Date (00:00) に変換。
// new Date("YYYY-MM-DD") は UTC 扱いで日付ずれを起こすので
// 日付比較には必ずこのヘルパを使う。無効な文字列には null を返す。
export function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// start / end を含む範囲の "YYYY-MM-DD" 文字列配列を返す。
// 無効な入力・end < start のときは空配列。
export function eachDateStrInRange(startDate, endDate) {
  const s = parseLocalDate(startDate);
  const e = parseLocalDate(endDate);
  if (!s || !e || e < s) return [];
  const out = [];
  const cur = new Date(s);
  while (cur <= e) {
    out.push(fmtDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// 期間 [start, end] が範囲 [rangeStart, rangeEnd] と重なるか。
// すべて "YYYY-MM-DD" 文字列。辞書順比較で十分。
export function overlapsRange(start, end, rangeStart, rangeEnd) {
  return end >= rangeStart && start <= rangeEnd;
}

// 単日なら "YYYY-MM-DD"、複数日なら "YYYY-MM-DD 〜 YYYY-MM-DD" を返す。
// イベントの期間表示で使うフォーマッタ。
export function formatDateRange(start, end) {
  if (!start) return "";
  if (!end || start === end) return start;
  return `${start} 〜 ${end}`;
}

// ISO 8601 文字列をローカルの "YYYY-MM-DD HH:MM" にフォーマット。
// createdAt / updatedAt の表示で利用。無効値は "-"。
export function fmtIsoLocal(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}
