import { DAYS, WEEKDAYS } from "../constants/schools";

export function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
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
