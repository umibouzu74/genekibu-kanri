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

describe("computeSessionNumber - 中学部開講日のオリエン (1 限スキップ)", () => {
  // 中学部は開講日の 1 限目 (= 同曜日同学年の最早時刻) がオリエン扱い。
  // session count は 0 で表示なし、2 限目以降は通常通り ① から開始。
  // DISPLAY_CUTOFF: 中3 startDate=2026-04-07 (火)
  const p1 = makeSlot(1, "火", "18:55-19:40", "中3", { subj: "理科" });
  const p2 = makeSlot(2, "火", "19:50-20:35", "中3", { subj: "英語" });
  const p3 = makeSlot(3, "火", "20:45-21:30", "中3", { subj: "数学" });
  const ctx = {
    classSets: [],
    allSlots: [p1, p2, p3],
    displayCutoff: DISPLAY_CUTOFF,
    isOffForGrade: NEVER_OFF,
    orientationOnFirstDay: true,
  };

  it("開講日 1 限 (理科) はオリエンで 0", () => {
    expect(computeSessionNumber(p1, "2026-04-07", ctx)).toBe(0);
  });
  it("開講日 2 限 (英語) は ①", () => {
    expect(computeSessionNumber(p2, "2026-04-07", ctx)).toBe(1);
  });
  it("開講日 3 限 (数学) は ①", () => {
    expect(computeSessionNumber(p3, "2026-04-07", ctx)).toBe(1);
  });
  it("開講日翌週 1 限 (理科) は ① (オリエン週はカウント外)", () => {
    expect(computeSessionNumber(p1, "2026-04-14", ctx)).toBe(1);
  });
  it("開講日翌週 2 限 (英語) は ② (前週開講日でも 1 回目を加算済み)", () => {
    expect(computeSessionNumber(p2, "2026-04-14", ctx)).toBe(2);
  });
  it("orientationOnFirstDay を渡さなければ通常通り (1 限から ①)", () => {
    const off = { ...ctx, orientationOnFirstDay: false };
    expect(computeSessionNumber(p1, "2026-04-07", off)).toBe(1);
  });
  it("高校部スロットには適用されない (1 限から ①)", () => {
    const high = makeSlot(99, "火", "18:55-19:40", "高3", { subj: "数学" });
    const ctxH = {
      classSets: [],
      allSlots: [high],
      displayCutoff: DISPLAY_CUTOFF, // 高3: 2026-04-07
      isOffForGrade: NEVER_OFF,
      orientationOnFirstDay: true,
    };
    expect(computeSessionNumber(high, "2026-04-07", ctxH)).toBe(1);
  });
  it("buildSessionCountMap でも 1 限のみ 0 になる", () => {
    const map = buildSessionCountMap([p1, p2, p3], "2026-04-07", ctx);
    expect(map.get(1)).toBe(0); // 理科 (orient)
    expect(map.get(2)).toBe(1); // 英語
    expect(map.get(3)).toBe(1); // 数学
  });
});

