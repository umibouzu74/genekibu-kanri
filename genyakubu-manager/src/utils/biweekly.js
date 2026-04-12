// ─── Biweekly helpers ──────────────────────────────────────────────

// Format a teacher name with a biweekly partner extracted from the
// free-form note field. e.g. teacher="堀上", note="隔週(河野)"
// → "堀上 / 河野".
export function formatBiweeklyTeacher(teacher, note) {
  const m = note && note.match(/隔週\(([^)]+)\)/);
  return m ? `${teacher} / ${m[1]}` : teacher;
}

// Determine whether a given date falls in an "A" week or "B" week
// relative to a base date string (YYYY-MM-DD). The base date's week is
// defined as week A, the following week is B, then alternating.
//
// Returns "A" | "B" | null (if baseStr is empty or invalid).
export function getWeekType(dateStr, baseStr) {
  if (!baseStr || !dateStr) return null;
  const base = new Date(baseStr + "T12:00:00");
  const target = new Date(dateStr + "T12:00:00");
  if (isNaN(base.getTime()) || isNaN(target.getTime())) return null;
  const diffDays = Math.round((target - base) / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(diffDays / 7);
  return Math.abs(weeks) % 2 === 0 ? "A" : "B";
}

// Convenience: check if a note includes the "隔週" marker.
export function isBiweekly(note) {
  return !!note && note.includes("隔週");
}
