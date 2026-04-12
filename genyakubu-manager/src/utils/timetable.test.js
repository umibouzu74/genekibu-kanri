import { describe, it, expect } from "vitest";
import {
  expandGradeRange,
  gradeMatchesTimetable,
  isTimetableActiveForDate,
  getActiveTimetableIds,
  filterSlotsForDate,
  isBeyondCutoff,
  isEntireDayBeyondCutoff,
} from "./timetable";

describe("expandGradeRange", () => {
  it("returns single grade as-is", () => {
    expect(expandGradeRange("中1")).toEqual(["中1"]);
    expect(expandGradeRange("高3")).toEqual(["高3"]);
    expect(expandGradeRange("附中2")).toEqual(["附中2"]);
  });

  it("expands range pattern", () => {
    expect(expandGradeRange("中1-3")).toEqual(["中1", "中2", "中3"]);
    expect(expandGradeRange("高1-2")).toEqual(["高1", "高2"]);
  });

  it("handles edge case of invalid range", () => {
    expect(expandGradeRange("中3-1")).toEqual(["中3-1"]); // lo >= hi
  });
});

describe("gradeMatchesTimetable", () => {
  it("matches when timetableGrades is empty (all grades)", () => {
    expect(gradeMatchesTimetable("中1", [])).toBe(true);
    expect(gradeMatchesTimetable("高3", [])).toBe(true);
  });

  it("matches direct grade", () => {
    expect(gradeMatchesTimetable("中1", ["中1", "中2"])).toBe(true);
    expect(gradeMatchesTimetable("高1", ["中1", "中2"])).toBe(false);
  });

  it("matches combined grade via expansion", () => {
    expect(gradeMatchesTimetable("中1-3", ["中2"])).toBe(true);
    expect(gradeMatchesTimetable("中1-3", ["高1"])).toBe(false);
  });
});

describe("isTimetableActiveForDate", () => {
  const tt = {
    id: 1,
    name: "1学期",
    type: "regular",
    startDate: "2026-04-06",
    endDate: "2026-07-18",
    grades: ["中1", "中2", "中3"],
  };

  it("returns true when date is within range and grade matches", () => {
    expect(isTimetableActiveForDate(tt, "2026-05-01", "中1")).toBe(true);
  });

  it("returns false when date is before start", () => {
    expect(isTimetableActiveForDate(tt, "2026-03-01", "中1")).toBe(false);
  });

  it("returns false when date is after end", () => {
    expect(isTimetableActiveForDate(tt, "2026-08-01", "中1")).toBe(false);
  });

  it("returns false when grade does not match", () => {
    expect(isTimetableActiveForDate(tt, "2026-05-01", "高1")).toBe(false);
  });

  it("returns true on boundary dates", () => {
    expect(isTimetableActiveForDate(tt, "2026-04-06", "中1")).toBe(true);
    expect(isTimetableActiveForDate(tt, "2026-07-18", "中1")).toBe(true);
  });

  it("returns true for timetable with null bounds (default)", () => {
    const def = { id: 1, name: "デフォルト", type: "regular", startDate: null, endDate: null, grades: [] };
    expect(isTimetableActiveForDate(def, "2026-01-01", "中1")).toBe(true);
    expect(isTimetableActiveForDate(def, "2099-12-31", "高3")).toBe(true);
  });

  it("returns false for null timetable", () => {
    expect(isTimetableActiveForDate(null, "2026-05-01", "中1")).toBe(false);
  });
});

describe("getActiveTimetableIds", () => {
  const timetables = [
    { id: 1, name: "1学期", type: "regular", startDate: "2026-04-06", endDate: "2026-07-18", grades: ["中1", "中2"] },
    { id: 2, name: "2学期", type: "regular", startDate: "2026-09-01", endDate: "2026-12-20", grades: ["中1", "中2"] },
    { id: 3, name: "1学期 高校", type: "regular", startDate: "2026-04-06", endDate: "2026-07-20", grades: ["高1", "高2", "高3"] },
  ];

  it("returns matching timetable IDs for date and grade", () => {
    expect(getActiveTimetableIds("2026-05-01", "中1", timetables)).toEqual([1]);
    expect(getActiveTimetableIds("2026-10-01", "中2", timetables)).toEqual([2]);
    expect(getActiveTimetableIds("2026-05-01", "高1", timetables)).toEqual([3]);
  });

  it("returns empty array when no match", () => {
    expect(getActiveTimetableIds("2026-08-01", "中1", timetables)).toEqual([]);
  });
});

