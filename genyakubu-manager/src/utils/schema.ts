// ─── Schema / validation / migration helpers ──────────────────────
//
// The export bundle format:
//   {
//     schemaVersion: 6,
//     slots: Slot[],
//     holidays: Holiday[],
//     substitutions: Sub[],
//     partTimeStaff: PartTimeStaffObject[],
//     biweeklyBase: string,
//     biweeklyAnchors: BiweeklyAnchor[],
//     adjustments: ScheduleAdjustment[],
//     timetables: Timetable[],
//     displayCutoff: DisplayCutoff,
//     examPeriods: ExamPeriod[],
//   }

import type {
  BiweeklyAnchor,
  CutoffGroup,
  DisplayCutoff,
  ExamPeriod,
  ExportBundle,
  Holiday,
  PartTimeStaffObject,
  ScheduleAdjustment,
  Slot,
  Subject,
  SubjectCategory,
  Substitute,
  Timetable,
  ValidationResult,
} from "../types";

export const CURRENT_SCHEMA_VERSION = 7;

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
    isString(x.teacher) &&
    (x.timetableId === undefined || isNumber(x.timetableId)) &&
    (x.biweeklyAnchors === undefined ||
      (Array.isArray(x.biweeklyAnchors) &&
        (x.biweeklyAnchors as unknown[]).every((a) => isBiweeklyAnchor(a))))
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

export function isSubjectCategory(x: unknown): x is SubjectCategory {
  return isObject(x) && isNumber(x.id) && isString(x.name);
}

export function isSubject(x: unknown): x is Subject {
  return (
    isObject(x) && isNumber(x.id) && isString(x.name) && isNumber(x.categoryId)
  );
}

export function isPartTimeStaffObject(x: unknown): x is PartTimeStaffObject {
  return isObject(x) && isString(x.name) && Array.isArray(x.subjectIds);
}

export function isBiweeklyAnchor(x: unknown): x is BiweeklyAnchor {
  return isObject(x) && isString(x.date) && x.weekType === "A";
}

export function isScheduleAdjustment(x: unknown): x is ScheduleAdjustment {
  return (
    isObject(x) &&
    isNumber(x.id) &&
    isString(x.date) &&
    isString(x.type) &&
    (x.type === "move" || x.type === "combine") &&
    isNumber(x.slotId)
  );
}

export function isTimetable(x: unknown): x is Timetable {
  return (
    isObject(x) &&
    isNumber(x.id) &&
    isString(x.name) &&
    isString(x.type) &&
    (x.type === "regular" || x.type === "koshu") &&
    (x.startDate === null || isString(x.startDate)) &&
    (x.endDate === null || isString(x.endDate)) &&
    Array.isArray(x.grades)
  );
}

export function isCutoffGroup(x: unknown): x is CutoffGroup {
  return (
    isObject(x) &&
    isString(x.label) &&
    Array.isArray(x.grades) &&
    (x.date === null || isString(x.date)) &&
    (x.startDate === undefined || x.startDate === null || isString(x.startDate))
  );
}

export function isDisplayCutoff(x: unknown): x is DisplayCutoff {
  return (
    isObject(x) &&
    Array.isArray(x.groups) &&
    x.groups.every((g: unknown) => isCutoffGroup(g))
  );
}

