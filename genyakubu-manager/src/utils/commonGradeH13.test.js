// 共通学年「高1-3」(土曜の Speaking/Listening、2026-11-28) が、既存の共通学年
// (中1-3・附中・高1高2) と同じ仕組みで扱われることの確かめ。
import { describe, expect, it } from "vitest";
import { gradeToDept, holidayMatches } from "./scheduleHelpers";
import { extraGradesFromSlots, gradeChoices, gradeSuggestions, isCommonGrade } from "./gradeChoices";
import { findGroupForGrade, gradeMatchesTimetable } from "./timetable";
import { buildColumnDefs } from "./excelGrid";
import { getDashSections } from "../constants/schedule";
import { deriveCohortsFromSlots } from "./cohorts";
import { isOrientationTargetSlot } from "./sessionCount";

const SL = { id: 728, day: "土", time: "18:30-19:30", grade: "高1-3", cls: "", room: "亀63", subj: "Speaking/Listening", teacher: "本澤", note: "" };

describe("共通学年「高1-3」", () => {
  it("高校部の学年で、点線の共通学年として扱う", () => {
    expect(gradeToDept("高1-3")).toBe("高校部");
    expect(isCommonGrade("高1-3")).toBe(true);
  });

  it("選択肢は 高1高2 の後ろ (既存の共通学年の並びは変わらない)", () => {
    const slots = [{ grade: "高1-3" }, { grade: "高1高2" }, { grade: "附中" }, { grade: "中1-3" }, { grade: "中1" }];
    expect(extraGradesFromSlots(slots)).toEqual(["中1-3", "附中", "高1高2", "高1-3"]);
    expect(gradeChoices(slots).slice(-4)).toEqual(["中1-3", "附中", "高1高2", "高1-3"]);
    // 自由入力の候補には、まだどのコマにも無くても出す
    expect(gradeSuggestions([])).toEqual(expect.arrayContaining(["中1-3", "附中", "高1高2", "高1-3"]));
  });

  describe("休講の判定 (既存の共通学年と同じ: それ自体を選んだときだけ)", () => {
    const h = (o) => ({ id: 1, date: "2026-12-05", scope: ["高校部"], targetGrades: [], subjKeywords: [], ...o });
    it.each([
      ["全部", h({ scope: ["全部"] }), true],
      ["高校部 (学年の指定なし)", h({}), true],
      ["学年で 高1-3 を選んだ", h({ targetGrades: ["高1-3"] }), true],
      ["高3 だけ", h({ targetGrades: ["高3"] }), false],
      ["高1・高2", h({ targetGrades: ["高1", "高2"] }), false],
      ["中学部", h({ scope: ["中学部"] }), false],
    ])("%s", (_, holiday, stops) => {
      expect(holidayMatches(holiday, SL.grade, SL.subj, SL.id)).toBe(stops);
    });

    it("授業名キーワードとの組み合わせも同じ", () => {
      expect(holidayMatches(h({ subjKeywords: ["Speaking"] }), SL.grade, SL.subj, SL.id)).toBe(true);
      expect(holidayMatches(h({ targetGrades: ["高1-3"], subjKeywords: ["英語"] }), SL.grade, SL.subj, SL.id)).toBe(false);
      expect(holidayMatches(h({ excludeSlotIds: [728] }), SL.grade, SL.subj, SL.id)).toBe(false);
    });

    it("既存の共通学年の判定は変わらない", () => {
      expect(holidayMatches(h({ targetGrades: ["高1", "高2"] }), "高1高2", "高予備プレップ")).toBe(false);
      expect(holidayMatches(h({ targetGrades: ["高1高2"] }), "高1高2", "高予備プレップ")).toBe(true);
      expect(holidayMatches(h({ scope: ["中学部"], targetGrades: ["中3"] }), "中1-3", "プレップ")).toBe(false);
    });
  });

  it("学年グループは 中1-3 と同じく最初に当たるグループ (高1・2) に従う", () => {
    const groups = [
      { label: "高1・2", grades: ["高1", "高2"] },
      { label: "高3", grades: ["高3"] },
    ];
    expect(findGroupForGrade("高1-3", groups)?.label).toBe("高1・2");
    expect(findGroupForGrade("中1-3", [{ label: "中1・2", grades: ["中1", "中2"] }, { label: "中3", grades: ["中3"] }])?.label).toBe("中1・2");
  });

  it("時間割の対象学年は 高1〜高3 のどれかがあれば当たる (中1-3 と同じ)", () => {
    expect(gradeMatchesTimetable("高1-3", ["高1", "高2", "高3"])).toBe(true);
    expect(gradeMatchesTimetable("高1-3", ["高3"])).toBe(true);
    expect(gradeMatchesTimetable("高1-3", ["中1", "中2"])).toBe(false);
  });

  it("土曜のダッシュボードは 高校部・亀井町 に出て、列は 高1高2 の後ろ", () => {
    const sections = getDashSections("土");
    const kamei = sections.find((s) => s.key === "高校亀井町");
    expect(kamei.filterFn(SL)).toBe(true);
    expect(sections.filter((s) => s.filterFn(SL)).map((s) => s.key)).toEqual(["高校亀井町"]);
    const slots = [SL, { ...SL, id: 1, grade: "高1高2", subj: "高校英語", room: "亀62" }, { ...SL, id: 2, grade: "高3", subj: "共テ化学", room: "亀21" }];
    const { gradeGroups } = buildColumnDefs(slots, "土", () => true);
    expect(gradeGroups.map((g) => g.grade)).toEqual(["高3", "高1高2", "高1-3"]);
  });

  it("コース (終講日・回数の束ね) は H|高1-3|Speaking/Listening、オリエンの対象外", () => {
    expect(deriveCohortsFromSlots([SL]).map((c) => c.id)).toEqual(["H|高1-3|Speaking/Listening"]);
    expect(isOrientationTargetSlot(SL, { grades: ["高1", "高2"] })).toBe(false);
  });
});
