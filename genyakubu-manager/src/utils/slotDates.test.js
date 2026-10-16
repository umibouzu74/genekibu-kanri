import { describe, expect, it } from "vitest";
import { isIrregularSlot, isSlotScheduledOnDate, slotOnlyDates } from "./slotDates";
import { isSlotBeyondCutoff } from "./timetable";
import { computeSessionNumber, isSlotHeldOnDate } from "./sessionCount";

const mark = {
  id: 1, day: "月", time: "17:00-18:00", grade: "高3", cls: "", room: "", subj: "マークテスト",
  teacher: "", note: "", irregular: true, onlyDates: ["2026-10-05", "2026-10-19"],
};

describe("slotDates", () => {
  it("毎週のコマはどの日も予定どおり", () => {
    const weekly = { ...mark, irregular: undefined };
    expect(isIrregularSlot(weekly)).toBe(false);
    expect(isSlotScheduledOnDate(weekly, "2026-10-12")).toBe(true);
    expect(slotOnlyDates(weekly)).toEqual([]);
  });

  it("不定期のコマは実施日の一覧にある日だけ", () => {
    expect(isSlotScheduledOnDate(mark, "2026-10-05")).toBe(true);
    expect(isSlotScheduledOnDate(mark, "2026-10-12")).toBe(false);
  });

  it("一覧が空 (RTDB で消えた) ならどの日も実施しない (毎週に戻らない)", () => {
    const empty = { ...mark, onlyDates: undefined };
    expect(isSlotScheduledOnDate(empty, "2026-10-05")).toBe(false);
  });

  it("実施日は並べ替えて重複を除く", () => {
    expect(slotOnlyDates({ ...mark, onlyDates: ["2026-10-19", "2026-10-05", "2026-10-19"] })).toEqual([
      "2026-10-05",
      "2026-10-19",
    ]);
  });

  it("表示期間 (isSlotBeyondCutoff) は実施日でない日を窓の外にする", () => {
    expect(isSlotBeyondCutoff("2026-10-12", mark, null)).toBe(true);
    expect(isSlotBeyondCutoff("2026-10-05", mark, null)).toBe(false);
  });

  it("回数は実施日だけで進む", () => {
    const ctx = {
      allSlots: [mark],
      classSets: [],
      displayCutoff: { groups: [{ label: "高3", grades: ["高3"], startDate: "2026-10-01" }] },
    };
    expect(isSlotHeldOnDate(mark, "2026-10-12", ctx)).toBe(false);
    expect(computeSessionNumber(mark, "2026-10-05", ctx)).toBe(1);
    expect(computeSessionNumber(mark, "2026-10-19", ctx)).toBe(2);
  });
});
