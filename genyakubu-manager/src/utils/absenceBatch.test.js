import { describe, expect, it, vi } from "vitest";
import { saveAbsenceBatch } from "./absenceBatch";

const DATE = "2026-04-24";

describe("saveAbsenceBatch", () => {
  it("removes subs marked via removedSubIds and persists kept list", () => {
    const subs = [
      { id: 1, date: DATE, slotId: 10, substitute: "山田", status: "confirmed" },
      { id: 2, date: DATE, slotId: 11, substitute: "鈴木", status: "confirmed" },
    ];
    const saveSubs = vi.fn();
    const saveAdjustments = vi.fn();
    const saveSessionOverrides = vi.fn();

    const res = saveAbsenceBatch({
      subsList: subs,
      adjustmentsList: [],
      sessionOverridesList: [],
      removedSubIds: [1],
      saveSubs,
      saveAdjustments,
      saveSessionOverrides,
    });

    expect(saveSubs).toHaveBeenCalledTimes(1);
    expect(saveSubs.mock.calls[0][0]).toEqual([
      { id: 2, date: DATE, slotId: 11, substitute: "鈴木", status: "confirmed" },
    ]);
    expect(res.added.removedSubs).toBe(1);
    expect(res.added.subs).toBe(0);
  });

  it("persists a draft reschedule adjustment with new id and timestamp", () => {
    const adj = [
      { id: 1, date: "2026-04-10", type: "move", slotId: 5, targetTime: "20:00-21:00", memo: "" },
    ];
    const saveAdjustments = vi.fn();
    saveAbsenceBatch({
      subsList: [],
      adjustmentsList: adj,
      sessionOverridesList: [],
      draftAdjustments: [
        {
          date: DATE,
          type: "reschedule",
          slotId: 10,
          targetDate: "2026-05-01",
          targetTime: "19:00-20:20",
          memo: "",
        },
      ],
      saveSubs: vi.fn(),
      saveAdjustments,
      saveSessionOverrides: vi.fn(),
    });
    const saved = saveAdjustments.mock.calls[0][0];
    const added = saved.find((a) => a.type === "reschedule");
    expect(added).toBeDefined();
    expect(added.id).toBe(2); // nextId(adj) = 1 + 1
    expect(added.createdAt).toEqual(expect.any(String));
    expect(added.targetDate).toBe("2026-05-01");
  });

  it("does not call saveSubs when there is nothing to add or remove", () => {
    const saveSubs = vi.fn();
    saveAbsenceBatch({
      subsList: [{ id: 1, date: DATE, slotId: 10, substitute: "山田" }],
      adjustmentsList: [],
      sessionOverridesList: [],
      saveSubs,
      saveAdjustments: vi.fn(),
      saveSessionOverrides: vi.fn(),
    });
    expect(saveSubs).not.toHaveBeenCalled();
  });
});
