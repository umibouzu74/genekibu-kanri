// ─── Excel Grid utilities ──────────────────────────────────────────
// Pure functions for building the Excel-style timetable grid layout.
// Derives column definitions and time rows from slot data.

import { timeToMin } from "../data";

const GRADE_ORDER = [
  "中1", "中2", "中3",
  "附中", "附中1", "附中2", "附中3",
  "高1", "高2", "高3",
  "中1-3",
  "高1高2",
];

const CLS_ORDER = [
  "SS", "S", "A", "AB", "A·B", "A・B", "B", "C",
  "一般", "クラス", "特進", "-", "",
];

function gradeIndex(g) {
  const i = GRADE_ORDER.indexOf(g);
  return i >= 0 ? i : 99;
}

function clsIndex(c) {
  const i = CLS_ORDER.indexOf(c);
  return i >= 0 ? i : 50;
}

/**
 * Check if a cls value is a combined/range format that spans multiple columns.
 * e.g., "S/AB", "SS〜C", "S〜B"
 */
export function isCombinedCls(cls) {
  return cls.includes("/") || cls.includes("〜") || cls.includes("~");
}

/**
 * Expand a range cls like "SS〜C" into individual class names.
 * @param {string} cls
 * @returns {string[]}
 */
export function expandClsRange(cls) {
  // Handle "/" separator: "S/AB" → ["S", "AB"]
  if (cls.includes("/")) {
    return cls.split("/").map((c) => c.trim());
  }
  // Handle "〜" or "~" range: "SS〜C" → ["SS", "S", "A", "AB", "B", "C"]
  const rangeMatch = cls.match(/^(.+?)[〜~](.+)$/);
  if (rangeMatch) {
    const startIdx = clsIndex(rangeMatch[1]);
    const endIdx = clsIndex(rangeMatch[2]);
    if (startIdx < 50 && endIdx < 50 && startIdx <= endIdx) {
      return CLS_ORDER.slice(startIdx, endIdx + 1);
    }
  }
  return [cls];
}

/**
 * Build column definitions for a given day + section.
 * Only creates columns from individual class slots (not combined "S/AB" etc.).
 * Combined slots will span across those individual columns during rendering.
 *
 * @param {import("../types").Slot[]} slots
 * @param {string} day
 * @param {(s: import("../types").Slot) => boolean} sectionFilterFn
 * @returns {{ gradeGroups: Array<{ grade: string, columns: Array<{ cls: string, room: string, key: string }> }> }}
 */
export function buildColumnDefs(slots, day, sectionFilterFn) {
  const sectionSlots = slots.filter(
    (s) => s.day === day && sectionFilterFn(s)
  );

  // Collect unique (grade, cls, room) tuples from individual slots only
  const seen = new Set();
  const tuples = [];
  for (const s of sectionSlots) {
    if (isCombinedCls(s.cls)) continue; // Skip combined slots for column defs
    const key = `${s.grade}_${s.cls}_${s.room}`;
    if (!seen.has(key)) {
      seen.add(key);
      tuples.push({ grade: s.grade, cls: s.cls, room: s.room, key });
    }
  }

  // If there are only combined slots and no individual ones for a grade,
  // expand the combined cls to create columns.
  const gradesWithCols = new Set(tuples.map((t) => t.grade));
  for (const s of sectionSlots) {
    if (!isCombinedCls(s.cls)) continue;
    if (gradesWithCols.has(s.grade)) continue;
    // No individual columns for this grade; expand the combined cls
    const expanded = expandClsRange(s.cls);
    for (const c of expanded) {
      const key = `${s.grade}_${c}_${s.room}`;
      if (!seen.has(key)) {
        seen.add(key);
        tuples.push({ grade: s.grade, cls: c, room: s.room, key });
      }
    }
    gradesWithCols.add(s.grade);
  }

  // Sort: grade order → cls order → room (numeric then alpha)
  tuples.sort((a, b) => {
    const gd = gradeIndex(a.grade) - gradeIndex(b.grade);
    if (gd !== 0) return gd;
    const cd = clsIndex(a.cls) - clsIndex(b.cls);
    if (cd !== 0) return cd;
    return a.room.localeCompare(b.room, "ja");
  });

  // Group by grade
  const gradeMap = new Map();
  for (const t of tuples) {
    if (!gradeMap.has(t.grade)) gradeMap.set(t.grade, []);
    gradeMap.get(t.grade).push({ cls: t.cls, room: t.room, key: t.key });
  }

  const gradeGroups = [];
  for (const [grade, columns] of gradeMap) {
    gradeGroups.push({ grade, columns });
  }

  return { gradeGroups };
}

