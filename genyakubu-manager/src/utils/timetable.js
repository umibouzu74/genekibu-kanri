// ─── Timetable / display-cutoff filtering utilities ─────────────────
// All date strings are "YYYY-MM-DD".

import { findCohortCutoff } from "./cohorts";

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
 * Filter slots to those belonging to the active timetable, used by aggregate
 * views (week/month/dashboard "現在の時間割") where no specific date applies.
 * Returns slots unchanged when there is only a single timetable (or none) —
 * the filter is a no-op in that case.
 * Slots without timetableId are treated as belonging to timetable id 1.
 */
export function filterSlotsByActiveTimetable(slots, timetables, activeTimetableId) {
  if (!Array.isArray(timetables) || timetables.length <= 1) return slots;
  const activeId = activeTimetableId || 1;
  return slots.filter((s) => (s.timetableId ?? 1) === activeId);
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
 * Find the cutoff group whose grades include the given grade.
 * Handles combined grades ("中1-3") via range expansion.
 * @param {string} grade
 * @param {import("../types").CutoffGroup[] | undefined} groups
 * @returns {import("../types").CutoffGroup | null}
 */
export function findGroupForGrade(grade, groups) {
  if (!Array.isArray(groups)) return null;
  for (const group of groups) {
    if (gradeMatchesCutoffGroup(grade, group.grades)) return group;
  }
  return null;
}

/**
 * Check whether a date is outside the display range for a given grade.
 * Returns true when dateStr falls before startDate or after date (end).
 * Grade-group level only — see isSlotBeyondCutoff for cohort-aware checks.
 * @param {string} dateStr
 * @param {string} grade
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @returns {boolean}
 */
export function isBeyondCutoff(dateStr, grade, displayCutoff) {
  if (!displayCutoff || !displayCutoff.groups) return false;
  const group = findGroupForGrade(grade, displayCutoff.groups);
  if (!group) return false; // No matching group → no cutoff
  if (group.startDate && dateStr < group.startDate) return true;
  if (group.date && dateStr > group.date) return true;
  return false;
}

/**
 * Cohort-aware variant of isBeyondCutoff. Layers a per-cohort 終講日
 * (last-class date) over the grade-group range:
 *   - start: always the grade group's startDate (cohorts refine the END only)
 *   - end:   the matching cohort's date if set, otherwise the group's date
 * High-school cohorts split by school (subj prefix); middle-school cohorts
 * split by course (the days a track actually meets: 火金 / 月木 / 火木 /
 * 水金 / 土 …). See utils/cohorts.js. Matching is by day membership, so a
 * cohort's stored day list need not be a fixed pair.
 * @param {string} dateStr
 * @param {import("../types").Slot} slot
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @returns {boolean}
 */
export function isSlotBeyondCutoff(dateStr, slot, displayCutoff) {
  if (!displayCutoff || !slot) return false;
  const group = findGroupForGrade(slot.grade, displayCutoff.groups);
  const cohort = findCohortCutoff(slot, displayCutoff.cohorts);

  const startDate = group?.startDate || null;
  const endDate = (cohort && cohort.date) || group?.date || null;

  if (startDate && dateStr < startDate) return true;
  if (endDate && dateStr > endDate) return true;
  return false;
}

/**
 * Check whether ALL grades on a given date are outside their display range.
 * Used to show "未確定" banners / blank an entire day.
 *
 * Grade-group level only — deliberately cohort-free. The group end date is the
 * OUTER display bound: a per-cohort 終講日 (isSlotBeyondCutoff) can only shorten
 * a cohort's visibility WITHIN that window, never push a day past the group end.
 * To display a cohort beyond its group end, raise the group's end date (the
 * CohortCutoffEditor warns when a cohort date exceeds it). Keeping this gate
 * cohort-free avoids leaking one cohort's extension into count-based paths
 * (e.g. findNextSessionMap) that don't re-apply per-slot cutoffs, and avoids a
 * grade-matching mismatch for combined grades ("中1-3").
 * @param {string} dateStr
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @returns {boolean}
 */
export function isEntireDayBeyondCutoff(dateStr, displayCutoff) {
  if (!displayCutoff || !displayCutoff.groups || displayCutoff.groups.length === 0) return false;
  return displayCutoff.groups.every((group) => {
    if (group.startDate && dateStr < group.startDate) return true;
    if (group.date && dateStr > group.date) return true;
    return false;
  });
}
