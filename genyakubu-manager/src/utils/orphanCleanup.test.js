import { describe, expect, it } from "vitest";
import {
  analyzeOrphanAdjustments,
  applyOrphanCleanup,
  detectOrphans,
  findOrphanOverrides,
  findOrphanSubs,
} from "./orphanCleanup";

const makeSlots = (ids) => ids.map((id) => ({ id, day: "月", time: "16:00" }));

describe("findOrphanSubs", () => {
  it("returns subs whose slotId is not in the live set", () => {
    const slots = makeSlots([1, 2]);
    const subs = [
      { id: 10, slotId: 1, date: "2026-04-10" },
      { id: 11, slotId: 99, date: "2026-04-11" },
    ];
    expect(findOrphanSubs(subs, slots)).toEqual([
      { id: 11, slotId: 99, date: "2026-04-11" },
    ]);
  });

  it("returns empty array when all subs reference live slots", () => {
    expect(findOrphanSubs([{ id: 1, slotId: 1 }], makeSlots([1]))).toEqual([]);
  });

  it("handles null / empty inputs", () => {
    expect(findOrphanSubs(null, [])).toEqual([]);
    expect(findOrphanSubs([], null)).toEqual([]);
  });
});

describe("findOrphanOverrides", () => {
  it("returns overrides whose slotId is dead", () => {
    const slots = makeSlots([1]);
    const overrides = [
      { id: 1, slotId: 1, date: "2026-04-10", mode: "set", value: 3 },
      { id: 2, slotId: 99, date: "2026-04-10", mode: "skip" },
    ];
    expect(findOrphanOverrides(overrides, slots).map((o) => o.id)).toEqual([2]);
  });
});

describe("analyzeOrphanAdjustments", () => {
  it("classifies an adjustment whose host slot is dead as 'removed'", () => {
    const slots = makeSlots([1]);
    const adj = { id: 1, type: "move", slotId: 99, targetTime: "17:00" };
    expect(analyzeOrphanAdjustments([adj], slots).removed).toEqual([adj]);
  });

  it("trims combineSlotIds when only some absorbed slots are dead", () => {
    const slots = makeSlots([1, 2]);
    const adj = { id: 1, type: "combine", slotId: 1, combineSlotIds: [2, 99] };
    const result = analyzeOrphanAdjustments([adj], slots);
    expect(result.removed).toEqual([]);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].next.combineSlotIds).toEqual([2]);
    expect(result.updated[0].original).toBe(adj);
  });

  it("treats combine as removed when all absorbed slots are dead", () => {
    const slots = makeSlots([1]);
    const adj = { id: 1, type: "combine", slotId: 1, combineSlotIds: [99, 100] };
    const result = analyzeOrphanAdjustments([adj], slots);
    expect(result.removed).toHaveLength(1);
    expect(result.updated).toEqual([]);
  });

  it("ignores adjustments where nothing is dead", () => {
    const slots = makeSlots([1, 2, 3]);
    const adjs = [
      { id: 1, type: "combine", slotId: 1, combineSlotIds: [2, 3] },
      { id: 2, type: "move", slotId: 2, targetTime: "17:00" },
    ];
    const result = analyzeOrphanAdjustments(adjs, slots);
    expect(result.removed).toEqual([]);
    expect(result.updated).toEqual([]);
  });

  it("handles non-combine types only via the host check", () => {
    const slots = makeSlots([1]);
    // reschedule with dead source: removed
    const adj1 = { id: 1, type: "reschedule", slotId: 99, targetDate: "2026-05-01" };
    expect(analyzeOrphanAdjustments([adj1], slots).removed).toEqual([adj1]);
    // reschedule with live source and no targetSlotId: untouched
    const adj2 = { id: 2, type: "reschedule", slotId: 1, targetDate: "2026-05-01" };
    const result = analyzeOrphanAdjustments([adj2], slots);
    expect(result.removed).toEqual([]);
    expect(result.updated).toEqual([]);
  });

  it("strips reschedule.targetSlotId when the referenced slot is dead", () => {
    const slots = makeSlots([1]);
    const adj = {
      id: 1,
      type: "reschedule",
      slotId: 1,
      targetSlotId: 99,
      targetDate: "2026-05-01",
      targetTime: "19:00-20:20",
    };
    const result = analyzeOrphanAdjustments([adj], slots);
    expect(result.removed).toEqual([]);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].next).not.toHaveProperty("targetSlotId");
    // テキスト情報は残す
    expect(result.updated[0].next.targetDate).toBe("2026-05-01");
    expect(result.updated[0].next.targetTime).toBe("19:00-20:20");
  });

  it("strips move.targetSlotId when the referenced slot is dead", () => {
    const slots = makeSlots([1]);
    const adj = {
      id: 1,
      type: "move",
      slotId: 1,
      targetSlotId: 99,
      targetTime: "17:00-18:20",
    };
    const result = analyzeOrphanAdjustments([adj], slots);
    expect(result.removed).toEqual([]);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].next).not.toHaveProperty("targetSlotId");
    expect(result.updated[0].next.targetTime).toBe("17:00-18:20");
  });

  it("ignores reschedule/move when the target slot is still alive", () => {
    const slots = makeSlots([1, 2]);
    const adj = {
      id: 1,
      type: "reschedule",
      slotId: 1,
      targetSlotId: 2,
      targetDate: "2026-05-01",
    };
    const result = analyzeOrphanAdjustments([adj], slots);
    expect(result.removed).toEqual([]);
    expect(result.updated).toEqual([]);
  });
});

