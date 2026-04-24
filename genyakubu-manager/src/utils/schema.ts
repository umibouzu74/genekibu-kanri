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
  ClassSet,
  CutoffGroup,
  DisplayCutoff,
  ExamPeriod,
  ExamPrepSchedule,
  ExportBundle,
  Holiday,
  PartTimeStaffObject,
  ScheduleAdjustment,
  SessionOverride,
  Slot,
  Subject,
  SubjectCategory,
  Substitute,
  Timetable,
  ValidationResult,
} from "../types";

export const CURRENT_SCHEMA_VERSION = 11;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (v: unknown): v is string =>
  isString(v) && ISO_DATE_RE.test(v);

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
  return (
    isObject(x) &&
    isString(x.date) &&
    (x.targetGrades === undefined || Array.isArray(x.targetGrades)) &&
    (x.subjKeywords === undefined || Array.isArray(x.subjKeywords))
  );
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
  return isObject(x) && isIsoDate(x.date) && x.weekType === "A";
}

export function isScheduleAdjustment(x: unknown): x is ScheduleAdjustment {
  if (
    !(
      isObject(x) &&
      isNumber(x.id) &&
      isString(x.date) &&
      isString(x.type) &&
      (x.type === "move" || x.type === "combine" || x.type === "reschedule") &&
      isNumber(x.slotId)
    )
  ) {
    return false;
  }
  // reschedule は targetDate (ISO 形式) が必須
  if (x.type === "reschedule" && !isIsoDate(x.targetDate)) return false;
  // targetTeacher は省略可だが、入っていれば文字列であること
  if (x.targetTeacher !== undefined && !isString(x.targetTeacher)) return false;
  return true;
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

export function isClassSet(x: unknown): x is ClassSet {
  return (
    isObject(x) &&
    isNumber(x.id) &&
    isString(x.label) &&
    Array.isArray(x.slotIds) &&
    (x.slotIds as unknown[]).every((i) => isNumber(i))
  );
}

export function isSessionOverride(x: unknown): x is SessionOverride {
  if (!isObject(x)) return false;
  if (!isNumber(x.id)) return false;
  if (!isString(x.date)) return false;
  if (!isNumber(x.slotId)) return false;
  if (x.mode !== "set" && x.mode !== "skip") return false;
  if (x.mode === "set" && !isNumber(x.value)) return false;
  if (x.displayAs !== undefined && !isNumber(x.displayAs)) return false;
  return true;
}

export function isExamPrepSchedule(x: unknown): x is ExamPrepSchedule {
  if (!isObject(x)) return false;
  if (!isNumber(x.examPeriodId)) return false;
  if (!Array.isArray(x.days)) return false;
  for (const d of x.days as unknown[]) {
    if (!isObject(d)) return false;
    if (!isString(d.date)) return false;
    if (!Array.isArray(d.periods)) return false;
    for (const p of d.periods as unknown[]) {
      if (!isObject(p)) return false;
      if (!isNumber(p.no)) return false;
      if (!isString(p.start)) return false;
      if (!isString(p.end)) return false;
    }
    if (!isObject(d.assignments)) return false;
    for (const v of Object.values(d.assignments)) {
      if (!Array.isArray(v)) return false;
      if (!v.every((n) => isNumber(n))) return false;
    }
  }
  return true;
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

  if (raw.classSets != null) {
    if (!Array.isArray(raw.classSets))
      return { ok: false, error: "classSets が配列ではありません" };
    const bad = raw.classSets.findIndex((cs: unknown) => !isClassSet(cs));
    if (bad !== -1)
      return {
        ok: false,
        error: `classSets[${bad}] の形式が不正です`,
        path: `classSets[${bad}]`,
      };
  }

  if (raw.sessionOverrides != null) {
    if (!Array.isArray(raw.sessionOverrides))
      return { ok: false, error: "sessionOverrides が配列ではありません" };
    const bad = raw.sessionOverrides.findIndex(
      (o: unknown) => !isSessionOverride(o)
    );
    if (bad !== -1)
      return {
        ok: false,
        error: `sessionOverrides[${bad}] の形式が不正です`,
        path: `sessionOverrides[${bad}]`,
      };
  }

  if (raw.examPrepSchedules != null) {
    if (!Array.isArray(raw.examPrepSchedules))
      return { ok: false, error: "examPrepSchedules が配列ではありません" };
    const bad = raw.examPrepSchedules.findIndex(
      (s: unknown) => !isExamPrepSchedule(s)
    );
    if (bad !== -1)
      return {
        ok: false,
        error: `examPrepSchedules[${bad}] の形式が不正です`,
        path: `examPrepSchedules[${bad}]`,
      };
  }

  // ── Cross-entity referential integrity ────────────────────────────
  // Run only when both sides of a relationship are present in the
  // bundle; skip when only one side is provided (partial import).
  const fkError = validateReferentialIntegrity(raw);
  if (fkError) return fkError;

  return { ok: true, data: raw as unknown as ExportBundle };
}

function toSlotIdKey(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

function validateReferentialIntegrity(
  raw: Record<string, unknown>
): ValidationResult<ExportBundle> | null {
  if (Array.isArray(raw.slots)) {
    const slotIds = new Set<string>();
    for (const s of raw.slots as Array<Record<string, unknown>>) {
      const k = toSlotIdKey(s.id);
      if (k !== null) slotIds.add(k);
    }

    if (Array.isArray(raw.substitutions)) {
      const bad = (
        raw.substitutions as Array<Record<string, unknown>>
      ).findIndex((s) => {
        const k = toSlotIdKey(s.slotId);
        return k === null || !slotIds.has(k);
      });
      if (bad !== -1) {
        const missing = (
          raw.substitutions as Array<Record<string, unknown>>
        )[bad]?.slotId;
        return {
          ok: false,
          error: `substitutions[${bad}] が参照するコマ (slotId=${String(
            missing
          )}) が slots に存在しません`,
          path: `substitutions[${bad}].slotId`,
        };
      }
    }

    if (Array.isArray(raw.classSets)) {
      const list = raw.classSets as Array<Record<string, unknown>>;
      for (let i = 0; i < list.length; i++) {
        const ids = list[i].slotIds;
        if (!Array.isArray(ids)) continue;
        for (let j = 0; j < ids.length; j++) {
          const k = toSlotIdKey(ids[j]);
          if (k === null || !slotIds.has(k)) {
            return {
              ok: false,
              error: `classSets[${i}].slotIds[${j}] (${String(
                ids[j]
              )}) が slots に存在しません`,
              path: `classSets[${i}].slotIds[${j}]`,
            };
          }
        }
      }
    }

    if (Array.isArray(raw.adjustments)) {
      const list = raw.adjustments as Array<Record<string, unknown>>;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        const k = toSlotIdKey(a.slotId);
        if (k === null || !slotIds.has(k)) {
          return {
            ok: false,
            error: `adjustments[${i}].slotId (${String(
              a.slotId
            )}) が slots に存在しません`,
            path: `adjustments[${i}].slotId`,
          };
        }
        if (a.type === "combine" && Array.isArray(a.combineSlotIds)) {
          for (let j = 0; j < a.combineSlotIds.length; j++) {
            const ck = toSlotIdKey(a.combineSlotIds[j]);
            if (ck === null || !slotIds.has(ck)) {
              return {
                ok: false,
                error: `adjustments[${i}].combineSlotIds[${j}] (${String(
                  a.combineSlotIds[j]
                )}) が slots に存在しません`,
                path: `adjustments[${i}].combineSlotIds[${j}]`,
              };
            }
          }
        }
      }
    }

    if (Array.isArray(raw.sessionOverrides)) {
      const list = raw.sessionOverrides as Array<Record<string, unknown>>;
      for (let i = 0; i < list.length; i++) {
        const k = toSlotIdKey(list[i].slotId);
        if (k === null || !slotIds.has(k)) {
          return {
            ok: false,
            error: `sessionOverrides[${i}].slotId (${String(
              list[i].slotId
            )}) が slots に存在しません`,
            path: `sessionOverrides[${i}].slotId`,
          };
        }
      }
    }
  }

  if (
    Array.isArray(raw.subjects) &&
    Array.isArray(raw.subjectCategories)
  ) {
    const catIds = new Set<number>();
    for (const c of raw.subjectCategories as Array<Record<string, unknown>>) {
      if (typeof c.id === "number") catIds.add(c.id);
    }
    const bad = (raw.subjects as Array<Record<string, unknown>>).findIndex(
      (s) =>
        typeof s.categoryId !== "number" || !catIds.has(s.categoryId as number)
    );
    if (bad !== -1) {
      const s = (raw.subjects as Array<Record<string, unknown>>)[bad];
      return {
        ok: false,
        error: `subjects[${bad}] の categoryId (${String(
          s?.categoryId
        )}) が subjectCategories に存在しません`,
        path: `subjects[${bad}].categoryId`,
      };
    }
  }

  return null;
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

  // v7 → v8: Holiday に id, targetGrades, subjKeywords を追加。
  //           同一日付に複数の休講日エントリを登録可能に。
  if (version < 8) {
    if (Array.isArray(bundle.holidays)) {
      bundle.holidays = (
        bundle.holidays as Array<Record<string, unknown>>
      ).map((h, i) => ({
        ...h,
        id: isNumber(h.id) ? h.id : i + 1,
        targetGrades: Array.isArray(h.targetGrades) ? h.targetGrades : [],
        subjKeywords: Array.isArray(h.subjKeywords) ? h.subjKeywords : [],
      }));
    }
  }

  // v8 → v9: classSets (授業セット) を追加。
  //           既存データは空配列で初期化。
  if (version < 9) {
    if (!Array.isArray(bundle.classSets)) {
      bundle.classSets = [];
    }
  }

  // v9 → v10: sessionOverrides (回数手動補正) を追加。
  //            既存データは空配列で初期化。
  if (version < 10) {
    if (!Array.isArray(bundle.sessionOverrides)) {
      bundle.sessionOverrides = [];
    }
  }

  // v10 → v11: examPrepSchedules (テスト直前特訓シフト) を追加。
  //             既存データは空配列で初期化。
  if (version < 11) {
    if (!Array.isArray(bundle.examPrepSchedules)) {
      bundle.examPrepSchedules = [];
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
