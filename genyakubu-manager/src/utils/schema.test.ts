import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  isBiweeklyAnchor,
  isCutoffGroup,
  isExamPeriod,
  isExamPrepSchedule,
  isHoliday,
  isPartTimeStaffObject,
  isScheduleAdjustment,
  isSlot,
  isSub,
  isSubject,
  isSubjectCategory,
  migrateExportBundle,
  nextNumericId,
  validateExportBundle,
} from "./schema";

const goodSlot = {
  id: 1,
  day: "月",
  time: "19:00-20:20",
  grade: "中1",
  cls: "S",
  room: "601",
  subj: "英語",
  teacher: "山田",
  note: "",
};

const goodHoliday = { date: "2026-01-01", label: "元日", scope: ["全部"] };

const goodSub = {
  id: 1,
  date: "2026-04-10",
  slotId: 1,
  originalTeacher: "山田",
  substitute: "鈴木",
  status: "confirmed",
  memo: "",
};

describe("type guards", () => {
  it("isSlot accepts a valid slot", () => {
    expect(isSlot(goodSlot)).toBe(true);
  });

  it("isSlot accepts a slot with valid biweeklyAnchors", () => {
    expect(
      isSlot({
        ...goodSlot,
        biweeklyAnchors: [{ date: "2026-04-06", weekType: "A" }],
      })
    ).toBe(true);
  });

  it("isSlot accepts a slot with empty biweeklyAnchors", () => {
    expect(isSlot({ ...goodSlot, biweeklyAnchors: [] })).toBe(true);
  });

  it("isSlot accepts a slot without biweeklyAnchors (undefined)", () => {
    expect(isSlot({ ...goodSlot, biweeklyAnchors: undefined })).toBe(true);
  });

  it("isSlot rejects a slot with invalid biweeklyAnchors", () => {
    expect(isSlot({ ...goodSlot, biweeklyAnchors: "bad" })).toBe(false);
    expect(
      isSlot({ ...goodSlot, biweeklyAnchors: [{ date: "2026-04-06" }] })
    ).toBe(false); // missing weekType
  });

  it("isSlot rejects a slot without id", () => {
    expect(isSlot({ ...goodSlot, id: undefined })).toBe(false);
  });

  it("isSlot rejects non-objects", () => {
    expect(isSlot(null)).toBe(false);
    expect(isSlot("nope")).toBe(false);
    expect(isSlot([])).toBe(false);
  });

  it("isHoliday requires a date string", () => {
    expect(isHoliday(goodHoliday)).toBe(true);
    expect(isHoliday({ label: "x" })).toBe(false);
  });

  it("isHoliday accepts new-format with targetGrades and subjKeywords", () => {
    expect(
      isHoliday({
        id: 1,
        date: "2026-06-04",
        label: "高松西試験",
        scope: ["高校部"],
        targetGrades: ["高1"],
        subjKeywords: ["高松西"],
      })
    ).toBe(true);
  });

  it("isHoliday rejects invalid targetGrades", () => {
    expect(isHoliday({ date: "2026-01-01", targetGrades: "bad" })).toBe(false);
  });

  it("isSub accepts numeric and string slotId", () => {
    expect(isSub(goodSub)).toBe(true);
    expect(isSub({ ...goodSub, slotId: "abc" })).toBe(true);
    expect(isSub({ ...goodSub, slotId: null })).toBe(false);
  });

  it("isSubjectCategory requires id and name", () => {
    expect(isSubjectCategory({ id: 1, name: "文系" })).toBe(true);
    expect(isSubjectCategory({ id: 1, name: "文系", color: "#c44" })).toBe(true);
    expect(isSubjectCategory({ name: "文系" })).toBe(false);
    expect(isSubjectCategory({ id: 1 })).toBe(false);
  });

  it("isSubject requires id, name and numeric categoryId", () => {
    expect(isSubject({ id: 1, name: "英語", categoryId: 1 })).toBe(true);
    expect(isSubject({ id: 1, name: "英語" })).toBe(false);
    expect(isSubject({ id: 1, name: "英語", categoryId: "1" })).toBe(false);
  });

  it("isPartTimeStaffObject requires name and subjectIds array", () => {
    expect(isPartTimeStaffObject({ name: "田中", subjectIds: [] })).toBe(true);
    expect(isPartTimeStaffObject({ name: "田中", subjectIds: [1, 2] })).toBe(true);
    expect(isPartTimeStaffObject({ name: "田���" })).toBe(false);
    expect(isPartTimeStaffObject("田中")).toBe(false);
  });

  it("isBiweeklyAnchor requires date string and weekType 'A'", () => {
    expect(isBiweeklyAnchor({ date: "2026-04-06", weekType: "A" })).toBe(true);
    expect(isBiweeklyAnchor({ date: "2026-04-06", weekType: "B" })).toBe(false);
    expect(isBiweeklyAnchor({ date: "2026-04-06" })).toBe(false);
    expect(isBiweeklyAnchor({ weekType: "A" })).toBe(false);
    expect(isBiweeklyAnchor("2026-04-06")).toBe(false);
    expect(isBiweeklyAnchor(null)).toBe(false);
  });

  it("isScheduleAdjustment requires id, date, type, slotId", () => {
    expect(
      isScheduleAdjustment({ id: 1, date: "2026-04-10", type: "move", slotId: 3, memo: "" })
    ).toBe(true);
    expect(
      isScheduleAdjustment({ id: 2, date: "2026-04-10", type: "combine", slotId: 3, combineSlotIds: [4] })
    ).toBe(true);
    expect(
      isScheduleAdjustment({
        id: 3,
        date: "2026-04-10",
        type: "reschedule",
        slotId: 3,
        targetDate: "2026-04-17",
        targetTime: "19:00-20:20",
        memo: "",
      })
    ).toBe(true);
    // reschedule は targetDate が ISO 形式必須
    expect(
      isScheduleAdjustment({
        id: 4,
        date: "2026-04-10",
        type: "reschedule",
        slotId: 3,
        memo: "",
      })
    ).toBe(false);
    expect(
      isScheduleAdjustment({
        id: 5,
        date: "2026-04-10",
        type: "reschedule",
        slotId: 3,
        targetDate: "not-a-date",
        memo: "",
      })
    ).toBe(false);
    // targetTeacher は文字列のみ
    expect(
      isScheduleAdjustment({
        id: 6,
        date: "2026-04-10",
        type: "reschedule",
        slotId: 3,
        targetDate: "2026-04-17",
        targetTeacher: 123,
        memo: "",
      })
    ).toBe(false);
    expect(
      isScheduleAdjustment({ id: 1, date: "2026-04-10", type: "cancel", slotId: 3 })
    ).toBe(false); // "cancel" is not a valid type
    expect(
      isScheduleAdjustment({ date: "2026-04-10", type: "move", slotId: 3 })
    ).toBe(false); // missing id
    expect(isScheduleAdjustment(null)).toBe(false);
  });

  it("isExamPeriod requires id, name, startDate, endDate, targetGrades", () => {
    expect(
      isExamPeriod({
        id: 1,
        name: "1学期中間テスト",
        startDate: "2026-05-08",
        endDate: "2026-05-14",
        targetGrades: ["中1", "中2", "中3"],
      })
    ).toBe(true);
    expect(
      isExamPeriod({
        id: 2,
        name: "期末テスト",
        startDate: "2026-06-20",
        endDate: "2026-06-26",
        targetGrades: [],
      })
    ).toBe(true); // empty = all grades
    expect(
      isExamPeriod({ name: "テスト", startDate: "2026-05-08", endDate: "2026-05-14", targetGrades: [] })
    ).toBe(false); // missing id
    expect(
      isExamPeriod({ id: 1, startDate: "2026-05-08", endDate: "2026-05-14", targetGrades: [] })
    ).toBe(false); // missing name
    expect(
      isExamPeriod({ id: 1, name: "テスト", startDate: "2026-05-08", endDate: "2026-05-14" })
    ).toBe(false); // missing targetGrades
    expect(isExamPeriod(null)).toBe(false);
  });

  it("isExamPrepSchedule requires examPeriodId and days with valid periods", () => {
    expect(
      isExamPrepSchedule({
        examPeriodId: 1,
        days: [
          {
            date: "2026-05-08",
            periods: [{ no: 1, start: "18:00", end: "18:50" }],
            assignments: { 福武: [1] },
          },
        ],
      })
    ).toBe(true);
    // assignments 欠落は許容（Firebase RTDB が空オブジェクトを破棄するため）
    expect(
      isExamPrepSchedule({
        examPeriodId: 1,
        days: [
          { date: "2026-05-08", periods: [{ no: 1, start: "18:00", end: "18:50" }] },
        ],
      })
    ).toBe(true);
    // 値が配列でない assignments は不正
    expect(
      isExamPrepSchedule({
        examPeriodId: 1,
        days: [
          {
            date: "2026-05-08",
            periods: [{ no: 1, start: "18:00", end: "18:50" }],
            assignments: { 福武: "not-an-array" },
          },
        ],
      })
    ).toBe(false);
    expect(isExamPrepSchedule(null)).toBe(false);
    expect(isExamPrepSchedule({ examPeriodId: 1 })).toBe(false); // days 欠落
  });
});