export function isExamPeriod(x: unknown): x is ExamPeriod {
  return (
    isObject(x) &&
    isNumber(x.id) &&
    isString(x.name) &&
    isString(x.startDate) &&
    isString(x.endDate) &&
    Array.isArray(x.targetGrades)
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

  if (raw.partTimeStaff != null) {
    if (!Array.isArray(raw.partTimeStaff)) {
      return { ok: false, error: "partTimeStaff が配列ではありません" };
    }
    // 旧形式 (string) と新形式 (PartTimeStaffObject) の混在を許容
    const bad = raw.partTimeStaff.findIndex(
      (s: unknown) => !isString(s) && !isPartTimeStaffObject(s)
    );
    if (bad !== -1)
      return {
        ok: false,
        error: `partTimeStaff[${bad}] の形式が不正です`,
        path: `partTimeStaff[${bad}]`,
      };
  }

  if (raw.subjectCategories != null) {
    if (!Array.isArray(raw.subjectCategories))
      return { ok: false, error: "subjectCategories が配列ではありません" };
    const bad = raw.subjectCategories.findIndex(
      (c: unknown) => !isSubjectCategory(c)
    );
    if (bad !== -1)
      return {
        ok: false,
        error: `subjectCategories[${bad}] の形式が不正です`,
        path: `subjectCategories[${bad}]`,
      };
  }

  if (raw.subjects != null) {
    if (!Array.isArray(raw.subjects))
      return { ok: false, error: "subjects が配列ではありません" };
    const bad = raw.subjects.findIndex((s: unknown) => !isSubject(s));
    if (bad !== -1)
      return {
        ok: false,
        error: `subjects[${bad}] の形式が不正です`,
        path: `subjects[${bad}]`,
      };
  }

  if (raw.biweeklyBase != null && !isString(raw.biweeklyBase)) {
    return { ok: false, error: "biweeklyBase が文字列ではありません" };
  }

  if (raw.biweeklyAnchors != null) {
    if (!Array.isArray(raw.biweeklyAnchors))
      return { ok: false, error: "biweeklyAnchors が配列ではありません" };
    const bad = raw.biweeklyAnchors.findIndex(
      (a: unknown) => !isBiweeklyAnchor(a)
    );
    if (bad !== -1)
      return {
        ok: false,
        error: `biweeklyAnchors[${bad}] の形式が不正です`,
        path: `biweeklyAnchors[${bad}]`,
      };
  }

  if (raw.adjustments != null) {
    if (!Array.isArray(raw.adjustments))
      return { ok: false, error: "adjustments が配列ではありません" };
    const bad = raw.adjustments.findIndex(
      (a: unknown) => !isScheduleAdjustment(a)
    );
    if (bad !== -1)
      return {
        ok: false,
        error: `adjustments[${bad}] の形式が不正です`,
        path: `adjustments[${bad}]`,
      };
  }

  if (raw.timetables != null) {
    if (!Array.isArray(raw.timetables))
      return { ok: false, error: "timetables が配列ではありません" };
    const bad = raw.timetables.findIndex((t: unknown) => !isTimetable(t));
    if (bad !== -1)
      return {
        ok: false,
        error: `timetables[${bad}] の形式が不正です`,
        path: `timetables[${bad}]`,
      };
  }

  if (raw.displayCutoff != null) {
    if (!isDisplayCutoff(raw.displayCutoff))
      return { ok: false, error: "displayCutoff の形式が不正です" };
  }

  if (raw.examPeriods != null) {
    if (!Array.isArray(raw.examPeriods))
      return { ok: false, error: "examPeriods が配列ではありません" };
    const bad = raw.examPeriods.findIndex((ep: unknown) => !isExamPeriod(ep));
    if (bad !== -1)
      return {
        ok: false,
        error: `examPeriods[${bad}] の形式が不正です`,
        path: `examPeriods[${bad}]`,
      };
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

  // v1 → v2: partTimeStaff を string[] からオブジェクト配列に変換し、
  //          subjectCategories / subjects を空配列で初期化。
  if (version < 2) {
    if (Array.isArray(bundle.partTimeStaff)) {
      bundle.partTimeStaff = bundle.partTimeStaff.map((s: unknown) =>
        typeof s === "string"
          ? { name: s, subjectIds: [] }
          : s && typeof s === "object" && "name" in s
            ? {
                name: String((s as Record<string, unknown>).name ?? ""),
                subjectIds: Array.isArray(
                  (s as Record<string, unknown>).subjectIds
                )
                  ? ((s as Record<string, unknown>).subjectIds as number[])
                  : [],
              }
            : s
      );
    }
    if (!Array.isArray(bundle.subjectCategories)) {
      bundle.subjectCategories = [];
    }
    if (!Array.isArray(bundle.subjects)) {
      bundle.subjects = [];
    }
  }

  // v2 → v3: biweeklyBase (単一文字列) → biweeklyAnchors (配列) に変換。
  if (version < 3) {
    if (
      isString(bundle.biweeklyBase) &&
      (bundle.biweeklyBase as string).length > 0
    ) {
      bundle.biweeklyAnchors = [
        { date: bundle.biweeklyBase as string, weekType: "A" },
      ];
    } else if (!Array.isArray(bundle.biweeklyAnchors)) {
      bundle.biweeklyAnchors = [];
    }
  }

  // v3 → v4: timetables / displayCutoff を追加。
  // v4 → v5: Slot に biweeklyAnchors (授業別隔週基準) を追加。
  //           フィールドは optional のため既存データの変換は不要。
  if (version < 4) {
    if (!Array.isArray(bundle.timetables)) {
      bundle.timetables = [
        {
          id: 1,
          name: "デフォルト",
          type: "regular",
          startDate: null,
          endDate: null,
          grades: [],
        },
      ];
    }
    if (!isObject(bundle.displayCutoff)) {
      bundle.displayCutoff = {
        groups: [
          { label: "中1・2", grades: ["中1", "中2", "附中1", "附中2"], startDate: null, date: null },
          { label: "中3", grades: ["中3", "附中3"], startDate: null, date: null },
          { label: "高1・2", grades: ["高1", "高2"], startDate: null, date: null },
          { label: "高3", grades: ["高3"], startDate: null, date: null },
        ],
      };
    }
  }

  // v5 → v6: examPeriods（テスト期間）を追加。
  if (version < 6) {
    if (!Array.isArray(bundle.examPeriods)) {
      bundle.examPeriods = [];
    }
  }

  // v6 → v7: CutoffGroup に startDate を追加。
  if (version < 7) {
    if (
      isObject(bundle.displayCutoff) &&
      Array.isArray((bundle.displayCutoff as Record<string, unknown>).groups)
    ) {
      const dc = bundle.displayCutoff as Record<string, unknown>;
      dc.groups = (dc.groups as Array<Record<string, unknown>>).map((g) => ({
        ...g,
        startDate: g.startDate ?? null,
      }));
    }
  }

  bundle.schemaVersion = CURRENT_SCHEMA_VERSION;
  return bundle;
}

// ─── Default timetable / cutoff ───────────────────────────────────
export const DEFAULT_TIMETABLE: Timetable = {
  id: 1,
  name: "デフォルト",
  type: "regular",
  startDate: null,
  endDate: null,
  grades: [],
};

export const DEFAULT_DISPLAY_CUTOFF: DisplayCutoff = {
  groups: [
    { label: "中1・2", grades: ["中1", "中2", "附中1", "附中2"], startDate: null, date: null },
    { label: "中3", grades: ["中3", "附中3"], startDate: null, date: null },
    { label: "高1・2", grades: ["高1", "高2"], startDate: null, date: null },
    { label: "高3", grades: ["高3"], startDate: null, date: null },
  ],
};

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
