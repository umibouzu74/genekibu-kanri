import { describe, expect, it } from "vitest";
import {
  applyTeacherChange,
  candidateSlotsForChange,
  describeTeacherChange,
  findRecordsAfterChange,
  listTeacherChanges,
  removeTeacherChange,
  restoreTeacherChanges,
} from "./teacherChangePlan";
import { activeTeachersOnDate } from "./absenceHelpers";

const mk = (id, patch) => ({
  id,
  day: "火",
  time: "19:40-20:40",
  grade: "高1",
  cls: "",
  room: "",
  subj: "高松桜井 数学",
  teacher: "小見山",
  note: "",
  timetableId: 3,
  ...patch,
});
const SLOTS = [
  mk(624),
  mk(625, { time: "20:50-21:50", subj: "高松一 数学" }),
  mk(626, { subj: "高松一 英語", teacher: "香川·小見山" }),
  mk(776, { timetableId: 4 }),
  mk(700, { teacher: "河野" }),
];

describe("担当変更の登録 (A5)", () => {
  it("開始日に旧担当が担当しているコマを、時間割・学年・科目・学校で絞って出す", () => {
    const all = candidateSlotsForChange(SLOTS, { oldTeacher: "小見山", from: "2026-10-27" });
    expect(all.map((s) => s.id)).toEqual([624, 625, 626, 776]);
    const scoped = candidateSlotsForChange(SLOTS, {
      oldTeacher: "小見山",
      from: "2026-10-27",
      timetableId: 3,
      subj: "数学",
    });
    expect(scoped.map((s) => s.id)).toEqual([624, 625]);
    expect(
      candidateSlotsForChange(SLOTS, { oldTeacher: "小見山", from: "2026-10-27", school: "高松一" }).map((s) => s.id)
    ).toEqual([625, 626]);
  });

  it("選んだコマに切り替えを付ける。複数担当は旧担当の名前だけ置き換える", () => {
    const { slots, changedIds } = applyTeacherChange(SLOTS, [624, 626], {
      oldTeacher: "小見山",
      newTeacher: "福江",
      from: "2026-10-27",
    });
    expect(changedIds).toEqual([624, 626]);
    const s624 = slots.find((s) => s.id === 624);
    expect(s624.teacher).toBe("小見山");
    expect(s624.teacherChanges).toEqual([{ from: "2026-10-27", teacher: "福江" }]);
    expect(activeTeachersOnDate(s624, "2026-10-20")).toEqual(["小見山"]);
    expect(activeTeachersOnDate(s624, "2026-11-03")).toEqual(["福江"]);
    expect(activeTeachersOnDate(slots.find((s) => s.id === 626), "2026-11-03")).toEqual(["香川", "福江"]);
    // 選ばなかったコマはそのまま (同じオブジェクト)
    expect(slots.find((s) => s.id === 625)).toBe(SLOTS[1]);
  });

  it("「◯日まで」は翌日に元の担当へ戻す行を足す。取り消し・元に戻すもできる", () => {
    const { slots } = applyTeacherChange(SLOTS, [624], {
      oldTeacher: "小見山",
      newTeacher: "福江",
      from: "2026-10-27",
      until: "2026-11-10",
      memo: "出張",
    });
    const s = slots.find((x) => x.id === 624);
    expect(s.teacherChanges).toEqual([
      { from: "2026-10-27", teacher: "福江", memo: "出張" },
      { from: "2026-11-11", teacher: "小見山" },
    ]);
    expect(activeTeachersOnDate(s, "2026-11-17")).toEqual(["小見山"]);
    const removed = removeTeacherChange(slots, 624, "2026-10-27");
    expect(removed.find((x) => x.id === 624).teacherChanges).toEqual([{ from: "2026-11-11", teacher: "小見山" }]);
    const back = restoreTeacherChanges(slots, [{ id: 624, teacherChanges: undefined }]);
    expect(back.find((x) => x.id === 624)).not.toHaveProperty("teacherChanges");
  });

  it("隔週の B 週の相手を変えるときは partner を書く", () => {
    const bw = [mk(1, { teacher: "堀上", note: "隔週(小見山)" })];
    const { slots } = applyTeacherChange(bw, [1], { oldTeacher: "小見山", newTeacher: "福江", from: "2026-10-27" });
    expect(slots[0].teacherChanges).toEqual([{ from: "2026-10-27", teacher: "堀上", partner: "福江" }]);
  });

  it("開始日以降の旧担当の代行・振替を知らせ、新担当と同じ代行は不要として分ける", () => {
    const subs = [
      { id: 1, slotId: 624, date: "2026-10-27", originalTeacher: "小見山", substitute: "福江" },
      { id: 2, slotId: 624, date: "2026-11-03", originalTeacher: "小見山", substitute: "河野" },
      { id: 3, slotId: 624, date: "2026-10-20", originalTeacher: "小見山", substitute: "福江" },
      { id: 4, slotId: 700, date: "2026-11-03", originalTeacher: "小見山", substitute: "福江" },
    ];
    const adjustments = [
      { id: 1, type: "reschedule", slotId: 624, date: "2026-11-10", targetDate: "2026-11-12" },
      { id: 2, type: "reschedule", slotId: 624, date: "2026-11-17", targetDate: "2026-11-19", targetTeacher: "河野" },
    ];
    const r = findRecordsAfterChange({
      subs,
      adjustments,
      slotIds: [624],
      oldTeacher: "小見山",
      newTeacher: "福江",
      from: "2026-10-27",
    });
    expect(r.redundantSubs.map((x) => x.id)).toEqual([1]);
    expect(r.otherSubs.map((x) => x.id)).toEqual([2]);
    expect(r.reschedules.map((x) => x.id)).toEqual([1]);
  });

  it("登録済みの一覧と表示の文言", () => {
    const { slots } = applyTeacherChange(SLOTS, [624], { oldTeacher: "小見山", newTeacher: "福江", from: "2026-10-27" });
    const list = listTeacherChanges(slots);
    expect(list).toHaveLength(1);
    expect(describeTeacherChange(list[0])).toBe("10/27〜 福江（前：小見山）");
  });
});
