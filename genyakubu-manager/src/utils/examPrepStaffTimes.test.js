import { describe, expect, it } from "vitest";
import {
  copyDay,
  normalizeShiftTime,
  removeStaffFromSchedules,
  setStaffTime,
  staffShiftPeriods,
  staffTimeWarnings,
  withoutOrphanStaffTimes,
} from "./examPrepHelpers";
import { countDayAttendance } from "./partTimeAttendance";

// 2学期期末特訓の校時 (付録)
const P4 = [
  { no: 1, start: "18:00", end: "18:50" },
  { no: 2, start: "19:00", end: "19:50" },
  { no: 3, start: "20:00", end: "20:50" },
  { no: 4, start: "21:00", end: "21:50" },
];
const P5 = [
  { no: 1, start: "16:15", end: "17:15" },
  { no: 2, start: "17:30", end: "18:30" },
  { no: 3, start: "19:00", end: "19:50" },
  { no: 4, start: "20:00", end: "20:50" },
  { no: 5, start: "21:00", end: "21:50" },
];
const times = (day, name) => staffShiftPeriods(day, name).map((p) => `${p.start}-${p.end}`);

describe("特訓シフトの途中入り・途中抜け (C1)", () => {
  it("付録の実例: チェックした校時を来る・帰る時刻で切り詰める", () => {
    // 半田 11/19 1-2 (18:30〜19:30)
    const d19 = { date: "2026-11-19", periods: P4, assignments: { 半田: [1, 2] }, staffTimes: { 半田: { from: "18:30", to: "19:30" } } };
    expect(times(d19, "半田")).toEqual(["18:30-18:50", "19:00-19:30"]);
    // 野口 11/20 1-3 (〜20:40)
    const d20 = { date: "2026-11-20", periods: P4, assignments: { 野口: [1, 2, 3] }, staffTimes: { 野口: { to: "20:40" } } };
    expect(times(d20, "野口")).toEqual(["18:00-18:50", "19:00-19:50", "20:00-20:40"]);
    // 井上 11/21 2-5 (17:40〜)
    const d21 = { date: "2026-11-21", periods: P5, assignments: { 井上: [2, 3, 4, 5] }, staffTimes: { 井上: { from: "17:40" } } };
    expect(times(d21, "井上")[0]).toBe("17:40-18:30");
    // 井上 11/24 1-5 (16:30〜)
    const d24 = { date: "2026-11-24", periods: P5, assignments: { 井上: [1, 2, 3, 4, 5] }, staffTimes: { 井上: { from: "16:30" } } };
    expect(times(d24, "井上")[0]).toBe("16:30-17:15");
    expect(staffShiftPeriods(d24, "井上")[0].trimmed).toBe(true);
    expect(staffShiftPeriods(d24, "井上")[1].trimmed).toBe(false);
    // 空欄 = 校時どおり
    expect(times({ periods: P4, assignments: { 石原: [1, 2] } }, "石原")).toEqual(["18:00-18:50", "19:00-19:50"]);
  });

  it("切り詰めて 0 分になる校時は出さず、注意を出す", () => {
    const day = { periods: P4, assignments: { 半田: [1, 2, 3] }, staffTimes: { 半田: { to: "19:00" } } };
    expect(times(day, "半田")).toEqual(["18:00-18:50"]);
    expect(staffTimeWarnings(day).map((w) => w.kind)).toEqual(["dropped"]);
    const order = { periods: P4, assignments: { 半田: [1] }, staffTimes: { 半田: { from: "19:30", to: "19:00" } } };
    expect(staffTimeWarnings(order).map((w) => w.kind)).toEqual(["order"]);
    const outside = { periods: P4, assignments: { 半田: [1] }, staffTimes: { 半田: { from: "19:00" } } };
    expect(staffTimeWarnings(outside).map((w) => w.kind)).toEqual(["outside"]);
  });

  it("バイトの出勤日数 (1 日のかたまりの数) は途中入り・途中抜けで変わらない", () => {
    const entries = (day, name) => staffShiftPeriods(day, name).map((p) => ({ time: `${p.start}-${p.end}` }));
    // 松川 11/21 は 1・2・5 校時 = 2 かたまり。来る・帰る時刻で端を切っても 2
    const base = { periods: P5, assignments: { 松川: [1, 2, 5] } };
    const trimmed = { ...base, staffTimes: { 松川: { from: "16:45", to: "21:30" } } };
    expect(countDayAttendance(entries(base, "松川")).units).toBe(2);
    expect(countDayAttendance(entries(trimmed, "松川")).units).toBe(2);
    const d19 = { periods: P4, assignments: { 半田: [1, 2] }, staffTimes: { 半田: { from: "18:30", to: "19:30" } } };
    expect(countDayAttendance(entries(d19, "半田")).units).toBe(1);
  });

  it("時刻の書き方をそろえ、空の時刻・出勤の無い講師の時刻は持たない", () => {
    expect(normalizeShiftTime("1830")).toBe("18:30");
    expect(normalizeShiftTime("１８：３０")).toBe("18:30");
    expect(normalizeShiftTime("9:5")).toBe("09:05");
    expect(normalizeShiftTime("")).toBe("");
    expect(normalizeShiftTime("25:00")).toBe(null);
    const day = { date: "x", periods: P4, assignments: { 半田: [1] } };
    const a = setStaffTime(day, "半田", { from: "18:30" });
    expect(a.staffTimes).toEqual({ 半田: { from: "18:30" } });
    expect(setStaffTime(a, "半田", {})).not.toHaveProperty("staffTimes");
    expect(withoutOrphanStaffTimes({ ...a, assignments: {} })).not.toHaveProperty("staffTimes");
  });

  it("日のコピーは時刻も写し、講師の削除は時刻も消す", () => {
    const schedules = [
      {
        examPeriodId: 1,
        days: [{ date: "2026-11-19", periods: P4, assignments: { 半田: [1, 2] }, staffTimes: { 半田: { from: "18:30" } } }],
      },
    ];
    const copied = copyDay(schedules, 1, "2026-11-19", ["2026-11-20"]);
    expect(copied[0].days.find((d) => d.date === "2026-11-20").staffTimes).toEqual({ 半田: { from: "18:30" } });
    const removed = removeStaffFromSchedules(copied, "半田");
    expect(removed[0].days.every((d) => !d.staffTimes)).toBe(true);
  });
});
