import { describe, expect, it } from "vitest";
import { buildUsualTeacherIndex, guessRegularClass, subjectMatches } from "./usualTeachers";

const TTS = [
  { id: 3, name: "2学期", startDate: "2026-09-01", endDate: "2026-12-21", grades: [] },
  { id: 4, name: "3学期", startDate: "2027-01-07", endDate: null, grades: ["中1", "中2"] },
];
const mk = (id, patch) => ({ id, day: "火", time: "19:00-20:20", grade: "中3", cls: "S", room: "", subj: "英語", teacher: "堀上", note: "", timetableId: 3, ...patch });
const SLOTS = [
  mk(1),
  mk(2, { cls: "SS", teacher: "河野" }),
  mk(3, { cls: "A", subj: "数学", teacher: "片岡" }),
  mk(4, { cls: "S/AB", subj: "理科", teacher: "滝澤" }),
  mk(5, { cls: "A", subj: "英/数", teacher: "石原", note: "隔週(井上)" }),
  mk(6, { grade: "附中1", cls: "-", subj: "国語", teacher: "松川" }),
  mk(7, { cls: "S", subj: "社会", teacher: "小見山", teacherChanges: [{ from: "2026-10-27", teacher: "福江" }] }),
];

describe("普段の担当 (B1)", () => {
  const idx = buildUsualTeacherIndex(SLOTS, TTS, "2026-12-24");
  it("学年・クラス・科目で通常授業の担当を引く (合同・隔週・担当の切り替えも)", () => {
    expect(idx.lookup("中3", ["SS", "S"], "英語")).toEqual(["堀上", "河野"]);
    expect(idx.lookup("中3", ["A"], "数学")).toEqual(["片岡", "井上"]);
    expect(idx.lookup("中3", ["A"], "英語")).toEqual(["石原"]);
    expect(idx.lookup("中3", ["A"], "理科")).toEqual(["滝澤"]);
    expect(idx.lookup("附中1", [], "国語")).toEqual(["松川"]);
    expect(idx.lookup("中3", ["S"], "社会")).toEqual(["福江"]);
    expect(idx.lookup("中3", ["C"], "英語")).toEqual([]);
  });

  it("科目名の頭が合えば同じ科目", () => {
    expect(subjectMatches("英", "英語")).toBe(true);
    expect(subjectMatches("数学", "数学")).toBe(true);
    expect(subjectMatches("理科", "英語")).toBe(false);
  });

  it("クラス名から学年・クラスを推し量る", () => {
    expect(guessRegularClass("中3", "3S401")).toEqual({ grade: "中3", classes: ["S"] });
    expect(guessRegularClass("中3", "３SS")).toEqual({ grade: "中3", classes: ["SS"] });
    expect(guessRegularClass("中1・中2", "1附属")).toEqual({ grade: "附中1", classes: [] });
    expect(guessRegularClass("中3", "特別")).toBe(null);
    expect(guessRegularClass("中3", "3S401", ["中1"])).toBe(null);
  });
});
