import { describe, expect, it } from "vitest";
import {
  applyTeacherChange,
  candidateSlotsForChange,
  describeTeacherChange,
  findRecordsAfterChange,
  isSlotInChangePeriod,
  listTeacherChanges,
  removeTeacherChange,
  restoreTeacherChanges,
  splitCandidatesByPeriod,
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

// 担当変更の期間に授業のある時間割のコマ (2026-11-19、P2-3)
describe("isSlotInChangePeriod / splitCandidatesByPeriod", () => {
  const TTS = [
    { id: 1, name: "1学期", startDate: "2026-04-07", endDate: "2026-08-24", grades: [] },
    { id: 3, name: "2学期", startDate: "2026-08-25", endDate: "2026-12-21", grades: [] },
    { id: 4, name: "3学期", startDate: "2027-01-08", endDate: null, grades: ["中1", "中2", "高2"] },
  ];
  const mkS = (id, timetableId, grade = "高2") => ({
    id, timetableId, day: "火", time: "19:00-20:20", grade, cls: "", subj: "高松高 文系数学", teacher: "福武", note: "",
  });
  const s1 = mkS(1, 1);
  const s3 = mkS(3, 3);
  const s4 = mkS(4, 4);

  it("期と期の間の開始日 (1/4〜1/22) は、次に始まる 3学期のコマだけ", () => {
    const r = splitCandidatesByPeriod([s1, s3, s4], TTS, "2027-01-04", "2027-01-22");
    expect(r.inPeriod.map((s) => s.id)).toEqual([4]);
    expect(r.outOfPeriod.map((s) => s.id)).toEqual([1, 3]);
  });

  it("◯日まで が無ければ、開始日の時点の期の終わりまで (2学期の途中からは 3学期を含めない)", () => {
    expect(splitCandidatesByPeriod([s1, s3, s4], TTS, "2026-10-27", null).inPeriod.map((s) => s.id)).toEqual([3]);
    // 期と期の間で期限なし = 3学期 (終了日なし) の間
    expect(splitCandidatesByPeriod([s1, s3, s4], TTS, "2027-01-04", null).inPeriod.map((s) => s.id)).toEqual([4]);
  });

  it("期間が期をまたげば両方の期", () => {
    expect(splitCandidatesByPeriod([s1, s3, s4], TTS, "2026-12-14", "2027-01-22").inPeriod.map((s) => s.id)).toEqual([3, 4]);
  });

  it("時間割の対象学年に無いコマは期間外 (3学期に中3 は無い)", () => {
    expect(isSlotInChangePeriod(mkS(9, 4, "中3"), TTS, "2027-01-04", "2027-01-22")).toBe(false);
  });

  it("時間割が 1 つ以下なら全部期間内", () => {
    expect(isSlotInChangePeriod(s1, [TTS[0]], "2027-01-04", null)).toBe(true);
  });
});
