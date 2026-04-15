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

describe("computeSessionNumber - セット内教科別カウンタ", () => {
  // 火: 英語 19:00 / 数学 20:20, 木: 英語 19:00 / 理科 20:20 を 1 セットに束ねる
  const tueEng = makeSlot(1, "火", "19:00-20:20", "中3", { subj: "英語" });
  const tueMath = makeSlot(2, "火", "20:30-21:50", "中3", { subj: "数学" });
  const thuEng = makeSlot(3, "木", "19:00-20:20", "中3", { subj: "英語" });
  const thuSci = makeSlot(4, "木", "20:30-21:50", "中3", { subj: "理科" });
  const classSets = [
    { id: 10, label: "中3 (火・木)", slotIds: [1, 2, 3, 4] },
  ];
  const baseCtx = {
    classSets,
    allSlots: [tueEng, tueMath, thuEng, thuSci],
    displayCutoff: DISPLAY_CUTOFF,
    isOffForGrade: NEVER_OFF,
  };

  it("4/7 (火) 英語 = ①, 数学 = ①", () => {
    expect(computeSessionNumber(tueEng, "2026-04-07", baseCtx)).toBe(1);
    expect(computeSessionNumber(tueMath, "2026-04-07", baseCtx)).toBe(1);
  });
  it("4/9 (木) 英語 = ②, 理科 = ①", () => {
    expect(computeSessionNumber(thuEng, "2026-04-09", baseCtx)).toBe(2);
    expect(computeSessionNumber(thuSci, "2026-04-09", baseCtx)).toBe(1);
  });
  it("4/14 (火) 英語 = ③, 数学 = ②", () => {
    expect(computeSessionNumber(tueEng, "2026-04-14", baseCtx)).toBe(3);
    expect(computeSessionNumber(tueMath, "2026-04-14", baseCtx)).toBe(2);
  });
  it("4/16 (木) 英語 = ④, 理科 = ②", () => {
    expect(computeSessionNumber(thuEng, "2026-04-16", baseCtx)).toBe(4);
    expect(computeSessionNumber(thuSci, "2026-04-16", baseCtx)).toBe(2);
  });
  it("buildSessionCountMap でも同じ結果", () => {
    const map = buildSessionCountMap(
      [thuEng, thuSci],
      "2026-04-16",
      baseCtx
    );
    expect(map.get(3)).toBe(4); // 英語
    expect(map.get(4)).toBe(2); // 理科
  });
});

