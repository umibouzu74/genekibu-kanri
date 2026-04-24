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

// Firebase RTDB は空オブジェクト / 空配列を保存時に破棄するため、
// blankDay で初期化された `assignments: {}` が往復後に欠落する。
// 読み込み時に必ず assignments / periods が存在する形へ戻す。
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
