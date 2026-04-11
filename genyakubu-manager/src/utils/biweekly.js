// ─── Biweekly helpers ──────────────────────────────────────────────

// Format a teacher name with a biweekly partner extracted from the
// free-form note field. e.g. teacher="堀上", note="隔週(河野)"
// → "堀上 / 河野".
export function formatBiweeklyTeacher(teacher, note) {
  const m = note && note.match(/隔週\(([^)]+)\)/);
  return m ? `${teacher} / ${m[1]}` : teacher;
}