/**
 * Build sorted unique time rows for a given day + section.
 *
 * @param {import("../types").Slot[]} slots
 * @param {string} day
 * @param {(s: import("../types").Slot) => boolean} sectionFilterFn
 * @returns {string[]}
 */
export function buildTimeRows(slots, day, sectionFilterFn) {
  const times = new Set();
  for (const s of slots) {
    if (s.day === day && sectionFilterFn(s)) {
      times.add(s.time);
    }
  }
  return [...times].sort(
    (a, b) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
  );
}

/**
 * Find the slot matching a specific cell (individual column).
 * Returns the first matching slot or null.
 *
 * @param {import("../types").Slot[]} slots
 * @param {string} day
 * @param {string} time
 * @param {string} grade
 * @param {string} cls
 * @param {string} room
 * @returns {import("../types").Slot | null}
 */
export function findSlotForCell(slots, day, time, grade, cls, room) {
  return (
    slots.find(
      (s) =>
        s.day === day &&
        s.time === time &&
        s.grade === grade &&
        s.room === room &&
        !isCombinedCls(s.cls) &&
        classMatchesColumn(s.cls, cls)
    ) ?? null
  );
}

/**
 * Find combined/range slots that span multiple columns for a given time+grade.
 *
 * @param {import("../types").Slot[]} slots
 * @param {string} day
 * @param {string} time
 * @param {string} grade
 * @returns {import("../types").Slot[]}
 */
export function findCombinedSlots(slots, day, time, grade) {
  return slots.filter(
    (s) =>
      s.day === day &&
      s.time === time &&
      s.grade === grade &&
      isCombinedCls(s.cls)
  );
}

/**
 * Check if a slot's class field matches a column's class.
 * Handles exact match and combined classes ("S/AB" matches both "S" and "AB").
 *
 * @param {string} slotCls
 * @param {string} columnCls
 * @returns {boolean}
 */
export function classMatchesColumn(slotCls, columnCls) {
  if (slotCls === columnCls) return true;
  if (isCombinedCls(slotCls)) {
    const expanded = expandClsRange(slotCls);
    return expanded.includes(columnCls);
  }
  return false;
}

/**
 * Determine the colSpan of a combined slot within a list of columns.
 * Returns { startIdx, span } where startIdx is the first column index
 * and span is how many columns it covers.
 *
 * @param {import("../types").Slot} slot
 * @param {Array<{ cls: string }>} columns
 * @returns {{ startIdx: number, span: number } | null}
 */
export function getCombinedSpan(slot, columns) {
  if (!isCombinedCls(slot.cls)) return null;
  const expanded = expandClsRange(slot.cls);
  const indices = [];
  for (let i = 0; i < columns.length; i++) {
    if (expanded.includes(columns[i].cls)) {
      indices.push(i);
    }
  }
  if (indices.length === 0) return null;
  return {
    startIdx: indices[0],
    span: indices[indices.length - 1] - indices[0] + 1,
  };
}

/**
 * Format time for display. "18:55-19:40" → "18:55\n〜\n19:40"
 * @param {string} time
 * @returns {{ start: string, end: string }}
 */
export function splitTime(time) {
  const [start, end] = time.split("-");
  return { start, end };
}