describe("detectOrphans", () => {
  it("aggregates totals across all kinds", () => {
    const slots = makeSlots([1]);
    const detection = detectOrphans({
      slots,
      subs: [
        { id: 1, slotId: 1 },
        { id: 2, slotId: 99 },
      ],
      adjustments: [
        { id: 1, type: "move", slotId: 99, targetTime: "17:00" },
        { id: 2, type: "combine", slotId: 1, combineSlotIds: [99] },
      ],
      sessionOverrides: [
        { id: 1, slotId: 99, date: "2026-04-10", mode: "skip" },
      ],
    });
    expect(detection.orphanSubs).toHaveLength(1);
    // adj #1 host dead → removed; adj #2 has all absorbed dead → also removed
    expect(detection.orphanAdjustments).toHaveLength(2);
    expect(detection.updatedAdjustments).toHaveLength(0);
    expect(detection.orphanOverrides).toHaveLength(1);
    expect(detection.total).toBe(4);
  });

  it("returns total: 0 when nothing is orphaned", () => {
    const detection = detectOrphans({
      slots: makeSlots([1]),
      subs: [],
      adjustments: [],
      sessionOverrides: [],
    });
    expect(detection.total).toBe(0);
  });
});

describe("applyOrphanCleanup", () => {
  it("removes orphan rows and updates partially-orphan combines", () => {
    const slots = makeSlots([1, 2]);
    const subs = [
      { id: 1, slotId: 1 },
      { id: 2, slotId: 99 },
    ];
    const adjustments = [
      { id: 1, type: "combine", slotId: 1, combineSlotIds: [2, 99] },
      { id: 2, type: "move", slotId: 99, targetTime: "17:00" },
    ];
    const sessionOverrides = [
      { id: 1, slotId: 1, date: "2026-04-10", mode: "set", value: 3 },
      { id: 2, slotId: 99, date: "2026-04-10", mode: "skip" },
    ];
    const detection = detectOrphans({ slots, subs, adjustments, sessionOverrides });
    const { nextSubs, nextAdjustments, nextOverrides } = applyOrphanCleanup({
      subs,
      adjustments,
      sessionOverrides,
      detection,
    });
    expect(nextSubs).toEqual([{ id: 1, slotId: 1 }]);
    expect(nextAdjustments).toHaveLength(1);
    expect(nextAdjustments[0].id).toBe(1);
    expect(nextAdjustments[0].combineSlotIds).toEqual([2]);
    expect(nextOverrides).toEqual([
      { id: 1, slotId: 1, date: "2026-04-10", mode: "set", value: 3 },
    ]);
  });

  it("is a no-op when nothing is orphaned", () => {
    const slots = makeSlots([1]);
    const subs = [{ id: 1, slotId: 1 }];
    const adjustments = [];
    const sessionOverrides = [];
    const detection = detectOrphans({ slots, subs, adjustments, sessionOverrides });
    const result = applyOrphanCleanup({
      subs,
      adjustments,
      sessionOverrides,
      detection,
    });
    expect(result.nextSubs).toEqual(subs);
    expect(result.nextAdjustments).toEqual(adjustments);
    expect(result.nextOverrides).toEqual(sessionOverrides);
  });

  it("reschedule の死んだ targetSlotId を抜いた状態で apply される", () => {
    const slots = makeSlots([1]);
    const adjustments = [
      {
        id: 1,
        type: "reschedule",
        slotId: 1,
        targetSlotId: 99,
        targetDate: "2026-05-01",
        targetTime: "19:00-20:20",
      },
    ];
    const detection = detectOrphans({
      slots,
      subs: [],
      adjustments,
      sessionOverrides: [],
    });
    const { nextAdjustments } = applyOrphanCleanup({
      subs: [],
      adjustments,
      sessionOverrides: [],
      detection,
    });
    expect(nextAdjustments).toHaveLength(1);
    expect(nextAdjustments[0]).not.toHaveProperty("targetSlotId");
    expect(nextAdjustments[0].targetDate).toBe("2026-05-01");
    expect(nextAdjustments[0].targetTime).toBe("19:00-20:20");
    expect(nextAdjustments[0].id).toBe(1);
  });

  it("move の死んだ targetSlotId を抜いた状態で apply される", () => {
    const slots = makeSlots([1]);
    const adjustments = [
      {
        id: 1,
        type: "move",
        slotId: 1,
        targetSlotId: 99,
        targetTime: "17:00-18:20",
      },
    ];
    const detection = detectOrphans({
      slots,
      subs: [],
      adjustments,
      sessionOverrides: [],
    });
    const { nextAdjustments } = applyOrphanCleanup({
      subs: [],
      adjustments,
      sessionOverrides: [],
      detection,
    });
    expect(nextAdjustments).toHaveLength(1);
    expect(nextAdjustments[0]).not.toHaveProperty("targetSlotId");
    expect(nextAdjustments[0].targetTime).toBe("17:00-18:20");
  });
});

