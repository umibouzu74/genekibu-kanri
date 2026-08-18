import { describe, expect, it } from "vitest";
import {
  buildSessionCountMap,
  computeSessionNumber,
  formatSessionNumber,
  getGradeStartDate,
  getSlotCountStartDate,
  isOrientationEnabledForGrade,
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

describe("getGradeStartDate - 複合学年 (中1-3 など)", () => {
  // 表示フィルタ (isSlotBeyondCutoff) は findGroupForGrade で「中1-3」を
  // 中1・2 グループに展開して当てているので、回数の起点も同じ引き方にする。
  // 完全一致で引いていた頃は、土曜プレップ (中1-3) だけ第N回が出なかった。
  const dc = {
    groups: [
      { label: "中1・2", grades: ["中1", "中2"], startDate: "2026-04-07", date: null },
      { label: "高3", grades: ["高3"], startDate: "2026-04-10", date: null },
    ],
  };

  it("複合学年でもグループ開始日を引ける", () => {
    expect(getGradeStartDate("中1-3", dc)).toBe("2026-04-07");
    expect(getGradeStartDate("中1", dc)).toBe("2026-04-07");
  });

  it("どのグループにも属さない学年は null のまま", () => {
    expect(getGradeStartDate("附中", dc)).toBeNull();
    expect(getGradeStartDate("高1高2", dc)).toBeNull();
  });

  it("複合学年のコマでも第N回が出る", () => {
    // 2026-04-11 は土曜
    const prep = makeSlot(90, "土", "18:30-20:00", "中1-3", { subj: "英語" });
    const ctx = {
      classSets: [],
      allSlots: [prep],
      displayCutoff: dc,
      timetables: [],
      isOffForGrade: NEVER_OFF,
      biweeklyAnchors: [],
    };
    expect(computeSessionNumber(prep, "2026-04-11", ctx)).toBe(1);
    expect(computeSessionNumber(prep, "2026-04-18", ctx)).toBe(2);
  });
});

describe("isOrientationEnabledForGrade (学年グループ設定)", () => {
  it("未設定なら従来既定: 中学部 true / 高校部 false", () => {
    expect(isOrientationEnabledForGrade("中3", DISPLAY_CUTOFF)).toBe(true);
    expect(isOrientationEnabledForGrade("高3", DISPLAY_CUTOFF)).toBe(false);
  });
  it("グループの orientationFirstDay が明示設定ならそれに従う", () => {
    const dc = {
      groups: [
        { label: "中3", grades: ["中3"], startDate: "2026-09-01", date: null, orientationFirstDay: false },
        { label: "高3", grades: ["高3"], startDate: "2026-09-01", date: null, orientationFirstDay: true },
      ],
    };
    expect(isOrientationEnabledForGrade("中3", dc)).toBe(false);
    expect(isOrientationEnabledForGrade("高3", dc)).toBe(true);
  });
  it("グループ未定義の学年 / displayCutoff 未設定は既定 (学部で判定)", () => {
    expect(isOrientationEnabledForGrade("中1", DISPLAY_CUTOFF)).toBe(true);
    expect(isOrientationEnabledForGrade("高1", undefined)).toBe(false);
    expect(isOrientationEnabledForGrade("", DISPLAY_CUTOFF)).toBe(false);
  });
});

describe("computeSessionNumber - オリエンの学年グループ設定", () => {
  // 2 学期以降のようにオリエンが入らない期は、表示期間設定の
  // orientationFirstDay を false にして 1 限から ① で数える。
  const p1 = makeSlot(1, "火", "18:55-19:40", "中3", { subj: "理科" });
  const p2 = makeSlot(2, "火", "19:50-20:35", "中3", { subj: "英語" });

  const ctxWith = (orientationFirstDay) => ({
    classSets: [],
    allSlots: [p1, p2],
    displayCutoff: {
      groups: [
        {
          label: "中3",
          grades: ["中3"],
          startDate: "2026-04-07",
          date: null,
          ...(orientationFirstDay === undefined ? {} : { orientationFirstDay }),
        },
      ],
    },
    isOffForGrade: NEVER_OFF,
    orientationOnFirstDay: true,
  });

  it("orientationFirstDay: false → 開講日 1 限も ① から数える", () => {
    const ctx = ctxWith(false);
    expect(computeSessionNumber(p1, "2026-04-07", ctx)).toBe(1);
    expect(computeSessionNumber(p2, "2026-04-07", ctx)).toBe(1);
    // 翌週は ② (開講日をカウント済み)
    expect(computeSessionNumber(p1, "2026-04-14", ctx)).toBe(2);
  });

  it("orientationFirstDay: true → 従来どおり 1 限はオリエンで 0", () => {
    const ctx = ctxWith(true);
    expect(computeSessionNumber(p1, "2026-04-07", ctx)).toBe(0);
    expect(computeSessionNumber(p2, "2026-04-07", ctx)).toBe(1);
  });

  it("未設定 (従来データ) は中学部で有効のまま", () => {
    const ctx = ctxWith(undefined);
    expect(computeSessionNumber(p1, "2026-04-07", ctx)).toBe(0);
  });

  it("高校部でも orientationFirstDay: true なら適用される", () => {
    const h1 = makeSlot(11, "火", "18:55-19:40", "高3", { subj: "理科" });
    const h2 = makeSlot(12, "火", "19:50-20:35", "高3", { subj: "英語" });
    const ctx = {
      classSets: [],
      allSlots: [h1, h2],
      displayCutoff: {
        groups: [
          {
            label: "高3",
            grades: ["高3"],
            startDate: "2026-04-07",
            date: null,
            orientationFirstDay: true,
          },
        ],
      },
      isOffForGrade: NEVER_OFF,
      orientationOnFirstDay: true,
    };
    expect(computeSessionNumber(h1, "2026-04-07", ctx)).toBe(0);
    expect(computeSessionNumber(h2, "2026-04-07", ctx)).toBe(1);
  });

  it("buildSessionCountMap も設定に追従する", () => {
    const map = buildSessionCountMap([p1, p2], "2026-04-07", ctxWith(false));
    expect(map.get(1)).toBe(1);
    expect(map.get(2)).toBe(1);
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

describe("computeSessionNumber - コホートフォールバック (ClassSet 未登録)", () => {
  // 高1 高松西: 月(数/英) + 木(数/英) = 週2。ClassSet 未登録でも英数が
  // コース (コホート) 単位で通算される。2026-04-06 月 / 04-09 木 / 04-13 月。
  const monMath = makeSlot(1, "月", "19:40-20:40", "高1", { subj: "高松西 数学" });
  const monEng = makeSlot(2, "月", "20:50-21:50", "高1", { subj: "高松西 英語" });
  const thuMath = makeSlot(3, "木", "19:40-20:40", "高1", { subj: "高松西 数学" });
  const thuEng = makeSlot(4, "木", "20:50-21:50", "高1", { subj: "高松西 英語" });
  const HS_CUTOFF = {
    groups: [{ label: "高1・2", grades: ["高1", "高2"], startDate: "2026-04-06" }],
  };
  const ctx = {
    classSets: [],
    allSlots: [monMath, monEng, thuMath, thuEng],
    displayCutoff: HS_CUTOFF,
    isOffForGrade: NEVER_OFF,
  };

  it("数学は 月=① 木=② 月=③ と週2で通算される", () => {
    expect(computeSessionNumber(monMath, "2026-04-06", ctx)).toBe(1);
    expect(computeSessionNumber(thuMath, "2026-04-09", ctx)).toBe(2);
    expect(computeSessionNumber(monMath, "2026-04-13", ctx)).toBe(3);
  });

  it("英語は数学と独立して通算される", () => {
    expect(computeSessionNumber(monEng, "2026-04-06", ctx)).toBe(1);
    expect(computeSessionNumber(thuEng, "2026-04-09", ctx)).toBe(2);
  });

  it("英数以外 (物理) はコホート外なので単体カウント", () => {
    // 04-10 金 / 04-17 金
    const phys = makeSlot(5, "金", "18:30-19:30", "高1", { subj: "高松西 物理" });
    const ctx2 = { ...ctx, allSlots: [...ctx.allSlots, phys] };
    expect(computeSessionNumber(phys, "2026-04-10", ctx2)).toBe(1);
    expect(computeSessionNumber(phys, "2026-04-17", ctx2)).toBe(2);
  });

  it("明示的 ClassSet があればそちらが優先される", () => {
    const ctx3 = { ...ctx, classSets: [{ id: 1, label: "数学のみ", slotIds: [1, 3] }] };
    expect(computeSessionNumber(monMath, "2026-04-06", ctx3)).toBe(1);
    expect(computeSessionNumber(thuMath, "2026-04-09", ctx3)).toBe(2);
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

// ─── SessionOverride (回数手動補正) ─────────────────────────────
describe("computeSessionNumber - sessionOverrides: set mode", () => {
  const tue = makeSlot(1, "火", "19:00-20:20", "中3");
  const allSlots = [tue];

  it("set override は value を即返す", () => {
    const ctx = {
      classSets: [],
      allSlots,
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
      sessionOverrides: [
        { id: 1, slotId: 1, date: "2026-04-14", mode: "set", value: 5, memo: "" },
      ],
    };
    expect(computeSessionNumber(tue, "2026-04-14", ctx)).toBe(5);
  });

  it("set override 以降のカウンタは value を基準に連番で続く", () => {
    const ctx = {
      classSets: [],
      allSlots,
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
      sessionOverrides: [
        { id: 1, slotId: 1, date: "2026-04-14", mode: "set", value: 5, memo: "" },
      ],
    };
    // 4/14 (2 回目) を 5 に強制 → 4/21 (本来 3 回目) は 6 になる
    expect(computeSessionNumber(tue, "2026-04-21", ctx)).toBe(6);
    expect(computeSessionNumber(tue, "2026-04-28", ctx)).toBe(7);
  });

  it("set override 以前は通常のカウント", () => {
    const ctx = {
      classSets: [],
      allSlots,
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
      sessionOverrides: [
        { id: 1, slotId: 1, date: "2026-04-21", mode: "set", value: 10, memo: "" },
      ],
    };
    expect(computeSessionNumber(tue, "2026-04-07", ctx)).toBe(1);
    expect(computeSessionNumber(tue, "2026-04-14", ctx)).toBe(2);
    expect(computeSessionNumber(tue, "2026-04-21", ctx)).toBe(10);
  });
});

describe("computeSessionNumber - sessionOverrides: skip mode", () => {
  const tue = makeSlot(1, "火", "19:00-20:20", "中3");
  const allSlots = [tue];

  it("skip override は 0 を返し、カウンタも進めない (displayAs 未指定)", () => {
    const ctx = {
      classSets: [],
      allSlots,
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
      sessionOverrides: [
        { id: 1, slotId: 1, date: "2026-04-14", mode: "skip", memo: "" },
      ],
    };
    // 4/14 は skip → 0
    expect(computeSessionNumber(tue, "2026-04-14", ctx)).toBe(0);
    // 4/21 は 2 回目として扱う (4/14 をスキップしたため)
    expect(computeSessionNumber(tue, "2026-04-21", ctx)).toBe(2);
  });

  it("skip + displayAs は displayAs を表示し、以降の通常カウントがその値を飛ばす", () => {
    // 4/7=1, 4/14=2, 4/21=skip displayAs=4 (合同で第4回を消化),
    // 4/28 の通常カウントは 3 (4 は予約済みで飛ばされる次回の 5 に備える),
    // 5/5 は 5 (通常 +1 = 4 だが予約済みなのでスキップ)
    const ctx = {
      classSets: [],
      allSlots,
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
      sessionOverrides: [
        { id: 1, slotId: 1, date: "2026-04-21", mode: "skip", displayAs: 4, memo: "" },
      ],
    };
    expect(computeSessionNumber(tue, "2026-04-07", ctx)).toBe(1);
    expect(computeSessionNumber(tue, "2026-04-14", ctx)).toBe(2);
    expect(computeSessionNumber(tue, "2026-04-21", ctx)).toBe(4); // skip の displayAs
    expect(computeSessionNumber(tue, "2026-04-28", ctx)).toBe(3); // 通常 +1 = 3 (4 未到達)
    expect(computeSessionNumber(tue, "2026-05-05", ctx)).toBe(5); // 通常 +1 → 4 だが予約済み → 5
    expect(computeSessionNumber(tue, "2026-05-12", ctx)).toBe(6);
  });

  it("skip + displayAs の値が未来の通常カウントに出てこないこと (予約)", () => {
    // 4/7=1, 4/14=2, 4/21=3, 4/28=skip displayAs=6, 5/5 は 4, 5/12 は 5,
    // 5/19 の通常 +1 は 6 だが予約済み → 7, 以降 8,9...
    const ctx = {
      classSets: [],
      allSlots,
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
      sessionOverrides: [
        { id: 1, slotId: 1, date: "2026-04-28", mode: "skip", displayAs: 6, memo: "" },
      ],
    };
    expect(computeSessionNumber(tue, "2026-04-28", ctx)).toBe(6);
    expect(computeSessionNumber(tue, "2026-05-05", ctx)).toBe(4);
    expect(computeSessionNumber(tue, "2026-05-12", ctx)).toBe(5);
    expect(computeSessionNumber(tue, "2026-05-19", ctx)).toBe(7); // 6 を飛ばす
    expect(computeSessionNumber(tue, "2026-05-26", ctx)).toBe(8);
  });

  it("displayAs が 0 以下なら従来通り空欄扱い", () => {
    const ctx = {
      classSets: [],
      allSlots,
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
      sessionOverrides: [
        { id: 1, slotId: 1, date: "2026-04-14", mode: "skip", displayAs: 0, memo: "" },
      ],
    };
    expect(computeSessionNumber(tue, "2026-04-14", ctx)).toBe(0);
    expect(computeSessionNumber(tue, "2026-04-21", ctx)).toBe(2);
  });

  it("set 値も予約されるため、以降の通常カウントが set 値を避ける", () => {
    // 4/7=1, 4/14=2, 4/21=set 5 → running=5, reserved={5},
    // 4/28 の通常 +1=6 (reserved の 5 はすでに通過している)
    const ctx = {
      classSets: [],
      allSlots,
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
      sessionOverrides: [
        { id: 1, slotId: 1, date: "2026-04-21", mode: "set", value: 5, memo: "" },
      ],
    };
    expect(computeSessionNumber(tue, "2026-04-21", ctx)).toBe(5);
    expect(computeSessionNumber(tue, "2026-04-28", ctx)).toBe(6);
  });
});

describe("buildSessionCountMap - sessionOverrides", () => {
  it("同一バケット内で set override が走査中の running counter を更新する", () => {
    // 中3 数学 火木セット、4/09 (木, 2回目) に set:10 を入れる
    const tue = makeSlot(1, "火", "19:00-20:20", "中3");
    const thu = makeSlot(2, "木", "19:00-20:20", "中3");
    const classSets = [{ id: 10, label: "中3 数学", slotIds: [1, 2] }];
    const ctx = {
      classSets,
      allSlots: [tue, thu],
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
      sessionOverrides: [
        { id: 1, slotId: 2, date: "2026-04-09", mode: "set", value: 10, memo: "" },
      ],
    };
    // 4/16 (木) は本来 4 回目 → 10 を基準に連番: 4/09=10, 4/14=11, 4/16=12
    const map = buildSessionCountMap([thu], "2026-04-16", ctx);
    expect(map.get(2)).toBe(12);
  });

  it("cohort が異なるスロットには override が波及しない", () => {
    // 中3 英語 火曜 の S と A が並列 (同セット)。S のみに override。
    const sTue = makeSlot(1, "火", "19:00-20:20", "中3", { cls: "S", subj: "英語" });
    const aTue = makeSlot(2, "火", "19:00-20:20", "中3", { cls: "A", subj: "英語" });
    const classSets = [{ id: 10, label: "中3 英語", slotIds: [1, 2] }];
    const ctx = {
      classSets,
      allSlots: [sTue, aTue],
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
      sessionOverrides: [
        { id: 1, slotId: 1, date: "2026-04-07", mode: "set", value: 9, memo: "" },
      ],
    };
    expect(computeSessionNumber(sTue, "2026-04-07", ctx)).toBe(9);
    // A には波及しない (別 cohort = 別バケット)
    expect(computeSessionNumber(aTue, "2026-04-07", ctx)).toBe(1);
  });

  it("sessionOverrides 未指定時は既存挙動を維持する", () => {
    const tue = makeSlot(1, "火", "19:00-20:20", "中3");
    const ctx = {
      classSets: [],
      allSlots: [tue],
      displayCutoff: DISPLAY_CUTOFF,
      isOffForGrade: NEVER_OFF,
    };
    expect(computeSessionNumber(tue, "2026-04-14", ctx)).toBe(2);
  });
});

describe("computeSessionNumber - 期切替 (前期/後期) の時間割ゲート", () => {
  // 2026-09-01 は火曜日 (4/7 のちょうど 21 週後)
  const TIMETABLES = [
    { id: 1, name: "2026 前期", type: "regular", startDate: null, endDate: "2026-08-31", grades: [] },
    { id: 2, name: "2026 後期", type: "regular", startDate: "2026-09-01", endDate: null, grades: [] },
  ];
  // 前期: 中3 火 1 限 / 後期: 同じ授業が 18:00 開始へ前倒し
  const zenki = makeSlot(1, "火", "18:55-19:40", "中3", { timetableId: 1 });
  const kouki = makeSlot(101, "火", "18:00-18:45", "中3", { timetableId: 2 });
  const ctx = {
    classSets: [],
    allSlots: [zenki, kouki],
    displayCutoff: DISPLAY_CUTOFF, // 中3 startDate=2026-04-07
    timetables: TIMETABLES,
    isOffForGrade: NEVER_OFF,
  };

  it("後期スロットは時間割開始日から ① で数え直し", () => {
    expect(computeSessionNumber(kouki, "2026-09-01", ctx)).toBe(1);
    expect(computeSessionNumber(kouki, "2026-09-08", ctx)).toBe(2);
  });

  it("後期開始日より前の日付では 0", () => {
    expect(computeSessionNumber(kouki, "2026-08-25", ctx)).toBe(0);
  });

  it("前期スロットのカウントは従来通り (学年開始日起点)", () => {
    expect(computeSessionNumber(zenki, "2026-04-07", ctx)).toBe(1);
    expect(computeSessionNumber(zenki, "2026-04-14", ctx)).toBe(2);
  });

  it("前期・後期を同一授業セットに入れても後期は二重カウントしない", () => {
    const setCtx = {
      ...ctx,
      classSets: [{ id: 10, label: "中3 数学", slotIds: [1, 101] }],
    };
    // 後期 2 週目: 前期スロットは期間外なので後期分の 2 回のみ
    const map = buildSessionCountMap([kouki], "2026-09-08", setCtx);
    expect(map.get(101)).toBe(2);
    // 前期最終盤のカウントに後期スロットは混ざらない (8/25 は前期最後の火曜)
    expect(computeSessionNumber(zenki, "2026-08-25", setCtx)).toBe(21);
  });

  it("表示期間設定が無くても時間割開始日だけでカウントできる", () => {
    expect(
      computeSessionNumber(kouki, "2026-09-01", { ...ctx, displayCutoff: null })
    ).toBe(1);
  });

  it("ctx.timetables 未指定なら従来挙動 (ゲート無し)", () => {
    const legacy = { ...ctx, timetables: undefined };
    expect(computeSessionNumber(kouki, "2026-04-07", legacy)).toBe(1);
  });

  it("開講日オリエンの 1 限判定を後期の 18:00 コマが奪わない", () => {
    // 前期 1 限 18:55 と 2 限 19:50、後期 18:00 が同学年に並存。
    // ゲートが無いと開講日 (4/7) の最早時刻が後期の 18:00 になり
    // 前期 1 限がオリエン扱いされなくなる。
    const zenki2 = makeSlot(2, "火", "19:50-20:35", "中3", {
      timetableId: 1,
      subj: "英語",
    });
    const oriCtx = {
      ...ctx,
      allSlots: [zenki, zenki2, kouki],
      orientationOnFirstDay: true,
    };
    expect(computeSessionNumber(zenki, "2026-04-07", oriCtx)).toBe(0); // オリエン
    expect(computeSessionNumber(zenki2, "2026-04-07", oriCtx)).toBe(1);
  });
});

describe("getSlotCountStartDate", () => {
  const TIMETABLES = [
    { id: 1, name: "前期", type: "regular", startDate: null, endDate: "2026-08-31", grades: [] },
    { id: 2, name: "後期", type: "regular", startDate: "2026-09-01", endDate: null, grades: [] },
  ];

  it("学年開始日と時間割開始日の遅い方を返す", () => {
    const slot = makeSlot(1, "火", "18:00-18:45", "中3", { timetableId: 2 });
    expect(
      getSlotCountStartDate(slot, { displayCutoff: DISPLAY_CUTOFF, timetables: TIMETABLES })
    ).toBe("2026-09-01");
  });

  it("時間割に開始日が無ければ学年開始日", () => {
    const slot = makeSlot(1, "火", "18:55-19:40", "中3", { timetableId: 1 });
    expect(
      getSlotCountStartDate(slot, { displayCutoff: DISPLAY_CUTOFF, timetables: TIMETABLES })
    ).toBe("2026-04-07");
  });

  it("学年開始日が無ければ時間割開始日", () => {
    const slot = makeSlot(1, "火", "18:00-18:45", "中3", { timetableId: 2 });
    expect(
      getSlotCountStartDate(slot, { displayCutoff: null, timetables: TIMETABLES })
    ).toBe("2026-09-01");
  });

  it("どちらも無ければ null", () => {
    const slot = makeSlot(1, "火", "18:55-19:40", "中1", { timetableId: 1 });
    expect(getSlotCountStartDate(slot, { displayCutoff: null, timetables: TIMETABLES })).toBe(null);
    expect(getSlotCountStartDate(slot, { displayCutoff: DISPLAY_CUTOFF })).toBe(null);
  });
});

describe("computeSessionNumber - 特別時程 (daySchedules) の部分休講", () => {
  // 附中1 水曜 1限。2026-04-08 / 04-15 / 04-22 は水曜日
  const CUTOFF = {
    groups: [
      { label: "中1・2", grades: ["附中1"], startDate: "2026-04-08", date: null },
    ],
  };
  const slot = makeSlot(1, "水", "16:25-17:25", "附中1");
  const cutFirst = {
    id: 1,
    date: "2026-04-15",
    label: "附属 1限カット",
    targetGrades: ["附中1"],
    timeMap: [],
    cancelTimes: ["16:25-17:25"],
    memo: "",
  };
  const ctx = (daySchedules) => ({
    classSets: [],
    allSlots: [slot],
    displayCutoff: CUTOFF,
    isOffForGrade: NEVER_OFF,
    daySchedules,
  });

  it("cancelTimes の日は 0 (実施なし) でカウンタも進まない", () => {
    expect(computeSessionNumber(slot, "2026-04-08", ctx([cutFirst]))).toBe(1);
    expect(computeSessionNumber(slot, "2026-04-15", ctx([cutFirst]))).toBe(0);
    // 翌週は第2回 (カットした週をカウントしない)
    expect(computeSessionNumber(slot, "2026-04-22", ctx([cutFirst]))).toBe(2);
  });

  it("timeMap (時刻読み替えのみ) はカウントに影響しない", () => {
    const compress = {
      ...cutFirst,
      timeMap: [{ from: "16:25-17:25", to: "17:00-17:50" }],
      cancelTimes: [],
    };
    expect(computeSessionNumber(slot, "2026-04-15", ctx([compress]))).toBe(2);
    expect(computeSessionNumber(slot, "2026-04-22", ctx([compress]))).toBe(3);
  });

  it("対象外学年・別日には影響しない", () => {
    const other = { ...cutFirst, targetGrades: ["中3"] };
    expect(computeSessionNumber(slot, "2026-04-15", ctx([other]))).toBe(2);
  });
});

// ─── 中3 の 火木コース / 水金コース (2026-08-18 の症状) ──────────────
// 中学の既定の束ね (utils/cohorts) は「学年の平日ぜんぶで 1 コース」なので、
// 週内で 火木 / 水金 の 2 コースに分かれる学年は授業セットを登録しないと
// 水曜の第1回が火曜の続き (第2回) として数えられてしまう。
describe("computeSessionNumber - 中3 火水木金 のコース分け", () => {
  // 同じ cls・同じ教科が 火 と 水 の両方にある (中3 S クラスの社会)
  const tue = makeSlot(1, "火", "18:00-18:45", "中3", { subj: "社会", cls: "S" });
  const wed = makeSlot(2, "水", "18:00-18:45", "中3", { subj: "社会", cls: "S" });
  const thu = makeSlot(3, "木", "18:00-18:45", "中3", { subj: "社会", cls: "S" });
  const fri = makeSlot(4, "金", "18:00-18:45", "中3", { subj: "社会", cls: "S" });
  const allSlots = [tue, wed, thu, fri];
  const base = {
    allSlots,
    displayCutoff: DISPLAY_CUTOFF,
    isOffForGrade: NEVER_OFF,
  };

  it("セット未登録だと 平日 1 コース扱いで 水曜が ② になる (既定の束ね)", () => {
    const ctx = { ...base, classSets: [] };
    expect(computeSessionNumber(tue, "2026-04-07", ctx)).toBe(1);
    expect(computeSessionNumber(wed, "2026-04-08", ctx)).toBe(2);
    expect(computeSessionNumber(thu, "2026-04-09", ctx)).toBe(3);
    expect(computeSessionNumber(fri, "2026-04-10", ctx)).toBe(4);
  });

  it("火木 / 水金 の units セットを登録すると コースごとに ①② で数える", () => {
    const classSets = [
      {
        id: 1,
        label: "中3 (火・木)",
        units: [
          { grade: "中3", day: "火" },
          { grade: "中3", day: "木" },
        ],
      },
      {
        id: 2,
        label: "中3 (水・金)",
        units: [
          { grade: "中3", day: "水" },
          { grade: "中3", day: "金" },
        ],
      },
    ];
    const ctx = { ...base, classSets };
    expect(computeSessionNumber(tue, "2026-04-07", ctx)).toBe(1);
    expect(computeSessionNumber(wed, "2026-04-08", ctx)).toBe(1);
    expect(computeSessionNumber(thu, "2026-04-09", ctx)).toBe(2);
    expect(computeSessionNumber(fri, "2026-04-10", ctx)).toBe(2);
  });

  it("buildSessionCountMap でも同じ結果になる (画面の一括計算)", () => {
    const classSets = [
      {
        id: 1,
        label: "中3 (火・木)",
        units: [
          { grade: "中3", day: "火" },
          { grade: "中3", day: "木" },
        ],
      },
      {
        id: 2,
        label: "中3 (水・金)",
        units: [
          { grade: "中3", day: "水" },
          { grade: "中3", day: "金" },
        ],
      },
    ];
    const map = buildSessionCountMap([wed], "2026-04-08", { ...base, classSets });
    expect(map.get(wed.id)).toBe(1);
  });
});

// ─── units 形式のセットは期切替をまたいで効く ─────────────────────
describe("computeSessionNumber - units セットと期切替", () => {
  const TIMETABLES = [
    { id: 1, name: "1学期", startDate: "2026-04-07", endDate: "2026-04-15", grades: [] },
    { id: 2, name: "2学期", startDate: "2026-04-16", endDate: null, grades: [] },
  ];
  // 1学期 (火・木) と 2学期 (火・木) で別 id のコマ
  const t1Tue = makeSlot(1, "火", "18:00-18:45", "中3", { timetableId: 1 });
  const t1Thu = makeSlot(2, "木", "18:00-18:45", "中3", { timetableId: 1 });
  const t2Tue = makeSlot(11, "火", "18:00-18:45", "中3", { timetableId: 2 });
  const t2Thu = makeSlot(12, "木", "18:00-18:45", "中3", { timetableId: 2 });
  const classSets = [
    {
      id: 1,
      label: "中3 (火・木)",
      units: [
        { grade: "中3", day: "火" },
        { grade: "中3", day: "木" },
      ],
    },
  ];
  const ctx = {
    classSets,
    allSlots: [t1Tue, t1Thu, t2Tue, t2Thu],
    displayCutoff: DISPLAY_CUTOFF,
    timetables: TIMETABLES,
    isOffForGrade: NEVER_OFF,
  };

  it("新しい期のコマも同じセットで束ねられ、回数は 1 から数え直す", () => {
    // 1学期: 4/7(火)=① 4/9(木)=② 4/14(火)=③
    expect(computeSessionNumber(t1Tue, "2026-04-07", ctx)).toBe(1);
    expect(computeSessionNumber(t1Thu, "2026-04-09", ctx)).toBe(2);
    expect(computeSessionNumber(t1Tue, "2026-04-14", ctx)).toBe(3);
    // 2学期 (4/16 開始): 4/16(木)=① 4/21(火)=② — 旧期のコマは数えない
    expect(computeSessionNumber(t2Thu, "2026-04-16", ctx)).toBe(1);
    expect(computeSessionNumber(t2Tue, "2026-04-21", ctx)).toBe(2);
  });

  it("旧期のコマは切替日以降カウントされない (二重表示の防止)", () => {
    expect(computeSessionNumber(t1Tue, "2026-04-21", ctx)).toBe(0);
  });
});
