import { describe, expect, it } from "vitest";
import { buildAdjustmentIndex, describeSlot } from "./adjustmentDisplay";

describe("buildAdjustmentIndex", () => {
  const base = "2026-04-20";

  it("returns empty maps when adjustments is empty/null", () => {
    expect(buildAdjustmentIndex(null, base)).toEqual({
      combineAbsorbedBySlot: new Map(),
      combineHostBySlot: new Map(),
      moveBySlot: new Map(),
    });
    expect(buildAdjustmentIndex([], base)).toEqual({
      combineAbsorbedBySlot: new Map(),
      combineHostBySlot: new Map(),
      moveBySlot: new Map(),
    });
  });

  it("returns empty maps when date is falsy", () => {
    const adjustments = [{ id: 1, date: base, type: "move", slotId: 10, targetTime: "20:00-21:00" }];
    expect(buildAdjustmentIndex(adjustments, "")).toEqual({
      combineAbsorbedBySlot: new Map(),
      combineHostBySlot: new Map(),
      moveBySlot: new Map(),
    });
  });

  it("filters out adjustments of other dates", () => {
    const adjustments = [
      { id: 1, date: "2026-04-19", type: "move", slotId: 10, targetTime: "20:00-21:00" },
      { id: 2, date: base, type: "move", slotId: 11, targetTime: "21:00-22:00" },
    ];
    const r = buildAdjustmentIndex(adjustments, base);
    expect(r.moveBySlot.get(10)).toBeUndefined();
    expect(r.moveBySlot.get(11)).toBe("21:00-22:00");
  });

  it("indexes combine adjustments as both host and absorbed maps", () => {
    const adjustments = [
      { id: 1, date: base, type: "combine", slotId: 5, combineSlotIds: [6, 7] },
    ];
    const r = buildAdjustmentIndex(adjustments, base);
    expect(r.combineHostBySlot.get(5)).toEqual([6, 7]);
    expect(r.combineAbsorbedBySlot.get(6)).toBe(5);
    expect(r.combineAbsorbedBySlot.get(7)).toBe(5);
  });

  it("ignores combine adjustments with empty combineSlotIds", () => {
    const adjustments = [
      { id: 1, date: base, type: "combine", slotId: 5, combineSlotIds: [] },
    ];
    const r = buildAdjustmentIndex(adjustments, base);
    expect(r.combineHostBySlot.size).toBe(0);
    expect(r.combineAbsorbedBySlot.size).toBe(0);
  });

  it("ignores move adjustments without targetTime", () => {
    const adjustments = [{ id: 1, date: base, type: "move", slotId: 10 }];
    const r = buildAdjustmentIndex(adjustments, base);
    expect(r.moveBySlot.size).toBe(0);
  });

  it("handles a mix of combine and move entries on the same date", () => {
    const adjustments = [
      { id: 1, date: base, type: "combine", slotId: 5, combineSlotIds: [6] },
      { id: 2, date: base, type: "move", slotId: 7, targetTime: "21:00-22:00" },
      { id: 3, date: base, type: "combine", slotId: 8, combineSlotIds: [9, 10] },
    ];
    const r = buildAdjustmentIndex(adjustments, base);
    expect(r.combineHostBySlot.get(5)).toEqual([6]);
    expect(r.combineHostBySlot.get(8)).toEqual([9, 10]);
    expect(r.combineAbsorbedBySlot.get(6)).toBe(5);
    expect(r.combineAbsorbedBySlot.get(9)).toBe(8);
    expect(r.moveBySlot.get(7)).toBe("21:00-22:00");
  });
});

describe("describeSlot", () => {
  it("returns fallback when slot is null/undefined", () => {
    expect(describeSlot(null)).toBe("(不明コマ)");
    expect(describeSlot(undefined, "なし")).toBe("なし");
  });

  it("formats grade + cls + subj", () => {
    expect(describeSlot({ grade: "高1", cls: "A", subj: "数学" })).toBe("高1A 数学");
  });

  it("omits cls when it is '-' or empty", () => {
    expect(describeSlot({ grade: "中2", cls: "-", subj: "英語" })).toBe("中2 英語");
    expect(describeSlot({ grade: "中2", cls: "", subj: "英語" })).toBe("中2 英語");
  });
});
