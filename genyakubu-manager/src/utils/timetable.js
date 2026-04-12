// ─── Timetable / display-cutoff filtering utilities ─────────────────
// All date strings are "YYYY-MM-DD".

/**
 * Check if a slot's grade matches a timetable's grade list.
 * Handles combined grades like "中1-3" by checking if ANY of the
 * expanded grades match.
 * @param {string} slotGrade
 * @param {string[]} timetableGrades - empty array means "all grades"
 * @returns {boolean}
 */
export function gradeMatchesTimetable(slotGrade, timetableGrades) {
  if (!timetableGrades || timetableGrades.length === 0) return true;

  // Direct match
  if (timetableGrades.includes(slotGrade)) return true;

  // Expand combined grades like "中1-3" → ["中1","中2","中3"]
  const expanded = expandGradeRange(slotGrade);
  if (expanded.length > 1) {
    return expanded.some((g) => timetableGrades.includes(g));
  }

  return false;
}

/**
 * Expand a grade range like "中1-3" into ["中1","中2","中3"].
 * Returns [grade] as-is if no range pattern detected.
 * @param {string} grade
 * @returns {string[]}
 */
export function expandGradeRange(grade) {
  const m = grade.match(/^(.+?)(\d+)-(\d+)$/);
  if (!m) return [grade];
  const prefix = m[1];
  const lo = parseInt(m[2], 10);
  const hi = parseInt(m[3], 10);
  if (lo >= hi || hi - lo > 6) return [grade]; // sanity guard
  const result = [];
  for (let i = lo; i <= hi; i++) result.push(`${prefix}${i}`);
  return result;
}

/**
 * Check whether a timetable is active for a given date and grade.
 * @param {import("../types").Timetable | null | undefined} timetable
 * @param {string} dateStr
 * @param {string} grade
 * @returns {boolean}
 */
export function isTimetableActiveForDate(timetable, dateStr, grade) {
  if (!timetable) return false;
  if (timetable.startDate && dateStr < timetable.startDate) return false;
  if (timetable.endDate && dateStr > timetable.endDate) return false;
  return gradeMatchesTimetable(grade, timetable.grades);
}

/**
 * Return the list of active timetable IDs for a given date and grade.
 * @param {string} dateStr
 * @param {string} grade
 * @param {import("../types").Timetable[]} timetables
 * @returns {number[]}
 */
export function getActiveTimetableIds(dateStr, grade, timetables) {
  if (!Array.isArray(timetables)) return [];
  return timetables
    .filter((t) => isTimetableActiveForDate(t, dateStr, grade))
    .map((t) => t.id);
}

/**
 * Filter slots to only those belonging to an active timetable for the date.
 * Slots without timetableId are treated as belonging to timetable id 1 (default).
 * @param {import("../types").Slot[]} slots
 * @param {string} dateStr
 * @param {import("../types").Timetable[]} timetables
 * @returns {import("../types").Slot[]}
 */
export function filterSlotsForDate(slots, dateStr, timetables) {
  if (!Array.isArray(timetables) || timetables.length === 0) return slots;
  return slots.filter((s) => {
    const ttId = s.timetableId ?? 1;
    const tt = timetables.find((t) => t.id === ttId);
    return isTimetableActiveForDate(tt, dateStr, s.grade);
  });
}

/**
 * Check if a given grade matches any grade in a cutoff group.
 * @param {string} grade
 * @param {string[]} groupGrades
 * @returns {boolean}
 */
function gradeMatchesCutoffGroup(grade, groupGrades) {
  if (groupGrades.includes(grade)) return true;
  const expanded = expandGradeRange(grade);
  if (expanded.length > 1) {
    return expanded.some((g) => groupGrades.includes(g));
  }
  return false;
}

/**
 * Check whether a date is beyond the display cutoff for a given grade.
 * @param {string} dateStr
 * @param {string} grade
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @returns {boolean}
 */
export function isBeyondCutoff(dateStr, grade, displayCutoff) {
  if (!displayCutoff || !displayCutoff.groups) return false;
  for (const group of displayCutoff.groups) {
    if (gradeMatchesCutoffGroup(grade, group.grades)) {
      if (group.date && dateStr > group.date) return true;
      return false;
    }
  }
  // No matching group → no cutoff
  return false;
}

/**
 * Check whether ALL grades on a given date are beyond their cutoff.
 * Used to show "未確定" banners for an entire day.
 * @param {string} dateStr
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @returns {boolean}
 */
export function isEntireDayBeyondCutoff(dateStr, displayCutoff) {
  if (!displayCutoff || !displayCutoff.groups || displayCutoff.groups.length === 0) return false;
  return displayCutoff.groups.every(
    (group) => group.date != null && dateStr > group.date
  );
}