describe("slotId の型正規化 (K2f)", () => {
  it("文字列 slotId でも生存スロットを孤立と誤検出しない", () => {
    const slots = [{ id: 1 }, { id: 2 }];
    const subs = [
      { id: 10, slotId: "1" }, // 文字列参照だが slot 1 は生存
      { id: 11, slotId: 99 }, // 本物の孤立
    ];
    const result = findOrphanSubs(subs, slots);
    expect(result.map((r) => r.id)).toEqual([11]);
  });

  it("combineSlotIds の文字列 id も同一視して部分更新できる", () => {
    const slots = [{ id: 1 }, { id: 2 }];
    const adjustments = [
      { id: 20, type: "combine", slotId: 1, combineSlotIds: ["2", 99] },
    ];
    const { updated, removed } = analyzeOrphanAdjustments(adjustments, slots);
    expect(removed).toHaveLength(0);
    expect(updated).toHaveLength(1);
    expect(updated[0].next.combineSlotIds).toEqual(["2"]);
  });
});

// ─── 旧形式 (slotIds) の授業セット / まとめて後始末 (2026-09-04) ──────────
import {
  analyzeOrphanClassSets,
  cascadeOrphansForSlots,
  describeOrphanDetection,
} from "./orphanCleanup";

describe("analyzeOrphanClassSets", () => {
  const live = [{ id: 1 }, { id: 2 }];

  it("units 形式は対象外", () => {
    const r = analyzeOrphanClassSets(
      [{ id: 1, label: "中3 火木", units: [{ grade: "中3", day: "火" }], slotIds: [99] }],
      live
    );
    expect(r.removed).toEqual([]);
    expect(r.updated).toEqual([]);
  });

  it("参照先が全部消えたセットは removed", () => {
    const set = { id: 1, label: "old", slotIds: [98, 99] };
    const r = analyzeOrphanClassSets([set], live);
    expect(r.removed).toEqual([set]);
  });

  it("一部だけ消えたセットは消えた id を抜いて updated", () => {
    const set = { id: 1, label: "old", slotIds: [1, 99] };
    const r = analyzeOrphanClassSets([set], live);
    expect(r.removed).toEqual([]);
    expect(r.updated).toEqual([{ original: set, next: { ...set, slotIds: [1] } }]);
  });

  it("文字列 slotId も同一視する", () => {
    const r = analyzeOrphanClassSets([{ id: 1, slotIds: ["1", "2"] }], live);
    expect(r.updated).toEqual([]);
    expect(r.removed).toEqual([]);
  });
});

