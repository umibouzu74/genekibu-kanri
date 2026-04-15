import { describe, expect, it } from "vitest";
import {
  buildSessionCountMap,
  computeSessionNumber,
  formatSessionNumber,
  getGradeStartDate,
  resolveSetSlotIds,
} from "./sessionCount";

// 2026-04-07 は火曜日
// 2026-04-08 は水曜日
// 2026-04-09 は木曜日
// 2026-04-10 は金曜日
const DISPLAY_CUTOFF = {
  groups: [
    { label: "中3", grades: ["中3"], startDate: "2026-04-07", date: null },
    { label: "高3", grades: ["高3"], startDate: "2026-04-07", date: null },
  ],
};

const NEVER_OFF = () => false;

function makeSlot(id, day, time, grade, extras = {}) {
  return {
    id,
    day,
    time,
    grade,
    cls: "",
    room: "602",
    subj: "数学",
    teacher: "T",
    note: "",
    ...extras,
  };
}

describe("getGradeStartDate", () => {
  it("returns startDate for matched grade group", () => {
    expect(getGradeStartDate("中3", DISPLAY_CUTOFF)).toBe("2026-04-07");
  });
  it("returns null for unmatched grade", () => {
    expect(getGradeStartDate("中1", DISPLAY_CUTOFF)).toBe(null);
  });
  it("returns null when cutoff is undefined", () => {
    expect(getGradeStartDate("中3", null)).toBe(null);
  });
});

describe("resolveSetSlotIds", () => {
  it("returns set slotIds when slot is part of a set", () => {
    const slot = makeSlot(1, "火", "19:00-20:20", "中3");
    const sets = [{ id: 10, label: "数学", slotIds: [1, 2] }];
    expect(resolveSetSlotIds(slot, sets)).toEqual([1, 2]);
  });
  it("returns [slot.id] fallback when slot not in any set", () => {
    const slot = makeSlot(99, "火", "19:00-20:20", "中3");
    expect(resolveSetSlotIds(slot, [])).toEqual([99]);
  });
});

describe("computeSessionNumber - single weekly slot (unassigned)", () => {
  const slot = makeSlot(1, "火", "19:00-20:20", "中3");

  it("returns 1 on startDate (=火曜日)", () => {
    const n = computeSessionNumber(slot, "2026-04-07", {
      classSets: [],
      allSlots: [slot],
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
    });
    expect(n).toBe(1);
  });

  it("returns 2 on next Tuesday", () => {
    const n = computeSessionNumber(slot, "2026-04-14", {
      classSets: [],
      allSlots: [slot],
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
    });
    expect(n).toBe(2);
  });

  it("returns 3 on third Tuesday", () => {
    const n = computeSessionNumber(slot, "2026-04-21", {
      classSets: [],
      allSlots: [slot],
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
    });
    expect(n).toBe(3);
  });

  it("returns 0 on a non-Tuesday (slot not active)", () => {
    const n = computeSessionNumber(slot, "2026-04-09", {
      classSets: [],
      allSlots: [slot],
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
    });
    expect(n).toBe(0);
  });

  it("returns 0 before startDate", () => {
    const n = computeSessionNumber(slot, "2026-04-01", {
      classSets: [],
      allSlots: [slot],
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
    });
    expect(n).toBe(0);
  });

  it("returns 0 when grade has no startDate configured", () => {
    const otherSlot = makeSlot(2, "火", "19:00-20:20", "中1");
    const n = computeSessionNumber(otherSlot, "2026-04-07", {
      classSets: [],
      allSlots: [otherSlot],
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
    });
    expect(n).toBe(0);
  });
});

describe("computeSessionNumber - Tue+Thu set", () => {
  const tue = makeSlot(1, "火", "19:00-20:20", "中3");
  const thu = makeSlot(2, "木", "19:00-20:20", "中3");
  const classSets = [{ id: 10, label: "中3 数学", slotIds: [1, 2] }];
  const baseCtx = {
    classSets,
    allSlots: [tue, thu],
    displayCutoff: DISPLAY_CUTOFF,
    isOffForGrade: NEVER_OFF,
  };

  it("week 1 火 = ①", () => {
    expect(computeSessionNumber(tue, "2026-04-07", baseCtx)).toBe(1);
  });
  it("week 1 木 = ②", () => {
    expect(computeSessionNumber(thu, "2026-04-09", baseCtx)).toBe(2);
  });
  it("week 2 火 = ③", () => {
    expect(computeSessionNumber(tue, "2026-04-14", baseCtx)).toBe(3);
  });
  it("week 2 木 = ④", () => {
    expect(computeSessionNumber(thu, "2026-04-16", baseCtx)).toBe(4);
  });
});

