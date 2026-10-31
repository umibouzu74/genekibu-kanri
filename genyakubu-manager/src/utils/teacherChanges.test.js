import { describe, expect, it } from "vitest";
import {
  biweeklyActiveTeacher,
  isSlotForTeacher,
  isTeacherActiveOnDate,
  normalizeTeacherChanges,
  slotOnDate,
  slotTeacherNamesBetween,
  slotTeacherNamesEver,
  teacherVariesByDate,
  withTeacherChanges,
} from "./biweekly";
import { activeTeachersOnDate } from "./absenceHelpers";

// 10/27 (火) から 高1 桜井 数学 を 小見山 → 福江 (A5 の実例)
const SLOT = {
  id: 624,
  day: "火",
  time: "19:40-20:40",
  grade: "高1",
  cls: "",
  subj: "高松桜井 数学",
  teacher: "小見山",
  note: "",
  timetableId: 3,
  teacherChanges: [{ from: "2026-10-27", teacher: "福江" }],
};

describe("担当の切り替え (teacherChanges)", () => {
  it("その日の担当は from がその日以前で一番新しい切り替え", () => {
    expect(slotOnDate(SLOT, "2026-10-20")).toBe(SLOT);
    expect(slotOnDate(SLOT, "2026-10-27").teacher).toBe("福江");
    expect(slotOnDate(SLOT, "2026-10-27").teacherChanges).toBeUndefined();
    expect(activeTeachersOnDate(SLOT, "2026-10-20")).toEqual(["小見山"]);
    expect(activeTeachersOnDate(SLOT, "2026-11-03")).toEqual(["福江"]);
    // 期間限定 (戻す行)
    const back = { ...SLOT, teacherChanges: [...SLOT.teacherChanges, { from: "2026-11-10", teacher: "小見山" }] };
    expect(activeTeachersOnDate(back, "2026-11-10")).toEqual(["小見山"]);
  });

  it("日付のない絞り込みは前後の全員、日付のある判定はその日の担当", () => {
    expect(isSlotForTeacher(SLOT, "福江")).toBe(true);
    expect(isSlotForTeacher(SLOT, "小見山")).toBe(true);
    expect(teacherVariesByDate(SLOT)).toBe(true);
    expect(isTeacherActiveOnDate(SLOT, "福江", "2026-10-20", [])).toBe(false);
    expect(isTeacherActiveOnDate(SLOT, "福江", "2026-10-27", [])).toBe(true);
    expect(isTeacherActiveOnDate(SLOT, "小見山", "2026-10-27", [])).toBe(false);
    expect(slotTeacherNamesEver(SLOT)).toEqual(["小見山", "福江"]);
    expect(slotTeacherNamesBetween(SLOT, "2026-10-01", "2026-10-20")).toEqual(["小見山"]);
    expect(slotTeacherNamesBetween(SLOT, "2026-10-21", "2026-11-20")).toEqual(["小見山", "福江"]);
    expect(slotTeacherNamesBetween(SLOT, "2026-11-01", null)).toEqual(["福江"]);
  });

  it("隔週の相手 (partner) も切り替えられる。週の判定 (基準) は変わらない", () => {
    const bw = {
      ...SLOT,
      teacher: "堀上",
      note: "隔週(河野)",
      teacherChanges: [{ from: "2026-10-27", teacher: "福江", partner: "香川" }],
    };
    const anchors = [{ date: "2026-10-27", weekType: "A" }];
    expect(biweeklyActiveTeacher(bw, "2026-10-27", anchors)).toBe("福江");
    expect(biweeklyActiveTeacher(bw, "2026-11-03", anchors)).toBe("香川");
    expect(biweeklyActiveTeacher(bw, "2026-10-20", anchors)).toBe("河野");
    expect(slotOnDate(bw, "2026-11-03").note).toBe("隔週(香川)");
  });

  it("保存の正規化: from 昇順・同じ from は後勝ち・区切りの正規化・空の memo / partner は持たない", () => {
    expect(
      normalizeTeacherChanges([
        { from: "2026-11-10", teacher: "小見山", memo: " " },
        { from: "2026-10-27", teacher: "香川・福江", partner: "" },
        { from: "2026-10-27", teacher: "福江", memo: "急病のため" },
        { from: "", teacher: "x" },
        { from: "2026-12-01", teacher: " " },
      ])
    ).toEqual([
      { from: "2026-10-27", teacher: "福江", memo: "急病のため" },
      { from: "2026-11-10", teacher: "小見山" },
    ]);
    expect(withTeacherChanges(SLOT, [])).not.toHaveProperty("teacherChanges");
  });
});

describe("iCal (担当の切り替え)", () => {
  it("新担当の予定は開始日から、旧担当は開始日以降を外す", async () => {
    const { buildTeacherIcsContent } = await import("./ics");
    const now = new Date(2026, 9, 1);
    const ctx = { timetables: [], biweeklyAnchors: [], holidays: [], examPeriods: [] };
    const slot = { ...SLOT, timetableId: undefined };
    const forNew = buildTeacherIcsContent("福江", [slot], ctx, now);
    expect(forNew).toContain("DTSTART;TZID=Asia/Tokyo:20261027T194000");
    const forOld = buildTeacherIcsContent("小見山", [slot], ctx, now);
    expect(forOld).toContain("20261006T194000");
    expect(forOld).toMatch(/EXDATE[^\n]*20261027T194000/);
  });
});
