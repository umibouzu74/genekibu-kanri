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
});
