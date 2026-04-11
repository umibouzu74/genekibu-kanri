// ─── Schema / validation / migration helpers ──────────────────────
//
// The export bundle format:
//   {
//     schemaVersion: 1,
//     slots: Slot[],
//     holidays: Holiday[],
//     substitutions: Sub[],
//     partTimeStaff: string[],
//     biweeklyBase: string,
//   }

export const CURRENT_SCHEMA_VERSION = 1;

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v) => typeof v === "string";
const isNumber = (v) => typeof v === "number" && Number.isFinite(v);

// Type guards ------------------------------------------------------

export function isSlot(x) {
  return (
    isObject(x) &&
    isNumber(x.id) &&
    isString(x.day) &&
    isString(x.time) &&
    isString(x.grade) &&
    isString(x.subj) &&
    isString(x.teacher)
  );
}

export function isHoliday(x) {
  return isObject(x) && isString(x.date);
}

export function isSub(x) {
  return (
    isObject(x) &&
    isString(x.date) &&
    (isNumber(x.slotId) || isString(x.slotId)) &&
    isString(x.originalTeacher || "") &&
    isString(x.status || "")
  );
}

// ─── Validation ────────────────────────────────────────────────────
// Returns a { ok: true, data } if the payload passes structural
// checks, otherwise { ok: false, error: string, path?: string }.
export function validateExportBundle(raw) {
  if (!isObject(raw)) return { ok: false, error: "ルートがオブジェクトではありません" };

  if (raw.slots != null) {
    if (!Array.isArray(raw.slots)) return { ok: false, error: "slots が配列ではありません" };
    const bad = raw.slots.findIndex((s) => !isSlot(s));
    if (bad !== -1)
      return { ok: false, error: `slots[${bad}] の形式が不正です`, path: `slots[${bad}]` };
  }

  if (raw.holidays != null) {
    if (!Array.isArray(raw.holidays))
      return { ok: false, error: "holidays が配列ではありません" };
    const bad = raw.holidays.findIndex((h) => !isHoliday(h));
    if (bad !== -1)
      return {
        ok: false,
        error: `holidays[${bad}] の形式が不正です`,
        path: `holidays[${bad}]`,
      };
  }

  if (raw.substitutions != null) {
    if (!Array.isArray(raw.substitutions))
      return { ok: false, error: "substitutions が配列ではありません" };
    const bad = raw.substitutions.findIndex((s) => !isSub(s));
    if (bad !== -1)
      return {
        ok: false,
        error: `substitutions[${bad}] の形式が不正です`,
        path: `substitutions[${bad}]`,
      };
  }

  if (raw.partTimeStaff != null && !Array.isArray(raw.partTimeStaff)) {
    return { ok: false, error: "partTimeStaff が配列ではありません" };
  }

  if (raw.biweeklyBase != null && !isString(raw.biweeklyBase)) {
    return { ok: false, error: "biweeklyBase が文字列ではありません" };
  }

  return { ok: true, data: raw };
}

// ─── Migration ─────────────────────────────────────────────────────
// Upgrades old export bundles to the current schema. Exists so that
// future schema changes have a single place to hook into.
export function migrateExportBundle(raw) {
  if (!isObject(raw)) return raw;
  const bundle = { ...raw };
  const version = bundle.schemaVersion ?? 0;

  // v0 → v1: ensure holidays have a scope, add schemaVersion.
  if (version < 1) {
    if (Array.isArray(bundle.holidays)) {
      bundle.holidays = bundle.holidays.map((h) => ({
        ...h,
        scope: h.scope && h.scope.length ? h.scope : ["全部"],
      }));
    }
  }

  bundle.schemaVersion = CURRENT_SCHEMA_VERSION;
  return bundle;
}

// ─── ID generation ─────────────────────────────────────────────────
// Produces the next numeric ID that is strictly greater than any
// existing ID in the provided list, including -1 as a sentinel when
// the list is empty.
export function nextNumericId(list, key = "id") {
  let max = 0;
  for (const item of list) {
    const v = Number(item?.[key]);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max + 1;
}