describe("validateExportBundle", () => {
  it("returns ok for an empty object", () => {
    expect(validateExportBundle({})).toEqual({ ok: true, data: {} });
  });

  it("accepts a well-formed bundle (legacy partTimeStaff)", () => {
    const bundle = {
      schemaVersion: 1,
      slots: [goodSlot],
      holidays: [goodHoliday],
      substitutions: [goodSub],
      partTimeStaff: ["田中"],
      biweeklyBase: "2026-04-01",
    };
    const r = validateExportBundle(bundle);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual(bundle);
  });

  it("accepts a well-formed v2 bundle with subjects", () => {
    const bundle = {
      schemaVersion: 2,
      slots: [goodSlot],
      holidays: [goodHoliday],
      substitutions: [goodSub],
      partTimeStaff: [{ name: "田中", subjectIds: [1, 2] }],
      subjectCategories: [{ id: 1, name: "文系", color: "#c44" }],
      subjects: [{ id: 1, name: "英語", categoryId: 1 }],
      biweeklyBase: "2026-04-01",
    };
    const r = validateExportBundle(bundle);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual(bundle);
  });

  it("rejects malformed partTimeStaff entries", () => {
    const r = validateExportBundle({
      partTimeStaff: ["田中", { name: "山田" }], // subjectIds missing
    });
    expect(r.ok).toBe(false);
    expect(r.path).toBe("partTimeStaff[1]");
  });

  it("rejects malformed subject categories", () => {
    const r = validateExportBundle({
      subjectCategories: [{ id: 1, name: "文系" }, { name: "理系" }],
    });
    expect(r.ok).toBe(false);
    expect(r.path).toBe("subjectCategories[1]");
  });

  it("rejects malformed subjects", () => {
    const r = validateExportBundle({
      subjects: [{ id: 1, name: "英語", categoryId: 1 }, { id: 2, name: "数学" }],
    });
    expect(r.ok).toBe(false);
    expect(r.path).toBe("subjects[1]");
  });

  it("rejects non-objects", () => {
    expect(validateExportBundle(null).ok).toBe(false);
    expect(validateExportBundle([]).ok).toBe(false);
    expect(validateExportBundle("foo").ok).toBe(false);
  });

  it("reports the bad index for an invalid slot", () => {
    const r = validateExportBundle({
      slots: [goodSlot, { ...goodSlot, teacher: 42 }],
    });
    expect(r.ok).toBe(false);
    expect(r.path).toBe("slots[1]");
  });

  it("reports the bad index for an invalid holiday", () => {
    const r = validateExportBundle({ holidays: [goodHoliday, {}] });
    expect(r.ok).toBe(false);
    expect(r.path).toBe("holidays[1]");
  });

  it("rejects non-array slots", () => {
    const r = validateExportBundle({ slots: "nope" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/slots/);
  });

  it("rejects non-string biweeklyBase", () => {
    const r = validateExportBundle({ biweeklyBase: 123 });
    expect(r.ok).toBe(false);
  });

  it("accepts a well-formed v3 bundle with biweeklyAnchors", () => {
    const bundle = {
      schemaVersion: 3,
      slots: [goodSlot],
      biweeklyAnchors: [
        { date: "2026-04-06", weekType: "A" as const },
        { date: "2026-06-08", weekType: "A" as const },
      ],
    };
    const r = validateExportBundle(bundle);
    expect(r.ok).toBe(true);
  });

  it("accepts an empty biweeklyAnchors array", () => {
    const r = validateExportBundle({ biweeklyAnchors: [] });
    expect(r.ok).toBe(true);
  });

  it("rejects non-array biweeklyAnchors", () => {
    const r = validateExportBundle({ biweeklyAnchors: "bad" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/biweeklyAnchors/);
  });

  it("rejects malformed biweeklyAnchors entries", () => {
    const r = validateExportBundle({
      biweeklyAnchors: [
        { date: "2026-04-06", weekType: "A" },
        { date: "2026-06-08" }, // missing weekType
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.path).toBe("biweeklyAnchors[1]");
  });

  it("accepts a well-formed adjustments array", () => {
    const r = validateExportBundle({
      adjustments: [
        { id: 1, date: "2026-04-10", type: "move", slotId: 3, targetTime: "20:30-21:50", memo: "" },
        { id: 2, date: "2026-04-10", type: "combine", slotId: 3, combineSlotIds: [4], memo: "" },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("accepts an empty adjustments array", () => {
    const r = validateExportBundle({ adjustments: [] });
    expect(r.ok).toBe(true);
  });

  it("rejects non-array adjustments", () => {
    const r = validateExportBundle({ adjustments: "bad" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/adjustments/);
  });

  it("rejects malformed adjustments entries", () => {
    const r = validateExportBundle({
      adjustments: [
        { id: 1, date: "2026-04-10", type: "move", slotId: 3 },
        { date: "2026-04-10", type: "move", slotId: 3 }, // missing id
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.path).toBe("adjustments[1]");
  });

  it("accepts a well-formed examPeriods array", () => {
    const r = validateExportBundle({
      examPeriods: [
        { id: 1, name: "1学期中間テスト", startDate: "2026-05-08", endDate: "2026-05-14", targetGrades: ["中1", "中2"] },
        { id: 2, name: "期末テスト", startDate: "2026-06-20", endDate: "2026-06-26", targetGrades: [] },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("accepts an empty examPeriods array", () => {
    const r = validateExportBundle({ examPeriods: [] });
    expect(r.ok).toBe(true);
  });

  it("rejects non-array examPeriods", () => {
    const r = validateExportBundle({ examPeriods: "bad" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/examPeriods/);
  });

  it("rejects malformed examPeriods entries", () => {
    const r = validateExportBundle({
      examPeriods: [
        { id: 1, name: "テスト", startDate: "2026-05-08", endDate: "2026-05-14", targetGrades: [] },
        { name: "テスト2", startDate: "2026-06-01", endDate: "2026-06-07", targetGrades: [] }, // missing id
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.path).toBe("examPeriods[1]");
  });
});

describe("migrateExportBundle", () => {
  it("adds schemaVersion on unversioned payloads", () => {
    const out = migrateExportBundle({ slots: [] }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("fills in default scope for holidays without one", () => {
    const out = migrateExportBundle({
      holidays: [{ date: "2026-05-04", label: "みどりの日" }],
    }) as Record<string, unknown>;
    const holidays = out.holidays as Array<Record<string, unknown>>;
    expect(holidays[0].scope).toEqual(["全部"]);
  });

  it("leaves existing scope untouched", () => {
    const out = migrateExportBundle({
      schemaVersion: 1,
      holidays: [{ date: "2026-05-04", label: "x", scope: ["中学部"] }],
    }) as Record<string, unknown>;
    const holidays = out.holidays as Array<Record<string, unknown>>;
    expect(holidays[0].scope).toEqual(["中学部"]);
  });

  it("passes through non-object inputs unchanged", () => {
    expect(migrateExportBundle(null)).toBe(null);
    expect(migrateExportBundle("x")).toBe("x");
  });

  it("v1 → v2: converts partTimeStaff from string[] to object array", () => {
    const out = migrateExportBundle({
      schemaVersion: 1,
      partTimeStaff: ["福武", "河野"],
    }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.partTimeStaff).toEqual([
      { name: "福武", subjectIds: [] },
      { name: "河野", subjectIds: [] },
    ]);
  });

  it("v1 → v2: initialises subjectCategories and subjects as empty arrays", () => {
    const out = migrateExportBundle({
      schemaVersion: 1,
      partTimeStaff: [],
    }) as Record<string, unknown>;
    expect(out.subjectCategories).toEqual([]);
    expect(out.subjects).toEqual([]);
  });

  it("v1 → v2: preserves already-migrated object partTimeStaff", () => {
    const out = migrateExportBundle({
      schemaVersion: 1,
      partTimeStaff: [{ name: "福武", subjectIds: [1, 2] }],
    }) as Record<string, unknown>;
    expect(out.partTimeStaff).toEqual([{ name: "福武", subjectIds: [1, 2] }]);
  });

  it("v1 → v2: migrated bundle passes validation", () => {
    const out = migrateExportBundle({
      schemaVersion: 0,
      partTimeStaff: ["福武"],
      holidays: [{ date: "2026-05-04", label: "みどりの日" }],
    });
    const v = validateExportBundle(out);
    expect(v.ok).toBe(true);
  });

  it("v2 → v3: converts biweeklyBase to biweeklyAnchors", () => {
    const out = migrateExportBundle({
      schemaVersion: 2,
      biweeklyBase: "2026-04-06",
    }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.biweeklyAnchors).toEqual([
      { date: "2026-04-06", weekType: "A" },
    ]);
    // biweeklyBase is preserved for backward compat
    expect(out.biweeklyBase).toBe("2026-04-06");
  });

  it("v2 → v3: initialises empty biweeklyAnchors when biweeklyBase is empty", () => {
    const out = migrateExportBundle({
      schemaVersion: 2,
      biweeklyBase: "",
    }) as Record<string, unknown>;
    expect(out.biweeklyAnchors).toEqual([]);
  });

  it("v2 → v3: initialises empty biweeklyAnchors when biweeklyBase is absent", () => {
    const out = migrateExportBundle({
      schemaVersion: 2,
    }) as Record<string, unknown>;
    expect(out.biweeklyAnchors).toEqual([]);
  });

  it("v2 → v3: migrated bundle passes validation", () => {
    const out = migrateExportBundle({
      schemaVersion: 2,
      biweeklyBase: "2026-04-06",
      partTimeStaff: [{ name: "福武", subjectIds: [] }],
    });
    const v = validateExportBundle(out);
    expect(v.ok).toBe(true);
  });

  it("full migration v0 → v3 produces valid bundle", () => {
    const out = migrateExportBundle({
      partTimeStaff: ["福武"],
      holidays: [{ date: "2026-05-04", label: "みどりの日" }],
      biweeklyBase: "2026-04-06",
    });
    const v = validateExportBundle(out);
    expect(v.ok).toBe(true);
    const data = v.data!;
    expect(data.biweeklyAnchors).toEqual([
      { date: "2026-04-06", weekType: "A" },
    ]);
  });

  it("v4 → v5: preserves slots with per-slot biweeklyAnchors", () => {
    const slotWithAnchors = {
      ...goodSlot,
      note: "隔週(河野)",
      biweeklyAnchors: [{ date: "2026-06-08", weekType: "A" }],
    };
    const out = migrateExportBundle({
      schemaVersion: 4,
      slots: [slotWithAnchors],
    }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const slots = out.slots as Array<Record<string, unknown>>;
    expect(slots[0].biweeklyAnchors).toEqual([
      { date: "2026-06-08", weekType: "A" },
    ]);
    const v = validateExportBundle(out);
    expect(v.ok).toBe(true);
  });

  it("v4 → v5: slots without biweeklyAnchors remain valid", () => {
    const out = migrateExportBundle({
      schemaVersion: 4,
      slots: [goodSlot],
    }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const v = validateExportBundle(out);
    expect(v.ok).toBe(true);
  });

  it("v5 → v6: adds empty examPeriods when missing", () => {
    const out = migrateExportBundle({
      schemaVersion: 5,
      slots: [goodSlot],
    }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.examPeriods).toEqual([]);
    const v = validateExportBundle(out);
    expect(v.ok).toBe(true);
  });

  it("v5 → v6: preserves existing examPeriods", () => {
    const existing = [
      { id: 1, name: "中間テスト", startDate: "2026-05-08", endDate: "2026-05-14", targetGrades: ["中1"] },
    ];
    const out = migrateExportBundle({
      schemaVersion: 5,
      examPeriods: existing,
    }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.examPeriods).toEqual(existing);
  });
});

describe("v6 → v7 migration: CutoffGroup startDate", () => {
  it("adds startDate: null to existing cutoff groups", () => {
    const out = migrateExportBundle({
      schemaVersion: 6,
      displayCutoff: {
        groups: [
          { label: "中1・2", grades: ["中1", "中2"], date: "2026-07-18" },
          { label: "高3", grades: ["高3"], date: null },
        ],
      },
    }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const dc = out.displayCutoff as { groups: Array<{ startDate: unknown; date: unknown }> };
    expect(dc.groups[0].startDate).toBe(null);
    expect(dc.groups[0].date).toBe("2026-07-18");
    expect(dc.groups[1].startDate).toBe(null);
    expect(dc.groups[1].date).toBe(null);
  });

  it("preserves existing startDate if present", () => {
    const out = migrateExportBundle({
      schemaVersion: 6,
      displayCutoff: {
        groups: [
          { label: "中", grades: ["中1"], startDate: "2026-04-01", date: "2026-07-18" },
        ],
      },
    }) as Record<string, unknown>;
    const dc = out.displayCutoff as { groups: Array<{ startDate: unknown }> };
    expect(dc.groups[0].startDate).toBe("2026-04-01");
  });
});

describe("isCutoffGroup with startDate", () => {
  it("accepts group with startDate", () => {
    expect(isCutoffGroup({ label: "中", grades: ["中1"], startDate: "2026-04-01", date: null })).toBe(true);
  });

  it("accepts group with null startDate", () => {
    expect(isCutoffGroup({ label: "中", grades: ["中1"], startDate: null, date: null })).toBe(true);
  });

  it("accepts group without startDate (undefined)", () => {
    expect(isCutoffGroup({ label: "中", grades: ["中1"], date: null })).toBe(true);
  });

  it("rejects group with invalid startDate", () => {
    expect(isCutoffGroup({ label: "中", grades: ["中1"], startDate: 123, date: null })).toBe(false);
  });
});

describe("v7 → v8 migration: Holiday id, targetGrades, subjKeywords", () => {
  it("adds id, targetGrades, subjKeywords to holidays without them", () => {
    const out = migrateExportBundle({
      schemaVersion: 7,
      holidays: [
        { date: "2026-06-04", label: "休講", scope: ["高校部"] },
        { date: "2026-06-05", label: "テスト", scope: ["全部"] },
      ],
    }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const holidays = out.holidays as Array<Record<string, unknown>>;
    expect(holidays[0].id).toBe(1);
    expect(holidays[0].targetGrades).toEqual([]);
    expect(holidays[0].subjKeywords).toEqual([]);
    expect(holidays[1].id).toBe(2);
  });

  it("preserves existing id, targetGrades, subjKeywords", () => {
    const out = migrateExportBundle({
      schemaVersion: 7,
      holidays: [
        { id: 99, date: "2026-06-04", label: "x", scope: ["高校部"], targetGrades: ["高1"], subjKeywords: ["高松西"] },
      ],
    }) as Record<string, unknown>;
    const holidays = out.holidays as Array<Record<string, unknown>>;
    expect(holidays[0].id).toBe(99);
    expect(holidays[0].targetGrades).toEqual(["高1"]);
    expect(holidays[0].subjKeywords).toEqual(["高松西"]);
  });

  it("v7 migrated bundle passes validation", () => {
    const out = migrateExportBundle({
      schemaVersion: 7,
      holidays: [{ date: "2026-06-04", label: "休講", scope: ["高校部"] }],
    });
    const v = validateExportBundle(out);
    expect(v.ok).toBe(true);
  });
});

describe("v8 → v9 migration: classSets 初期化", () => {
  it("adds empty classSets when missing", () => {
    const out = migrateExportBundle({
      schemaVersion: 8,
      slots: [],
    }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.classSets).toEqual([]);
  });

  it("preserves existing classSets", () => {
    const existing = [
      { id: 1, label: "中3 数学", slotIds: [100, 101] },
    ];
    const out = migrateExportBundle({
      schemaVersion: 8,
      classSets: existing,
    }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.classSets).toEqual(existing);
  });

  it("v8 migrated bundle passes validation", () => {
    const out = migrateExportBundle({
      schemaVersion: 8,
      slots: [],
    });
    const v = validateExportBundle(out);
    expect(v.ok).toBe(true);
  });

  it("rejects classSets with malformed entries", () => {
    const bundle = {
      schemaVersion: 9,
      classSets: [{ id: "not-a-number", label: "x", slotIds: [1] }],
    };
    const v = validateExportBundle(bundle);
    expect(v.ok).toBe(false);
  });
});

describe("nextNumericId", () => {
  it("returns 1 for an empty list", () => {
    expect(nextNumericId([])).toBe(1);
  });

  it("returns max+1 for a simple list", () => {
    expect(nextNumericId([{ id: 3 }, { id: 5 }, { id: 1 }])).toBe(6);
  });

  it("ignores NaN / non-numeric ids", () => {
    expect(nextNumericId([{ id: 2 }, { id: "abc" }, { id: 7 }])).toBe(8);
  });

  it("accepts a custom key", () => {
    expect(nextNumericId([{ pk: 10 }, { pk: 2 }], "pk")).toBe(11);
  });
});

describe("isBiweeklyAnchor ISO-8601 date check", () => {
  it("accepts a properly formatted date", () => {
    expect(isBiweeklyAnchor({ date: "2026-04-06", weekType: "A" })).toBe(true);
  });

  it("rejects malformed date strings", () => {
    expect(isBiweeklyAnchor({ date: "2026/4/6", weekType: "A" })).toBe(false);
    expect(isBiweeklyAnchor({ date: "April 6, 2026", weekType: "A" })).toBe(false);
    expect(isBiweeklyAnchor({ date: "2026-4-6", weekType: "A" })).toBe(false);
    expect(isBiweeklyAnchor({ date: "", weekType: "A" })).toBe(false);
  });
});

describe("validateExportBundle referential integrity", () => {
  it("rejects substitutions referencing a missing slotId", () => {
    const result = validateExportBundle({
      slots: [goodSlot],
      substitutions: [{ ...goodSub, slotId: 999 }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/substitutions\[0\]/);
    expect(result.path).toBe("substitutions[0].slotId");
  });

  it("accepts substitutions with a matching slotId", () => {
    const result = validateExportBundle({
      slots: [goodSlot],
      substitutions: [{ ...goodSub, slotId: 1 }],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects classSets referencing a missing slotId", () => {
    const result = validateExportBundle({
      slots: [goodSlot],
      classSets: [{ id: 1, label: "grp", slotIds: [1, 42] }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/classSets\[0\]\.slotIds\[1\]/);
  });

  it("rejects adjustments referencing a missing slotId", () => {
    const result = validateExportBundle({
      slots: [goodSlot],
      adjustments: [
        {
          id: 1,
          date: "2026-04-10",
          type: "move",
          slotId: 404,
          memo: "",
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.path).toBe("adjustments[0].slotId");
  });

  it("rejects combine adjustments with bad combineSlotIds", () => {
    const result = validateExportBundle({
      slots: [goodSlot],
      adjustments: [
        {
          id: 1,
          date: "2026-04-10",
          type: "combine",
          slotId: 1,
          combineSlotIds: [1, 99],
          memo: "",
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.path).toBe("adjustments[0].combineSlotIds[1]");
  });

  it("rejects subjects with a missing categoryId", () => {
    const result = validateExportBundle({
      subjectCategories: [{ id: 1, name: "文系" }],
      subjects: [{ id: 1, name: "英語", categoryId: 99 }],
    });
    expect(result.ok).toBe(false);
    expect(result.path).toBe("subjects[0].categoryId");
  });

  it("skips FK checks when slots is not provided (partial import)", () => {
    const result = validateExportBundle({
      substitutions: [{ ...goodSub, slotId: 999 }],
    });
    expect(result.ok).toBe(true);
  });

  it("does not validate combineSlotIds when adjustment type is not 'combine'", () => {
    const result = validateExportBundle({
      slots: [goodSlot],
      adjustments: [
        {
          id: 1,
          date: "2026-04-10",
          type: "move",
          slotId: 1,
          combineSlotIds: [999],
          memo: "",
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("does not validate categoryId FK when subjectCategories is absent", () => {
    const result = validateExportBundle({
      subjects: [{ id: 1, name: "英語", categoryId: 99 }],
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateExportBundle biweeklyAnchors format", () => {
  it("rejects slash-formatted date via validateExportBundle", () => {
    const result = validateExportBundle({
      biweeklyAnchors: [{ date: "2026/04/06", weekType: "A" }],
    });
    expect(result.ok).toBe(false);
    expect(result.path).toBe("biweeklyAnchors[0]");
  });

  it("rejects non-date string via validateExportBundle", () => {
    const result = validateExportBundle({
      biweeklyAnchors: [{ date: "invalid", weekType: "A" }],
    });
    expect(result.ok).toBe(false);
    expect(result.path).toBe("biweeklyAnchors[0]");
  });

  it("rejects empty date string via validateExportBundle", () => {
    const result = validateExportBundle({
      biweeklyAnchors: [{ date: "", weekType: "A" }],
    });
    expect(result.ok).toBe(false);
    expect(result.path).toBe("biweeklyAnchors[0]");
  });

  it("accepts a valid ISO-8601 anchor via validateExportBundle", () => {
    const result = validateExportBundle({
      biweeklyAnchors: [{ date: "2026-04-06", weekType: "A" }],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-array biweeklyAnchors payload", () => {
    const result = validateExportBundle({
      biweeklyAnchors: "not-an-array",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/biweeklyAnchors/);
  });
});
