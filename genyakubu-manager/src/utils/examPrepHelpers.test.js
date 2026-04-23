import { describe, expect, it } from "vitest";
import {
  copyDay,
  findDay,
  findScheduleByExamPeriodId,
  getExamPrepShiftsForStaff,
  isTimeRangeValid,
  nextPeriodNo,
  removeDay,
  removeSchedulesForPeriod,
  timeStrToMin,
  upsertDay,
} from "./examPrepHelpers";
import { eachDateStrInRange } from "./dateHelpers";

const examPeriods = [
  { id: 1, name: "1 学期中間", startDate: "2026-05-08", endDate: "2026-05-14", targetGrades: [] },
];

const day58 = {
  date: "2026-05-08",
  periods: [
    { no: 1, start: "18:00", end: "18:50" },
    { no: 2, start: "19:00", end: "19:50" },
    { no: 3, start: "20:00", end: "20:50" },
    { no: 4, start: "21:00", end: "21:50" },
  ],
  assignments: { 福武: [1, 2, 3, 4], 江本: [1, 2, 3] },
};

const schedules = [{ examPeriodId: 1, days: [day58] }];

describe("getExamPrepShiftsForStaff", () => {
  it("returns shifts for staff with assignments on an exam date", () => {
    const shifts = getExamPrepShiftsForStaff("福武", "2026-05-08", examPeriods, schedules);
    expect(shifts).toHaveLength(4);
    expect(shifts[0]).toMatchObject({ no: 1, start: "18:00", end: "18:50" });
    expect(shifts[3]).toMatchObject({ no: 4, start: "21:00", end: "21:50" });
  });

  it("returns partial shifts when staff only works some periods", () => {
    const shifts = getExamPrepShiftsForStaff("江本", "2026-05-08", examPeriods, schedules);
    expect(shifts.map((s) => s.no)).toEqual([1, 2, 3]);
  });

  it("returns [] when date is outside any exam period", () => {
    expect(
      getExamPrepShiftsForStaff("福武", "2026-05-20", examPeriods, schedules)
    ).toEqual([]);
  });

  it("returns [] when staff has no assignments", () => {
    expect(
      getExamPrepShiftsForStaff("香川", "2026-05-08", examPeriods, schedules)
    ).toEqual([]);
  });

  it("returns [] when no schedule exists for the exam period", () => {
    expect(
      getExamPrepShiftsForStaff("福武", "2026-05-08", examPeriods, [])
    ).toEqual([]);
  });

  it("returns [] when day is not configured", () => {
    expect(
      getExamPrepShiftsForStaff("福武", "2026-05-09", examPeriods, schedules)
    ).toEqual([]);
  });

  it("handles falsy inputs safely", () => {
    expect(getExamPrepShiftsForStaff(null, "2026-05-08", examPeriods, schedules)).toEqual([]);
    expect(getExamPrepShiftsForStaff("福武", "", examPeriods, schedules)).toEqual([]);
    expect(getExamPrepShiftsForStaff("福武", "2026-05-08", null, schedules)).toEqual([]);
    expect(getExamPrepShiftsForStaff("福武", "2026-05-08", examPeriods, null)).toEqual([]);
  });
});

describe("findScheduleByExamPeriodId / findDay", () => {
  it("finds by id", () => {
    expect(findScheduleByExamPeriodId(schedules, 1)?.examPeriodId).toBe(1);
    expect(findScheduleByExamPeriodId(schedules, 99)).toBeNull();
  });
  it("finds day within a schedule", () => {
    const sch = findScheduleByExamPeriodId(schedules, 1);
    expect(findDay(sch, "2026-05-08")?.date).toBe("2026-05-08");
    expect(findDay(sch, "2026-05-09")).toBeNull();
    expect(findDay(null, "2026-05-08")).toBeNull();
  });
});

describe("nextPeriodNo", () => {
  it("returns 1 for empty", () => {
    expect(nextPeriodNo([])).toBe(1);
    expect(nextPeriodNo(undefined)).toBe(1);
  });
  it("returns max + 1", () => {
    expect(nextPeriodNo([{ no: 1 }, { no: 3 }])).toBe(4);
  });
});