describe("computeSessionNumber - 中学部オリエン (セット連動)", () => {
  // 中学部全学年で startDate = 2026-04-07 (火) を共通設定
  const MS_CUTOFF = {
    groups: [
      {
        label: "中学部",
        grades: ["中1", "中2", "中3"],
        startDate: "2026-04-07",
      },
    ],
  };

  it("中2 月木セット: 月 4/13 と 木 4/9 → 木が先で 4/9 (木) が初開講", () => {
    // 月 18:55 (1限相当) / 月 19:50 / 木 18:55 (1限相当) / 木 19:50
    const monP1 = makeSlot(10, "月", "18:55-19:40", "中2", { subj: "数学" });
    const monP2 = makeSlot(11, "月", "19:50-20:35", "中2", { subj: "英語" });
    const thuP1 = makeSlot(20, "木", "18:55-19:40", "中2", { subj: "国語" });
    const thuP2 = makeSlot(21, "木", "19:50-20:35", "中2", { subj: "理科" });
    const ctx = {
      classSets: [{ id: 100, label: "中2 (月・木)", slotIds: [10, 11, 20, 21] }],
      allSlots: [monP1, monP2, thuP1, thuP2],
      displayCutoff: MS_CUTOFF,
      isOffForGrade: NEVER_OFF,
      orientationOnFirstDay: true,
    };
    // 4/9 (木) 初開講: 1 限の thuP1 = 0, 2 限の thuP2 = ①
    expect(computeSessionNumber(thuP1, "2026-04-09", ctx)).toBe(0);
    expect(computeSessionNumber(thuP2, "2026-04-09", ctx)).toBe(1);
    // 4/13 (月): 初開講 (4/9) でないので 1 限もオリエン対象外 → ①
    expect(computeSessionNumber(monP1, "2026-04-13", ctx)).toBe(1);
    expect(computeSessionNumber(monP2, "2026-04-13", ctx)).toBe(1);
    // 4/16 (木) 翌週: 1 限 thuP1 → ① (前週 4/9 はオリエンで未カウント), 2 限 → ②
    expect(computeSessionNumber(thuP1, "2026-04-16", ctx)).toBe(1);
    expect(computeSessionNumber(thuP2, "2026-04-16", ctx)).toBe(2);
  });

  it("中1 火金セット: 火 4/7 が先で 4/7 (火) が初開講", () => {
    const tueP1 = makeSlot(50, "火", "18:55-19:40", "中1", { subj: "理科" });
    const tueP2 = makeSlot(51, "火", "19:50-20:35", "中1", { subj: "英語" });
    const friP1 = makeSlot(60, "金", "18:55-19:40", "中1", { subj: "数学" });
    const friP2 = makeSlot(61, "金", "19:50-20:35", "中1", { subj: "国語" });
    const ctx = {
      classSets: [{ id: 200, label: "中1 (火・金)", slotIds: [50, 51, 60, 61] }],
      allSlots: [tueP1, tueP2, friP1, friP2],
      displayCutoff: MS_CUTOFF,
      isOffForGrade: NEVER_OFF,
      orientationOnFirstDay: true,
    };
    // 4/7 (火) 初開講: 1 限 = 0, 2 限 = ①
    expect(computeSessionNumber(tueP1, "2026-04-07", ctx)).toBe(0);
    expect(computeSessionNumber(tueP2, "2026-04-07", ctx)).toBe(1);
    // 4/10 (金) は初開講ではない → 1 限から ①
    expect(computeSessionNumber(friP1, "2026-04-10", ctx)).toBe(1);
    expect(computeSessionNumber(friP2, "2026-04-10", ctx)).toBe(1);
  });

  it("中3 水金セット: 水 4/8 が先で 4/8 (水) が初開講", () => {
    const wedP1 = makeSlot(70, "水", "18:55-19:40", "中3", { subj: "社会" });
    const wedP2 = makeSlot(71, "水", "19:50-20:35", "中3", { subj: "数学" });
    const friP = makeSlot(72, "金", "19:50-20:35", "中3", { subj: "英語" });
    const ctx = {
      classSets: [{ id: 300, label: "中3 (水・金)", slotIds: [70, 71, 72] }],
      allSlots: [wedP1, wedP2, friP],
      displayCutoff: MS_CUTOFF,
      isOffForGrade: NEVER_OFF,
      orientationOnFirstDay: true,
    };
    // 4/8 (水) 初開講: 1 限 = 0, 2 限 = ①
    expect(computeSessionNumber(wedP1, "2026-04-08", ctx)).toBe(0);
    expect(computeSessionNumber(wedP2, "2026-04-08", ctx)).toBe(1);
    // 4/10 (金) は初開講外 → ①
    expect(computeSessionNumber(friP, "2026-04-10", ctx)).toBe(1);
  });

  it("セット未登録スロットは同学年フォールバック (cohort 推定不能)", () => {
    // 中2 で 月にしかスロットがなく、セット未登録のケース。
    // 同学年同曜日の最早が 1 限としてオリエン扱いされる (従来挙動継続)。
    const m1 = makeSlot(80, "月", "18:55-19:40", "中2", { subj: "理科" });
    const m2 = makeSlot(81, "月", "19:50-20:35", "中2", { subj: "英語" });
    const ctx = {
      classSets: [],
      allSlots: [m1, m2],
      displayCutoff: MS_CUTOFF,
      isOffForGrade: NEVER_OFF,
      orientationOnFirstDay: true,
    };
    // startDate 4/7 火 → 同学年 pool で初日付の月曜は 4/13
    expect(computeSessionNumber(m1, "2026-04-13", ctx)).toBe(0);
    expect(computeSessionNumber(m2, "2026-04-13", ctx)).toBe(1);
  });
});

