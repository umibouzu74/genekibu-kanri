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

import type {
  ExportBundle,
  Holiday,
  Slot,
  Substitute,
  ValidationResult,
} from "../types";

export const CURRENT_SCHEMA_VERSION = 1;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

// Type guards ------------------------------------------------------

export function isSlot(x: unknown): x is Slot {
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

export function isHoliday(x: unknown): x is Holiday {
  return isObject(x) && isString(x.date);
}

export function isSub(x: unknown): x is Substitute {
  return (
    isObject(x) &&
    isString(x.date) &&
    (isNumber(x.slotId) || isString(x.slotId)) &&
    typeof (x.originalTeacher ?? "") === "string" &&
    typeof (x.status ?? "") === "string"
  );
}

// ─── Validation ────────────────────────────────────────────────────
// Returns { ok: true, data } if the payload passes structural checks,
// otherwise { ok: false, error, path? }.
export function validateExportBundle(
  raw: unknown
): ValidationResult<ExportBundle> {
  if (!isObject(raw)) return { ok: false, error: "ルートがオブジェクトではありません" };

  if (raw.slots != null) {
    if (!Array.isArray(raw.slots))
      return { ok: false, error: "slots が配列ではありません" };
    const bad = raw.slots.findIndex((s: unknown) => !isSlot(s));
    if (bad !== -1)
      return { ok: false, error: `slots[${bad}] の形式が不正です`, path: `slots[${bad}]` };
  }

  if (raw.holidays != null) {
    if (!Array.isArray(raw.holidays))
      return { ok: false, error: "holidays が配列ではありません" };
    const bad = raw.holidays.findIndex((h: unknown) => !isHoliday(h));
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
    const bad = raw.substitutions.findIndex((s: unknown) => !isSub(s));
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

  return { ok: true, data: raw as unknown as ExportBundle };
}

// ─── Migration ─────────────────────────────────────────────────────
// Upgrades old export bundles to the current schema. Exists so that
// future schema changes have a single place to hook into.
export function migrateExportBundle(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  const bundle: Record<string, unknown> = { ...raw };
  const version = (bundle.schemaVersion as number | undefined) ?? 0;

  // v0 → v1: ensure holidays have a scope, add schemaVersion.
  if (version < 1) {
    if (Array.isArray(bundle.holidays)) {
      bundle.holidays = bundle.holidays.map((h: Record<string, unknown>) => ({
        ...h,
        scope:
          Array.isArray(h.scope) && h.scope.length ? h.scope : ["全部"],
      }));
    }
  }

  bundle.schemaVersion = CURRENT_SCHEMA_VERSION;
  return bundle;
}

// ─── ID generation ─────────────────────────────────────────────────
// Produces the next numeric ID that is strictly greater than any
// existing ID in the provided list, including 0 as a sentinel when
// the list is empty.
export function nextNumericId<T extends Record<string, unknown>>(
  list: readonly T[],
  key: keyof T = "id" as keyof T
): number {
  let max = 0;
  for (const item of list) {
    const v = Number(item?.[key]);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max + 1;
}
