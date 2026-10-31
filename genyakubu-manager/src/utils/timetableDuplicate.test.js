import { describe, expect, it } from "vitest";
import { planTimetableDuplicate } from "./timetableDuplicate";
import { activeTeachersOnDate } from "./absenceHelpers";

const TTS = [{ id: 3, name: "2学期", type: "regular", startDate: "2026-09-01", endDate: "2026-12-21", grades: [] }];
const mk = (id, patch) => ({
  id,
  day: "火",
  time: "19:00-20:20",
  grade: "中1",
  cls: "S",
  room: "",
  subj: "英語",
  teacher: "河野",
  note: "",
  timetableId: 3,
  ...patch,
});
const SLOTS = [
  mk(1, { sessionStartNumber: 9 }),
  mk(2, { grade: "中3", subj: "数学" }),
  mk(3, { grade: "高1", subj: "高松桜井 数学", teacher: "小見山", teacherChanges: [{ from: "2026-10-27", teacher: "福江" }] }),
  mk(4, { grade: "中1-3", day: "土", subj: "プレップ" }),
];
const ctxFor = (slots, timetables) => ({
  classSets: [],
  allSlots: slots,
  displayCutoff: { groups: [{ label: "全", grades: [], startDate: "2026-09-01", date: null }], cohorts: [] },
  timetables,
  isOffForGrade: () => false,
  biweeklyAnchors: [],
  holidays: [],
  examPeriods: [],
  sessionOverrides: [],
  daySchedules: [],
  orientationOnFirstDay: false,
});

describe("時間割の複製 (A2)", () => {
  it("選んだ学年のコマだけを写し、対象学年もその学年にする。数え直しなら数え始めを写さない", () => {
    const r = planTimetableDuplicate({
      timetables: TTS,
      slots: SLOTS,
      sourceId: 3,
      name: "3学期",
      startDate: "2027-01-07",
      endDate: null,
      grades: ["中1", "高1", "中1-3"],
    });
    expect(r.timetable).toMatchObject({ id: 4, name: "3学期", startDate: "2027-01-07", grades: ["中1", "高1", "中1-3"] });
    expect(r.newSlots.map((s) => s.grade)).toEqual(["中1", "高1", "中1-3"]);
    expect(r.newSlots.every((s) => s.timetableId === 4)).toBe(true);
    expect(r.newSlots[0]).not.toHaveProperty("sessionStartNumber");
    // 全部選べば複製元の対象学年のまま
    const all = planTimetableDuplicate({ timetables: TTS, slots: SLOTS, sourceId: 3, name: "x", grades: null });
    expect(all.timetable.grades).toEqual([]);
  });

  it("担当の切り替えは複製先の開始日時点の担当か元の担当に確定する", () => {
    const base = { timetables: TTS, slots: SLOTS, sourceId: 3, name: "3学期", startDate: "2027-01-07", grades: ["高1"] };
    const after = planTimetableDuplicate(base).newSlots[0];
    expect(after.teacher).toBe("福江");
    expect(after).not.toHaveProperty("teacherChanges");
    const before = planTimetableDuplicate({ ...base, teacherMode: "before" }).newSlots[0];
    expect(before.teacher).toBe("小見山");
    expect(activeTeachersOnDate(before, "2027-01-12")).toEqual(["小見山"]);
  });

  it("前の期の続き番号: 最後の授業の第N回 + 1 から数える", () => {
    const slots = [mk(1)];
    const r = planTimetableDuplicate({
      timetables: TTS,
      slots,
      sourceId: 3,
      name: "3学期",
      startDate: "2027-01-07",
      grades: null,
      numbering: "continue",
      sessionCtx: ctxFor(slots, TTS),
    });
    // 9/1〜12/21 の火曜 = 9/1 は火曜。12/15 が最後の火曜 → 16 回
    expect(r.continuation[0].last.date).toBe("2026-12-15");
    expect(r.newSlots[0].sessionStartNumber).toBe(r.continuation[0].last.sessionNo + 1);
    expect(r.continuation[0].last.sessionNo).toBe(16);
  });
});