describe("filterSlotsForDate", () => {
  const timetables = [
    { id: 1, name: "デフォルト", type: "regular", startDate: null, endDate: null, grades: [] },
    { id: 2, name: "1学期", type: "regular", startDate: "2026-04-06", endDate: "2026-07-18", grades: ["中1"] },
  ];

  const slots = [
    { id: 1, day: "月", time: "19:00-20:20", grade: "中1", cls: "S", room: "601", subj: "英語", teacher: "A", note: "", timetableId: 2 },
    { id: 2, day: "月", time: "19:00-20:20", grade: "高1", cls: "S", room: "701", subj: "数学", teacher: "B", note: "" },
  ];

  it("filters by active timetable for date", () => {
    const result = filterSlotsForDate(slots, "2026-05-01", timetables);
    expect(result.map((s) => s.id)).toEqual([1, 2]);
  });

  it("excludes slots whose timetable is not active", () => {
    const result = filterSlotsForDate(slots, "2026-08-01", timetables);
    // slot 1 (timetableId=2, ends 07-18) excluded; slot 2 (default, no bounds) included
    expect(result.map((s) => s.id)).toEqual([2]);
  });
});

describe("isBeyondCutoff", () => {
  const cutoff = {
    groups: [
      { label: "中1・2", grades: ["中1", "中2", "附中1", "附中2"], date: "2026-07-18" },
      { label: "中3", grades: ["中3", "附中3"], date: "2026-07-15" },
      { label: "高1・2", grades: ["高1", "高2"], date: null },
      { label: "高3", grades: ["高3"], date: "2026-07-20" },
    ],
  };

  it("returns true when date is beyond cutoff for grade", () => {
    expect(isBeyondCutoff("2026-07-19", "中1", cutoff)).toBe(true);
    expect(isBeyondCutoff("2026-07-16", "中3", cutoff)).toBe(true);
  });

  it("returns false when date is within cutoff", () => {
    expect(isBeyondCutoff("2026-07-18", "中1", cutoff)).toBe(false);
    expect(isBeyondCutoff("2026-07-15", "中3", cutoff)).toBe(false);
  });

  it("returns false when cutoff is null (no limit)", () => {
    expect(isBeyondCutoff("2099-12-31", "高1", cutoff)).toBe(false);
  });

  it("returns false when grade has no matching group", () => {
    expect(isBeyondCutoff("2099-12-31", "unknown", cutoff)).toBe(false);
  });

  it("returns false when displayCutoff is null/undefined", () => {
    expect(isBeyondCutoff("2026-07-19", "中1", null)).toBe(false);
    expect(isBeyondCutoff("2026-07-19", "中1", undefined)).toBe(false);
  });

  it("handles combined grades", () => {
    expect(isBeyondCutoff("2026-07-19", "中1-3", cutoff)).toBe(true);
  });
});

describe("isEntireDayBeyondCutoff", () => {
  it("returns true when all groups have cutoff and date exceeds all", () => {
    const cutoff = {
      groups: [
        { label: "中", grades: ["中1"], date: "2026-07-18" },
        { label: "高", grades: ["高1"], date: "2026-07-20" },
      ],
    };
    expect(isEntireDayBeyondCutoff("2026-07-21", cutoff)).toBe(true);
    expect(isEntireDayBeyondCutoff("2026-07-19", cutoff)).toBe(false);
  });

  it("returns false when any group has null cutoff", () => {
    const cutoff = {
      groups: [
        { label: "中", grades: ["中1"], date: "2026-07-18" },
        { label: "高", grades: ["高1"], date: null },
      ],
    };
    expect(isEntireDayBeyondCutoff("2099-12-31", cutoff)).toBe(false);
  });

  it("returns false for null/undefined cutoff", () => {
    expect(isEntireDayBeyondCutoff("2026-07-21", null)).toBe(false);
  });
});
