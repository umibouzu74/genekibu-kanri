import { describe, it, expect } from "vitest";
import {
  migrateExamPrepSchedules,
  migrateHolidays,
  migratePartTimeStaff,
  migrateSubs,
} from "./migrate";

describe("migrateHolidays", () => {
  it("adds default scope, id, targetGrades, subjKeywords when missing", () => {
    const input = [{ date: "2026-01-01", label: "元旦" }];
    const result = migrateHolidays(input);
    expect(result).toEqual([
      { date: "2026-01-01", label: "元旦", id: 1, scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ]);
  });

  it("preserves existing scope", () => {
    const input = [{ date: "2026-01-01", label: "元旦", scope: ["中学部"] }];
    const result = migrateHolidays(input);
    expect(result[0].scope).toEqual(["中学部"]);
  });

  it("preserves existing id, targetGrades, subjKeywords", () => {
    const input = [
      { id: 42, date: "2026-01-01", label: "x", scope: ["高校部"], targetGrades: ["高1"], subjKeywords: ["高松西"] },
    ];
    const result = migrateHolidays(input);
    expect(result[0].id).toBe(42);
    expect(result[0].targetGrades).toEqual(["高1"]);
    expect(result[0].subjKeywords).toEqual(["高松西"]);
  });

  it("assigns sequential ids to entries without id", () => {
    const input = [
      { date: "2026-01-01", label: "a" },
      { date: "2026-01-02", label: "b" },
    ];
    const result = migrateHolidays(input);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });

  it("returns non-array input unchanged", () => {
    expect(migrateHolidays(null)).toBe(null);
    expect(migrateHolidays(undefined)).toBe(undefined);
    expect(migrateHolidays("bad")).toBe("bad");
  });
});

describe("migratePartTimeStaff", () => {
  it("converts string entries to PartTimeStaffObject", () => {
    const result = migratePartTimeStaff(["田中", "佐藤"]);
    expect(result).toEqual([
      { name: "田中", subjectIds: [] },
      { name: "佐藤", subjectIds: [] },
    ]);
  });

  it("preserves existing object entries", () => {
    const input = [{ name: "田中", subjectIds: [1, 2] }];
    const result = migratePartTimeStaff(input);
    expect(result).toEqual([{ name: "田中", subjectIds: [1, 2] }]);
  });

  it("handles mixed arrays", () => {
    const input = ["田中", { name: "佐藤", subjectIds: [3] }];
    const result = migratePartTimeStaff(input);
    expect(result).toEqual([
      { name: "田中", subjectIds: [] },
      { name: "佐藤", subjectIds: [3] },
    ]);
  });

  it("handles malformed objects gracefully", () => {
    const input = [{ foo: "bar" }];
    const result = migratePartTimeStaff(input);
    expect(result).toEqual([{ name: "", subjectIds: [] }]);
  });

  it("returns non-array input unchanged", () => {
    expect(migratePartTimeStaff(null)).toBe(null);
    expect(migratePartTimeStaff(undefined)).toBe(undefined);
  });
});

describe("migrateExamPrepSchedules", () => {
  it("restores assignments dropped by Firebase RTDB empty-object behaviour", () => {
    const input = [
      {
        examPeriodId: 1,
        days: [
          {
            date: "2026-05-08",
            periods: [{ no: 1, start: "18:00", end: "18:50" }],
            // assignments missing (Firebase dropped the empty {})
          },
        ],
      },
    ];
    const result = migrateExamPrepSchedules(input);
    expect(result[0].days[0].assignments).toEqual({});
  });

  it("preserves existing non-empty assignments", () => {
    const input = [
      {
        examPeriodId: 1,
        days: [
          {
            date: "2026-05-08",
            periods: [{ no: 1, start: "18:00", end: "18:50" }],
            assignments: { 福武: [1] },
          },
        ],
      },
    ];
    const result = migrateExamPrepSchedules(input);
    expect(result[0].days[0].assignments).toEqual({ 福武: [1] });
  });

  it("defaults missing periods to empty array", () => {
    const input = [{ examPeriodId: 1, days: [{ date: "2026-05-08" }] }];
    const result = migrateExamPrepSchedules(input);
    expect(result[0].days[0].periods).toEqual([]);
    expect(result[0].days[0].assignments).toEqual({});
  });

  it("defaults missing days to empty array", () => {
    const input = [{ examPeriodId: 1 }];
    const result = migrateExamPrepSchedules(input);
    expect(result[0].days).toEqual([]);
  });

  it("returns non-array input unchanged", () => {
    expect(migrateExamPrepSchedules(null)).toBe(null);
    expect(migrateExamPrepSchedules(undefined)).toBe(undefined);
  });
});

describe("migrateSubs", () => {
  it('renames "completed" status to "confirmed"', () => {
    const input = [{ id: 1, status: "completed" }, { id: 2, status: "requested" }];
    const result = migrateSubs(input);
    expect(result[0].status).toBe("confirmed");
    expect(result[1].status).toBe("requested");
  });

  it("preserves already-valid statuses", () => {
    const input = [{ id: 1, status: "confirmed" }];
    const result = migrateSubs(input);
    expect(result[0].status).toBe("confirmed");
  });

  it("returns non-array input unchanged", () => {
    expect(migrateSubs(null)).toBe(null);
    expect(migrateSubs(undefined)).toBe(undefined);
  });
});