describe("computeSessionNumber - 英/数 隔週複合教科スロット", () => {
  // 月曜 19:00 の「英/数」隔週スロット (堀上=英, 河野=数 のように交代)
  // A 週は英語、B 週は数学として独立カウントする。
  const combo = makeSlot(1, "月", "19:00-20:20", "中3", {
    subj: "英/数",
    note: "隔週(河野)",
  });
  const anchors = [{ date: "2026-04-06", weekType: "A" }];
  // 4/6=月(A), 4/13=月(B), 4/20=月(A), 4/27=月(B)
  const MON_CUTOFF = {
    groups: [{ label: "中3", grades: ["中3"], startDate: "2026-04-06" }],
  };
  const ctx = {
    classSets: [],
    allSlots: [combo],
    displayCutoff: MON_CUTOFF,
    isOffForGrade: NEVER_OFF,
    biweeklyAnchors: anchors,
  };

  it("4/6 (A 週) は 英語として ①", () => {
    expect(computeSessionNumber(combo, "2026-04-06", ctx)).toBe(1);
  });
  it("4/13 (B 週) は 数学として ① (英語カウントに影響しない)", () => {
    expect(computeSessionNumber(combo, "2026-04-13", ctx)).toBe(1);
  });
  it("4/20 (A 週) は 英語として ② (A 週分のみ累積)", () => {
    expect(computeSessionNumber(combo, "2026-04-20", ctx)).toBe(2);
  });
  it("4/27 (B 週) は 数学として ② (B 週分のみ累積)", () => {
    expect(computeSessionNumber(combo, "2026-04-27", ctx)).toBe(2);
  });

  it("同セット内の純英語スロットは 英/数 の A 週分をカウントに含む", () => {
    // 月 20:30 に純粋な英語スロットがあり、上記 combo と同じセットに入れる
    const pureEng = makeSlot(2, "月", "20:30-21:50", "中3", { subj: "英語" });
    const setCtx = {
      ...ctx,
      classSets: [{ id: 10, label: "中3 月セット", slotIds: [1, 2] }],
      allSlots: [combo, pureEng],
    };
    // 4/6 (A) 英語実施: combo=英(19:00), pureEng=英(20:30) → combo ①, pureEng ②
    expect(computeSessionNumber(combo, "2026-04-06", setCtx)).toBe(1);
    expect(computeSessionNumber(pureEng, "2026-04-06", setCtx)).toBe(2);
    // 4/13 (B) 英語は pureEng のみ、combo は数 (英語から除外) → pureEng ③
    expect(computeSessionNumber(pureEng, "2026-04-13", setCtx)).toBe(3);
    // 4/20 (A) 英語 combo+pureEng → combo ④, pureEng ⑤
    expect(computeSessionNumber(combo, "2026-04-20", setCtx)).toBe(4);
    expect(computeSessionNumber(pureEng, "2026-04-20", setCtx)).toBe(5);
  });

  it("数/英 ペアも A 週 = 先頭 (数) / B 週 = 次 (英) で独立カウント", () => {
    // 中2 AB の「英/数 堀上」(id=1) と 中2 C の「数/英 河野」(id=2) のような
    // ペアを想定。グローバルアンカーで両方同じ週判定になる。
    const abCombo = combo; // 英/数 堀上 (id=1)
    const cCombo = makeSlot(2, "月", "19:00-20:20", "中2", {
      subj: "数/英",
      note: "隔週(堀上)",
    });
    const pairCtx = {
      classSets: [],
      allSlots: [abCombo, cCombo],
      displayCutoff: {
        groups: [
          { label: "中3", grades: ["中3"], startDate: "2026-04-06" },
          { label: "中2", grades: ["中2"], startDate: "2026-04-06" },
        ],
      },
      isOffForGrade: NEVER_OFF,
      biweeklyAnchors: anchors,
    };
    // 4/6 (A): abCombo = 英 ①, cCombo = 数 ①
    expect(computeSessionNumber(abCombo, "2026-04-06", pairCtx)).toBe(1);
    expect(computeSessionNumber(cCombo, "2026-04-06", pairCtx)).toBe(1);
    // 4/13 (B): abCombo = 数 ①, cCombo = 英 ①
    expect(computeSessionNumber(abCombo, "2026-04-13", pairCtx)).toBe(1);
    expect(computeSessionNumber(cCombo, "2026-04-13", pairCtx)).toBe(1);
    // 4/20 (A): abCombo = 英 ②, cCombo = 数 ②
    expect(computeSessionNumber(abCombo, "2026-04-20", pairCtx)).toBe(2);
    expect(computeSessionNumber(cCombo, "2026-04-20", pairCtx)).toBe(2);
  });

  it("個別アンカー (slot.biweeklyAnchors) が優先され、グローバルと週判定が逆転する", () => {
    // スロット個別アンカーで A/B を反転させたスロット。
    // グローバル基準では 4/6 が A 週だが、このスロットでは 4/6 を B 週扱いにする
    // (= 前週の 3/30 を A 週基準点として設定)。
    const flipped = makeSlot(99, "月", "19:00-20:20", "中3", {
      subj: "英/数",
      note: "隔週(河野)",
      biweeklyAnchors: [{ date: "2026-03-30", weekType: "A" }],
    });
    const flipCtx = {
      classSets: [],
      allSlots: [flipped],
      displayCutoff: {
        groups: [{ label: "中3", grades: ["中3"], startDate: "2026-04-06" }],
      },
      isOffForGrade: NEVER_OFF,
      biweeklyAnchors: anchors, // グローバルは 4/6=A のまま
    };
    // 4/6: グローバルでは A だが、個別アンカー 3/30=A により 4/6 は B → 数学 ①
    expect(computeSessionNumber(flipped, "2026-04-06", flipCtx)).toBe(1);
    // 4/13: 個別アンカー基準では A 週 → 英語 ①
    expect(computeSessionNumber(flipped, "2026-04-13", flipCtx)).toBe(1);
    // 4/20: 個別アンカー基準では B 週 → 数学 ②
    expect(computeSessionNumber(flipped, "2026-04-20", flipCtx)).toBe(2);
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
