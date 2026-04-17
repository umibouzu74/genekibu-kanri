import { describe, expect, it } from "vitest";
import { isSlotOffOnDate } from "./scheduleHelpers";

const baseSlot = {
  id: 1,
  day: "月",
  time: "19:00-20:20",
  grade: "高1",
  cls: "S",
  room: "601",
  subj: "数学",
  teacher: "山田",
};

describe("isSlotOffOnDate", () => {
  describe("holiday.scope", () => {
    it("scope=['全部'] は中高両学年を off にする", () => {
      const holidays = [{ date: "2026-05-04", scope: ["全部"] }];
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "中1" }, "2026-05-04", holidays, [])
      ).toBe(true);
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "高3" }, "2026-05-04", holidays, [])
      ).toBe(true);
    });

    it("scope=['中学部'] は高校部スロットには効かない", () => {
      const holidays = [{ date: "2026-06-01", scope: ["中学部"] }];
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "中2" }, "2026-06-01", holidays, [])
      ).toBe(true);
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-06-01", holidays, [])
      ).toBe(false);
    });

    it("scope=['高校部'] は附中(中学部)には効かない", () => {
      const holidays = [{ date: "2026-06-02", scope: ["高校部"] }];
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "附中1" }, "2026-06-02", holidays, [])
      ).toBe(false);
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-06-02", holidays, [])
      ).toBe(true);
    });

    it("scope が未指定のときはデフォルト ['全部']", () => {
      const holidays = [{ date: "2026-05-04" }];
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "中1" }, "2026-05-04", holidays, [])
      ).toBe(true);
    });
  });

  describe("targetGrades", () => {
    it("targetGrades=[] なら scope 合致の全学年が off", () => {
      const holidays = [{ date: "2026-06-03", scope: ["全部"], targetGrades: [] }];
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-06-03", holidays, [])
      ).toBe(true);
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "中3" }, "2026-06-03", holidays, [])
      ).toBe(true);
    });

    it("targetGrades=['高1'] は高2には効かない", () => {
      const holidays = [
        { date: "2026-06-03", scope: ["全部"], targetGrades: ["高1"] },
      ];
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-06-03", holidays, [])
      ).toBe(true);
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "高2" }, "2026-06-03", holidays, [])
      ).toBe(false);
    });
  });

  describe("subjKeywords", () => {
    it('subjKeywords=["高松西"] + subj="高松西対策" → off', () => {
      const holidays = [
        { date: "2026-06-04", scope: ["高校部"], subjKeywords: ["高松西"] },
      ];
      expect(
        isSlotOffOnDate(
          { ...baseSlot, grade: "高1", subj: "高松西対策" },
          "2026-06-04",
          holidays,
          []
        )
      ).toBe(true);
    });

    it('subjKeywords=["高松西"] + subj="英語" → マッチせず', () => {
      const holidays = [
        { date: "2026-06-04", scope: ["高校部"], subjKeywords: ["高松西"] },
      ];
      expect(
        isSlotOffOnDate(
          { ...baseSlot, grade: "高1", subj: "英語" },
          "2026-06-04",
          holidays,
          []
        )
      ).toBe(false);
    });

    it("slot.subj が falsy なら subjKeywords 指定時に off でない", () => {
      const holidays = [
        { date: "2026-06-04", scope: ["高校部"], subjKeywords: ["高松西"] },
      ];
      expect(
        isSlotOffOnDate(
          { ...baseSlot, grade: "高1", subj: "" },
          "2026-06-04",
          holidays,
          []
        )
      ).toBe(false);
    });
  });

  describe("日付不一致", () => {
    it("holiday.date が dateStr と違えば影響しない", () => {
      const holidays = [{ date: "2026-05-04", scope: ["全部"] }];
      expect(
        isSlotOffOnDate({ ...baseSlot }, "2026-05-05", holidays, [])
      ).toBe(false);
    });
  });

  describe("examPeriods", () => {
    it("区間内 + targetGrades=[] → 全学年 off", () => {
      const ep = [
        { startDate: "2026-07-01", endDate: "2026-07-05", targetGrades: [] },
      ];
      expect(isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-07-03", [], ep)).toBe(
        true
      );
      expect(isSlotOffOnDate({ ...baseSlot, grade: "中2" }, "2026-07-03", [], ep)).toBe(
        true
      );
    });

    it("区間内 + targetGrades に該当学年 → off", () => {
      const ep = [
        { startDate: "2026-07-01", endDate: "2026-07-05", targetGrades: ["高1"] },
      ];
      expect(isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-07-03", [], ep)).toBe(
        true
      );
    });

    it("区間内 + targetGrades に該当しない → off でない", () => {
      const ep = [
        { startDate: "2026-07-01", endDate: "2026-07-05", targetGrades: ["高3"] },
      ];
      expect(isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-07-03", [], ep)).toBe(
        false
      );
    });

    it("区間外 → off でない", () => {
      const ep = [
        { startDate: "2026-07-01", endDate: "2026-07-05", targetGrades: [] },
      ];
      expect(isSlotOffOnDate({ ...baseSlot }, "2026-06-30", [], ep)).toBe(false);
      expect(isSlotOffOnDate({ ...baseSlot }, "2026-07-06", [], ep)).toBe(false);
    });
  });

  describe("引数 undefined 耐性", () => {
    it("holidays / examPeriods が undefined でも false を返す", () => {
      expect(isSlotOffOnDate({ ...baseSlot }, "2026-05-04", undefined, undefined)).toBe(
        false
      );
    });
  });
});
