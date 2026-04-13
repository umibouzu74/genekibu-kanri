import { describe, expect, it } from "vitest";
import {
  dateToDay,
  fmtDate,
  fmtDateWeekday,
  getSubForSlot,
  gradeToDept,
  isKameiRoom,
  monthlyTally,
  sortSlots,
  staffMonthlyAbsenceDates,
  staffMonthlyRegularDates,
  staffMonthlyWorkDates,
  timeToMin,
} from "./data";

describe("timeToMin", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(timeToMin("00:00")).toBe(0);
    expect(timeToMin("19:00")).toBe(19 * 60);
    expect(timeToMin("19:30")).toBe(19 * 60 + 30);
  });
});

describe("sortSlots", () => {
  const a = { day: "水", time: "19:00-20:20" };
  const b = { day: "月", time: "20:30-21:50" };
  const c = { day: "月", time: "19:00-20:20" };

  it("orders by day-of-week first then start time", () => {
    const sorted = sortSlots([a, b, c]);
    expect(sorted.map((s) => `${s.day}-${s.time}`)).toEqual([
      "月-19:00-20:20",
      "月-20:30-21:50",
      "水-19:00-20:20",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [a, b, c];
    const copy = [...input];
    sortSlots(input);
    expect(input).toEqual(copy);
  });
});

describe("fmtDate", () => {
  it("zero-pads month and day", () => {
    expect(fmtDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(fmtDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("gradeToDept", () => {
  it.each([
    ["中1", "中学部"],
    ["中3", "中学部"],
    ["附中2", "中学部"],
    ["高1", "高校部"],
    ["高3", "高校部"],
  ])("maps %s to %s", (grade, dept) => {
    expect(gradeToDept(grade)).toBe(dept);
  });

  it("returns null for unknown grades", () => {
    expect(gradeToDept("X")).toBe(null);
  });
});

describe("isKameiRoom", () => {
  it("identifies rooms that start with 亀", () => {
    expect(isKameiRoom("亀21")).toBe(true);
    expect(isKameiRoom("亀3")).toBe(true);
    expect(isKameiRoom("601")).toBe(false);
    expect(isKameiRoom(undefined)).toBeFalsy();
  });
});

describe("dateToDay", () => {
  it("maps a YYYY-MM-DD string to its day-of-week label", () => {
    // 2026-04-11 is a Saturday
    expect(dateToDay("2026-04-11")).toBe("土");
    // 2026-04-13 is a Monday
    expect(dateToDay("2026-04-13")).toBe("月");
  });

  it("returns null for Sunday (not a lesson day)", () => {
    // 2026-04-12 is a Sunday - not in DAYS
    expect(dateToDay("2026-04-12")).toBe(null);
  });

  it("returns null for missing input", () => {
    expect(dateToDay("")).toBe(null);
    expect(dateToDay(null)).toBe(null);
  });
});

describe("fmtDateWeekday", () => {
  it("appends the weekday in parens", () => {
    expect(fmtDateWeekday("2026-04-11")).toBe("2026-04-11 (土)");
  });

  it("returns empty string on empty input", () => {
    expect(fmtDateWeekday("")).toBe("");
  });
});

describe("getSubForSlot", () => {
  const subs = [
    { slotId: 1, date: "2026-04-10", id: 100 },
    { slotId: 1, date: "2026-04-11", id: 101 },
    { slotId: 2, date: "2026-04-10", id: 102 },
  ];

  it("finds the matching substitution", () => {
    expect(getSubForSlot(subs, 1, "2026-04-11")?.id).toBe(101);
  });

  it("returns null for no match", () => {
    expect(getSubForSlot(subs, 1, "2026-04-12")).toBe(null);
  });

  it("tolerates missing subs array", () => {
    expect(getSubForSlot(null, 1, "2026-04-10")).toBe(null);
  });
});

describe("monthlyTally", () => {
  it("counts confirmed subs per month, excluding requested", () => {
    const subs = [
      { date: "2026-04-10", status: "confirmed", substitute: "山田", originalTeacher: "鈴木" },
      { date: "2026-04-12", status: "confirmed", substitute: "山田", originalTeacher: "鈴木" },
      { date: "2026-04-15", status: "requested", substitute: "山田", originalTeacher: "鈴木" },
      { date: "2026-05-02", status: "confirmed", substitute: "山田", originalTeacher: "鈴木" },
    ];
    const t = monthlyTally(subs, 2026, 4);
    expect(t.covered).toEqual({ 山田: 2 });
    expect(t.coveredFor).toEqual({ 鈴木: 2 });
  });

  it("returns empty objects when no subs match", () => {
    expect(monthlyTally([], 2026, 4)).toEqual({ covered: {}, coveredFor: {} });
  });
});

describe("staffMonthlyWorkDates", () => {
  const subs = [
    { date: "2026-04-03", status: "confirmed", substitute: "山田", originalTeacher: "鈴木" },
    { date: "2026-04-10", status: "confirmed", substitute: "山田", originalTeacher: "佐藤" },
    { date: "2026-04-10", status: "confirmed", substitute: "山田", originalTeacher: "田中" },
    { date: "2026-04-15", status: "requested", substitute: "山田", originalTeacher: "鈴木" },
    { date: "2026-04-20", status: "confirmed", substitute: "佐藤", originalTeacher: "鈴木" },
    { date: "2026-05-01", status: "confirmed", substitute: "山田", originalTeacher: "鈴木" },
  ];

  it("returns sorted unique dates for matching staff", () => {
    expect(staffMonthlyWorkDates(subs, "山田", 2026, 4)).toEqual([
      "2026-04-03",
      "2026-04-10",
    ]);
  });

  it("deduplicates dates from multiple subs on same day", () => {
    const result = staffMonthlyWorkDates(subs, "山田", 2026, 4);
    expect(result.filter((d) => d === "2026-04-10")).toHaveLength(1);
  });

  it("excludes requested (non-confirmed) records", () => {
    const result = staffMonthlyWorkDates(subs, "山田", 2026, 4);
    expect(result).not.toContain("2026-04-15");
  });

  it("filters by month correctly", () => {
    expect(staffMonthlyWorkDates(subs, "山田", 2026, 5)).toEqual(["2026-05-01"]);
  });

  it("returns empty array when no matches", () => {
    expect(staffMonthlyWorkDates(subs, "unknown", 2026, 4)).toEqual([]);
    expect(staffMonthlyWorkDates([], "山田", 2026, 4)).toEqual([]);
  });
});

describe("staffMonthlyAbsenceDates", () => {
  const subs = [
    { date: "2026-04-03", status: "confirmed", substitute: "山田", originalTeacher: "鈴木" },
    { date: "2026-04-10", status: "confirmed", substitute: "佐藤", originalTeacher: "鈴木" },
    { date: "2026-04-10", status: "confirmed", substitute: "山田", originalTeacher: "鈴木" },
    { date: "2026-04-15", status: "requested", substitute: "山田", originalTeacher: "鈴木" },
    { date: "2026-04-20", status: "confirmed", substitute: "山田", originalTeacher: "佐藤" },
    { date: "2026-05-01", status: "confirmed", substitute: "山田", originalTeacher: "鈴木" },
  ];

  it("returns sorted unique dates where staff was substituted for", () => {
    expect(staffMonthlyAbsenceDates(subs, "鈴木", 2026, 4)).toEqual([
      "2026-04-03",
      "2026-04-10",
    ]);
  });

  it("deduplicates dates from multiple subs on same day", () => {
    const result = staffMonthlyAbsenceDates(subs, "鈴木", 2026, 4);
    expect(result.filter((d) => d === "2026-04-10")).toHaveLength(1);
  });

  it("excludes requested (non-confirmed) records", () => {
    const result = staffMonthlyAbsenceDates(subs, "鈴木", 2026, 4);
    expect(result).not.toContain("2026-04-15");
  });

  it("filters by month correctly", () => {
    expect(staffMonthlyAbsenceDates(subs, "鈴木", 2026, 5)).toEqual(["2026-05-01"]);
  });

  it("returns empty array when no matches", () => {
    expect(staffMonthlyAbsenceDates(subs, "unknown", 2026, 4)).toEqual([]);
    expect(staffMonthlyAbsenceDates([], "鈴木", 2026, 4)).toEqual([]);
  });
});

describe("staffMonthlyRegularDates", () => {
  // 2026-04: 月=6,13,20,27  火=7,14,21,28  水=1,8,15,22,29
  const slots = [
    { day: "月", teacher: "鈴木", time: "19:00-20:20", note: "" },
    { day: "水", teacher: "鈴木", time: "19:00-20:20", note: "" },
    { day: "火", teacher: "佐藤", time: "19:00-20:20", note: "" },
  ];

  it("returns dates matching the staff's slot days within the month", () => {
    const result = staffMonthlyRegularDates(slots, "鈴木", [], 2026, 4);
    expect(result).toEqual([
      "2026-04-01", // 水
      "2026-04-06", // 月
      "2026-04-08", // 水
      "2026-04-13", // 月
      "2026-04-15", // 水
      "2026-04-20", // 月
      "2026-04-22", // 水
      "2026-04-27", // 月
      "2026-04-29", // 水
    ]);
  });

  it("excludes holidays with scope 全部", () => {
    const holidays = [
      { date: "2026-04-29", label: "昭和の日", scope: ["全部"] },
    ];
    const result = staffMonthlyRegularDates(slots, "鈴木", holidays, 2026, 4);
    expect(result).not.toContain("2026-04-29");
    expect(result).toHaveLength(8);
  });

  it("does not exclude holidays scoped to a department only", () => {
    const holidays = [
      { date: "2026-04-06", label: "中学部休み", scope: ["中学部"] },
    ];
    const result = staffMonthlyRegularDates(slots, "鈴木", holidays, 2026, 4);
    expect(result).toContain("2026-04-06");
  });

  it("returns empty array for a person with no slots", () => {
    expect(staffMonthlyRegularDates(slots, "unknown", [], 2026, 4)).toEqual([]);
  });

  it("handles multi-teacher slots (separator ·)", () => {
    const multiSlots = [
      { day: "木", teacher: "香川·福江", time: "19:00-20:20", note: "" },
    ];
    // 2026-04: 木=2,9,16,23,30
    const result = staffMonthlyRegularDates(multiSlots, "福江", [], 2026, 4);
    expect(result).toEqual([
      "2026-04-02",
      "2026-04-09",
      "2026-04-16",
      "2026-04-23",
      "2026-04-30",
    ]);
  });
});