describe("timeStrToMin / isTimeRangeValid", () => {
  it("parses HH:MM", () => {
    expect(timeStrToMin("18:00")).toBe(1080);
    expect(timeStrToMin("08:30")).toBe(510);
  });
  it("returns NaN for invalid", () => {
    expect(timeStrToMin("25:00")).toBeNaN();
    expect(timeStrToMin("abc")).toBeNaN();
    expect(timeStrToMin(null)).toBeNaN();
  });
  it("validates ranges", () => {
    expect(isTimeRangeValid("18:00", "18:50")).toBe(true);
    expect(isTimeRangeValid("18:50", "18:00")).toBe(false);
    expect(isTimeRangeValid("18:00", "18:00")).toBe(false);
    expect(isTimeRangeValid("abc", "18:00")).toBe(false);
  });
});

describe("upsertDay / removeDay / removeSchedulesForPeriod", () => {
  it("adds a new schedule when examPeriodId not present", () => {
    const next = upsertDay([], 7, day58);
    expect(next).toHaveLength(1);
    expect(next[0].examPeriodId).toBe(7);
    expect(next[0].days[0].date).toBe("2026-05-08");
  });

  it("appends a new day to an existing schedule", () => {
    const next = upsertDay(schedules, 1, { date: "2026-05-11", periods: [], assignments: {} });
    expect(next[0].days).toHaveLength(2);
  });

  it("replaces an existing day by date", () => {
    const replaced = { ...day58, assignments: { 福武: [1] } };
    const next = upsertDay(schedules, 1, replaced);
    expect(next[0].days).toHaveLength(1);
    expect(next[0].days[0].assignments.福武).toEqual([1]);
  });

  it("removeDay drops the day and schedule when empty", () => {
    const next = removeDay(schedules, 1, "2026-05-08");
    expect(next).toEqual([]);
  });

  it("removeDay keeps other days", () => {
    const two = upsertDay(schedules, 1, {
      date: "2026-05-11",
      periods: [],
      assignments: {},
    });
    const next = removeDay(two, 1, "2026-05-08");
    expect(next).toHaveLength(1);
    expect(next[0].days).toHaveLength(1);
    expect(next[0].days[0].date).toBe("2026-05-11");
  });

  it("removeSchedulesForPeriod drops matching exam period", () => {
    const multi = [...schedules, { examPeriodId: 2, days: [] }];
    const next = removeSchedulesForPeriod(multi, 1);
    expect(next).toHaveLength(1);
    expect(next[0].examPeriodId).toBe(2);
  });
});

describe("copyDay", () => {
  it("copies a day's periods + assignments to multiple target dates", () => {
    const next = copyDay(schedules, 1, "2026-05-08", ["2026-05-11", "2026-05-12"]);
    const sch = findScheduleByExamPeriodId(next, 1);
    const d11 = findDay(sch, "2026-05-11");
    const d12 = findDay(sch, "2026-05-12");
    expect(d11.periods).toHaveLength(4);
    expect(d11.assignments.福武).toEqual([1, 2, 3, 4]);
    expect(d12.assignments.江本).toEqual([1, 2, 3]);
    // deep-copied
    d11.periods[0].start = "99:99";
    expect(findDay(findScheduleByExamPeriodId(schedules, 1), "2026-05-08").periods[0].start).toBe(
      "18:00"
    );
  });

  it("skips fromDate when present in toDates", () => {
    const next = copyDay(schedules, 1, "2026-05-08", ["2026-05-08", "2026-05-11"]);
    const sch = findScheduleByExamPeriodId(next, 1);
    expect(sch.days).toHaveLength(2);
  });

  it("no-op when source day doesn't exist", () => {
    const next = copyDay(schedules, 1, "2026-05-99", ["2026-05-11"]);
    expect(next).toBe(schedules);
  });
});

describe("eachDateStrInRange integration", () => {
  it("lists all dates in the exam period", () => {
    const dates = eachDateStrInRange("2026-05-08", "2026-05-14");
    expect(dates).toEqual([
      "2026-05-08",
      "2026-05-09",
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
    ]);
  });

  it("returns [] for invalid ranges", () => {
    expect(eachDateStrInRange("2026-05-14", "2026-05-08")).toEqual([]);
    expect(eachDateStrInRange("", "2026-05-08")).toEqual([]);
  });
});
