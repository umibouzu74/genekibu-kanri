// ─── "HH:MM-HH:MM" の厳密なパース (通常時間割作成の時限時刻) ────────────
// conflicts.js と teacherLoad.js が同じ関数を別々に持っていた (循環 import を
// 避けるため) ので、依存の無い utils に置く (2026-09-05)。
// 講習作成の timetable-builder/utils/timeRange.ts は「1限 (13:00~13:45)」の
// ような装飾つき文字列から緩く拾う別物なので統合しない。

const STRICT_RANGE_RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

/**
 * "HH:MM-HH:MM" → { start, end } (分)。書式外・終了が開始以前は null。
 * @param {string | null | undefined} time
 * @returns {{start: number, end: number} | null}
 */
export function parseStrictTimeRange(time) {
  const m = String(time || "").trim().match(STRICT_RANGE_RE);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  return end > start ? { start, end } : null;
}
