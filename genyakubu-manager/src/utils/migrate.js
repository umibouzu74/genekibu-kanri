// ─── Data migration helpers ─────────────────────────────────────────
// Pure data-transformation functions used during localStorage load
// (useSyncedStorage migrate option) and JSON import (useDataIO).

/** Add default `scope` to legacy holidays that lack it. */
export const migrateHolidays = (arr) =>
  Array.isArray(arr) ? arr.map((x) => ({ ...x, scope: x.scope || ["全部"] })) : arr;

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