describe("computeSessionNumber - holiday skips count", () => {
  const slot = makeSlot(1, "火", "19:00-20:20", "中3");
  // 4-14 (week 2 Tuesday) is off
  const isOff = (d) => d === "2026-04-14";
  const ctx = {
    classSets: [],
    allSlots: [slot],
    displayCutoff: DISPLAY_CUTOFF,
    isOffForGrade: isOff,
  };

  it("week 1 火 = ①", () => {
    expect(computeSessionNumber(slot, "2026-04-07", ctx)).toBe(1);
  });
  it("week 2 火 休講 → 0 (non-active)", () => {
    expect(computeSessionNumber(slot, "2026-04-14", ctx)).toBe(0);
  });
  it("week 3 火 = ② (週2 はカウントされない)", () => {
    expect(computeSessionNumber(slot, "2026-04-21", ctx)).toBe(2);
  });
});

describe("computeSessionNumber - biweekly A week only", () => {
  const slot = makeSlot(1, "火", "19:00-20:20", "中3", { note: "隔週(副)" });
  const anchors = [{ date: "2026-04-07", weekType: "A" }];
  // 2026-04-07 は A 週, 2026-04-14 は B 週, 2026-04-21 は A 週
  const ctx = {
    classSets: [],
    allSlots: [slot],
    displayCutoff: DISPLAY_CUTOFF,
    isOffForGrade: NEVER_OFF,
    biweeklyAnchors: anchors,
  };

  it("A 週 火 = ①", () => {
    expect(computeSessionNumber(slot, "2026-04-07", ctx)).toBe(1);
  });
  it("B 週 火 = 0 (non-active)", () => {
    expect(computeSessionNumber(slot, "2026-04-14", ctx)).toBe(0);
  });
  it("次の A 週 火 = ②", () => {
    expect(computeSessionNumber(slot, "2026-04-21", ctx)).toBe(2);
  });
});

describe("computeSessionNumber - same-day multiple slots ordered by time", () => {
  // 両方とも火曜同時刻帯に並ぶスロット
  const early = makeSlot(1, "火", "18:00-19:00", "中3");
  const late = makeSlot(2, "火", "19:30-20:30", "中3");
  const classSets = [{ id: 10, label: "中3 数学 連続コマ", slotIds: [1, 2] }];
  const ctx = {
    classSets,
    allSlots: [early, late],
    displayCutoff: DISPLAY_CUTOFF,
    isOffForGrade: NEVER_OFF,
  };

  it("earlier slot = ①", () => {
    expect(computeSessionNumber(early, "2026-04-07", ctx)).toBe(1);
  });
  it("later slot = ②", () => {
    expect(computeSessionNumber(late, "2026-04-07", ctx)).toBe(2);
  });
});

describe("buildSessionCountMap", () => {
  it("returns Map with counts for all active slots", () => {
    const tue = makeSlot(1, "火", "19:00-20:20", "中3");
    const thu = makeSlot(2, "木", "19:00-20:20", "中3");
    const classSets = [{ id: 10, label: "中3 数学", slotIds: [1, 2] }];
    const ctx = {
      classSets,
      allSlots: [tue, thu],
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
    };
    const map = buildSessionCountMap([tue, thu], "2026-04-16", ctx);
    expect(map.get(1)).toBe(0); // 火曜日ではない日
    expect(map.get(2)).toBe(4); // 木曜日: week 1 火, week 1 木, week 2 火, week 2 木 = ④
  });

  it("handles empty inputs gracefully", () => {
    expect(buildSessionCountMap([], "2026-04-07", {}).size).toBe(0);
    expect(buildSessionCountMap(null, "2026-04-07", {}).size).toBe(0);
  });
});

describe("formatSessionNumber", () => {
  it("returns circled digits for 1-20", () => {
    expect(formatSessionNumber(1)).toBe("①");
    expect(formatSessionNumber(3)).toBe("③");
    expect(formatSessionNumber(20)).toBe("⑳");
  });
  it("returns 第N回 for N > 20", () => {
    expect(formatSessionNumber(21)).toBe("第21回");
    expect(formatSessionNumber(100)).toBe("第100回");
  });
  it("returns empty string for 0 or invalid", () => {
    expect(formatSessionNumber(0)).toBe("");
    expect(formatSessionNumber(null)).toBe("");
    expect(formatSessionNumber(undefined)).toBe("");
  });
});