describe("detectOrphans / applyOrphanCleanup with classSets", () => {
  it("classSets も total に数え、掃除後のリストを返す", () => {
    const slots = [{ id: 1 }];
    const classSets = [
      { id: 1, slotIds: [1] },
      { id: 2, slotIds: [1, 9] },
      { id: 3, slotIds: [9] },
      { id: 4, units: [{ grade: "中3", day: "火" }] },
    ];
    const detection = detectOrphans({ slots, subs: [], adjustments: [], sessionOverrides: [], classSets });
    expect(detection.orphanClassSets.map((s) => s.id)).toEqual([3]);
    expect(detection.updatedClassSets.map((u) => u.next.id)).toEqual([2]);
    expect(detection.total).toBe(2);
    const next = applyOrphanCleanup({ subs: [], adjustments: [], sessionOverrides: [], classSets, detection });
    expect(next.nextClassSets).toEqual([
      { id: 1, slotIds: [1] },
      { id: 2, slotIds: [1] },
      { id: 4, units: [{ grade: "中3", day: "火" }] },
    ]);
  });

  it("classSets を渡さない旧呼び出しでも壊れない", () => {
    const detection = detectOrphans({ slots: [{ id: 1 }], subs: [], adjustments: [], sessionOverrides: [] });
    expect(detection.total).toBe(0);
    const next = applyOrphanCleanup({ subs: [], adjustments: [], sessionOverrides: [], detection });
    expect(next.nextClassSets).toBeUndefined();
  });
});

describe("cascadeOrphansForSlots", () => {
  it("消えたコマに紐づくデータを一括で掃除し、変わったリストに changed を立てる", () => {
    const slots = [{ id: 1 }];
    const r = cascadeOrphansForSlots({
      slots,
      subs: [{ id: 1, slotId: 1 }, { id: 2, slotId: 7 }],
      adjustments: [{ id: 1, slotId: 1, type: "move" }],
      sessionOverrides: [{ id: 1, slotId: 7 }],
      classSets: [{ id: 1, slotIds: [7] }],
    });
    expect(r.detection.total).toBe(3);
    expect(r.changed).toEqual({ subs: true, adjustments: false, sessionOverrides: true, classSets: true });
    expect(r.nextSubs).toEqual([{ id: 1, slotId: 1 }]);
    expect(r.nextAdjustments).toEqual([{ id: 1, slotId: 1, type: "move" }]);
    expect(r.nextOverrides).toEqual([]);
    expect(r.nextClassSets).toEqual([]);
    expect(describeOrphanDetection(r.detection)).toBe("代行 1 件 / 回数補正 1 件 / 授業セット 1 件");
  });

  it("孤立が無ければ元のリストをそのまま返す", () => {
    const subs = [{ id: 1, slotId: 1 }];
    const r = cascadeOrphansForSlots({ slots: [{ id: 1 }], subs, adjustments: [], sessionOverrides: [], classSets: [] });
    expect(r.detection.total).toBe(0);
    expect(r.changed).toEqual({});
    expect(r.nextSubs).toBe(subs);
  });
});
