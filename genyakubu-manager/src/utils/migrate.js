// ─── Data migration helpers ─────────────────────────────────────────
// Pure data-transformation functions used during localStorage load
// (useSyncedStorage migrate option) and JSON import (useDataIO).

/** Add default `scope`, `id`, `targetGrades`, `subjKeywords` to legacy holidays. */
export const migrateHolidays = (arr) =>
  Array.isArray(arr)
    ? arr.map((x, i) => ({
        ...x,
        id: typeof x.id === "number" ? x.id : i + 1,
        scope: x.scope || ["全部"],
        targetGrades: Array.isArray(x.targetGrades) ? x.targetGrades : [],
        subjKeywords: Array.isArray(x.subjKeywords) ? x.subjKeywords : [],
      }))
    : arr;

/** Convert legacy string[] staff to PartTimeStaffObject[]. */
export const migratePartTimeStaff = (arr) =>
  Array.isArray(arr)
    ? arr.map((x) =>
        typeof x === "string"
          ? { name: x, subjectIds: [] }
          : { name: x?.name ?? "", subjectIds: Array.isArray(x?.subjectIds) ? x.subjectIds : [] }
      )
    : arr;

/** Rename legacy "completed" status to "confirmed". */
export const migrateSubs = (arr) =>
  Array.isArray(arr)
    ? arr.map((s) => (s?.status === "completed" ? { ...s, status: "confirmed" } : s))
    : arr;

/**
 * Restore `targetGrades: []` (全学年モード) dropped by Firebase RTDB.
 * Firebase RTDB discards empty arrays on write, so exam periods saved
 * with the "全学年" option come back missing `targetGrades` and cause
 * a render crash in ExamPeriodManager.
 */
export const migrateExamPeriods = (arr) =>
  Array.isArray(arr)
    ? arr.map((ep) => ({
        ...ep,
        targetGrades: Array.isArray(ep?.targetGrades) ? ep.targetGrades : [],
      }))
    : arr;

/**
 * Restore `assignments: {}` dropped by Firebase RTDB.
 * Firebase RTDB discards empty objects/arrays on write, so days
 * initialized via `blankDay` come back missing `assignments` (and
 * potentially `periods` if somehow emptied), crashing the editor.
 */
export const migrateExamPrepSchedules = (arr) =>
  Array.isArray(arr)
    ? arr.map((s) => ({
        ...s,
        days: Array.isArray(s?.days)
          ? s.days.map((d) => ({
              ...d,
              periods: Array.isArray(d?.periods) ? d.periods : [],
              assignments: d?.assignments ?? {},
            }))
          : [],
      }))
    : arr;