describe("computeSessionNumber - 学年×曜日ペアセット内の cohort 別カウンタ", () => {
  // 学年×曜日ペアでセットを括り、cohort (cls) 別に進度カウンタを独立させる。
  // 同じ時間帯に並行する別 cohort の同教科は別カウンタで進む。
  // 合同コマ (cls="S/AB/C") は独立 cohort として独立カウント (Q1 案A)。

  const MS_CUTOFF = {
    groups: [
      { label: "中学部", grades: ["中1", "中2", "中3"], startDate: "2026-04-07" },
    ],
  };

  it("同時間帯の中3 S 英語と中3 A 英語は別 cohort カウンタで両方 ①", () => {
    // 火 19:50 に中3 S と中3 A が同時並行で英語を受講
    const sEng = makeSlot(1, "火", "19:50-20:35", "中3", { subj: "英語", cls: "S" });
    const aEng = makeSlot(2, "火", "19:50-20:35", "中3", { subj: "英語", cls: "A" });
    const ctx = {
      classSets: [{ id: 100, label: "中3 (火・木)", slotIds: [1, 2] }],
      allSlots: [sEng, aEng],
      displayCutoff: MS_CUTOFF,
      isOffForGrade: NEVER_OFF,
    };
    expect(computeSessionNumber(sEng, "2026-04-07", ctx)).toBe(1);
    expect(computeSessionNumber(aEng, "2026-04-07", ctx)).toBe(1);
  });

  it("同 cohort の火・木の同教科は通算カウント、別 cohort には影響しない", () => {
    // 中3 S 火 19:50 英語、中3 S 木 19:50 英語、中3 A 火 19:50 英語
    const sTueEng = makeSlot(1, "火", "19:50-20:35", "中3", { subj: "英語", cls: "S" });
    const sThuEng = makeSlot(2, "木", "19:50-20:35", "中3", { subj: "英語", cls: "S" });
    const aTueEng = makeSlot(3, "火", "19:50-20:35", "中3", { subj: "英語", cls: "A" });
    const ctx = {
      classSets: [{ id: 100, label: "中3 (火・木)", slotIds: [1, 2, 3] }],
      allSlots: [sTueEng, sThuEng, aTueEng],
      displayCutoff: MS_CUTOFF,
      isOffForGrade: NEVER_OFF,
    };
    // 4/7 (火): S 英語①, A 英語①
    expect(computeSessionNumber(sTueEng, "2026-04-07", ctx)).toBe(1);
    expect(computeSessionNumber(aTueEng, "2026-04-07", ctx)).toBe(1);
    // 4/9 (木): S 英語②, A は実施なし
    expect(computeSessionNumber(sThuEng, "2026-04-09", ctx)).toBe(2);
    // 4/14 (火): S 英語③, A 英語②
    expect(computeSessionNumber(sTueEng, "2026-04-14", ctx)).toBe(3);
    expect(computeSessionNumber(aTueEng, "2026-04-14", ctx)).toBe(2);
  });

  it("合同コマ (cls='S/AB/C') は独立 cohort として独立カウント", () => {
    // 月 18:55 中2 SABC合同 理科 (合同 cohort), 月 19:50 中2 S 国語 (S 専用)
    const goudouSci = makeSlot(1, "月", "18:55-19:40", "中2", {
      subj: "理科",
      cls: "S/AB/C",
    });
    const sKoku = makeSlot(2, "月", "19:50-20:35", "中2", {
      subj: "国語",
      cls: "S",
    });
    const sSci = makeSlot(3, "月", "20:45-21:30", "中2", {
      subj: "理科",
      cls: "S",
    });
    const ctx = {
      classSets: [{ id: 200, label: "中2 (月・木)", slotIds: [1, 2, 3] }],
      allSlots: [goudouSci, sKoku, sSci],
      displayCutoff: MS_CUTOFF,
      isOffForGrade: NEVER_OFF,
    };
    // 4/13 (月) 4/7 火スタートで初の月曜:
    //   - SABC合同 理科 → cohort 'S/AB/C' で 理科①
    //   - S 国語 → cohort 'S' で 国語①
    //   - S 理科 → cohort 'S' で 理科① (合同とは別カウンタ)
    expect(computeSessionNumber(goudouSci, "2026-04-13", ctx)).toBe(1);
    expect(computeSessionNumber(sKoku, "2026-04-13", ctx)).toBe(1);
    expect(computeSessionNumber(sSci, "2026-04-13", ctx)).toBe(1);
  });

  it("buildSessionCountMap でも cohort 別カウンタが正しい", () => {
    const sEng = makeSlot(1, "火", "19:50-20:35", "中3", { subj: "英語", cls: "S" });
    const aEng = makeSlot(2, "火", "19:50-20:35", "中3", { subj: "英語", cls: "A" });
    const sMath = makeSlot(3, "火", "20:45-21:30", "中3", { subj: "数学", cls: "S" });
    const ctx = {
      classSets: [{ id: 100, label: "中3 (火・木)", slotIds: [1, 2, 3] }],
      allSlots: [sEng, aEng, sMath],
      displayCutoff: MS_CUTOFF,
      isOffForGrade: NEVER_OFF,
    };
    const map = buildSessionCountMap([sEng, aEng, sMath], "2026-04-07", ctx);
    expect(map.get(1)).toBe(1); // S 英語①
    expect(map.get(2)).toBe(1); // A 英語①
    expect(map.get(3)).toBe(1); // S 数学①
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

  it("並列スロット (同一 day|time|grade|cls|subj で担任違い) は 1 回として集計", () => {
    // 中3 火曜 確認テスト 藤田 + 大屋敷 を想定
    // user が両スロットを 1 つの classSet にまとめている前提 (ユーザの実運用)。
    // 並列スロットの dedupe が無いと 1 日で +2 カウントされてしまう。
    const fujita = makeSlot(97, "火", "21:35-21:50", "中3", {
      cls: "SS〜C", subj: "確認テスト", teacher: "藤田", room: "501",
    });
    const oyashiki = makeSlot(98, "火", "21:35-21:50", "中3", {
      cls: "SS〜C", subj: "確認テスト", teacher: "大屋敷", room: "503",
    });
    const ctx = {
      classSets: [{ id: 50, label: "中3 火 確認テスト", slotIds: [97, 98] }],
      allSlots: [fujita, oyashiki],
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
    };
    // 2026-04-07(火) → 1 回, 2026-04-14(火) → 2 回。dedupe 無しなら 4 回。
    const map = buildSessionCountMap([fujita, oyashiki], "2026-04-14", ctx);
    expect(map.get(97)).toBe(2);
    // 並列側 (大屋敷) は activeSlotsOnDay の dedupe で除外されるため 0。
    // UI 側では集約により非表示になり、このカウントは参照されない。
    expect(map.get(98)).toBe(0);
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
