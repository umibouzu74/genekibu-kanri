// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAbsenceDraft } from "./useAbsenceDraft";

const SAMPLE_SLOTS = [
  {
    id: 10,
    day: "金",
    time: "19:00-20:20",
    grade: "高3",
    cls: "S",
    subj: "英語",
    teacher: "本多",
    note: "",
    room: "",
  },
  {
    id: 11,
    day: "金",
    time: "20:30-21:50",
    grade: "高3",
    cls: "S",
    subj: "数学",
    teacher: "藤田",
    note: "",
    room: "",
  },
];

const DATE = "2026-04-24";

describe("useAbsenceDraft", () => {
  describe("updateReschedule", () => {
    it("sets reschedule fields with defaults", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.updateReschedule(10, {
          targetDate: "2026-05-01",
          targetTime: "19:00-20:20",
        });
      });
      const row = result.current.draft[10];
      expect(row.reschedule.targetDate).toBe("2026-05-01");
      expect(row.reschedule.targetTime).toBe("19:00-20:20");
      expect(row.reschedule.targetTeacher).toBe("");
      expect(row.reschedule.memo).toBe("");
    });

    it("clears existing draft sub and move when reschedule is set (排他)", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.updateSub(10, { substitute: "山田", status: "confirmed" });
        result.current.updateMove(10, "20:30-21:50");
      });
      expect(result.current.draft[10].sub.substitute).toBe("山田");
      expect(result.current.draft[10].move.targetTime).toBe("20:30-21:50");

      act(() => {
        result.current.updateReschedule(10, { targetDate: "2026-05-01" });
      });
      expect(result.current.draft[10].sub).toBeNull();
      expect(result.current.draft[10].move).toBeNull();
      expect(result.current.draft[10].reschedule.targetDate).toBe("2026-05-01");
    });

    it("does NOT set reschedule on a slot already absorbed by a combine", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.setCombine(11, [10]); // 10 is absorbed by 11
      });
      expect(result.current.draft[10].absorbedBy).toBe(11);

      act(() => {
        result.current.updateReschedule(10, { targetDate: "2026-05-01" });
      });
      // No-op for absorbed slot
      expect(result.current.draft[10].reschedule).toBeNull();
    });

    it("does NOT set reschedule on a combine host", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.setCombine(11, [10]);
      });
      act(() => {
        result.current.updateReschedule(11, { targetDate: "2026-05-01" });
      });
      expect(result.current.draft[11].reschedule).toBeNull();
    });
  });

  describe("setCombine", () => {
    it("clears reschedule on absorbed slot when it was set first", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.updateReschedule(10, { targetDate: "2026-05-01" });
      });
      expect(result.current.draft[10].reschedule.targetDate).toBe("2026-05-01");

      act(() => {
        result.current.setCombine(11, [10]);
      });
      // Combine wins: reschedule is cleared on the absorbed slot
      expect(result.current.draft[10].reschedule).toBeNull();
      expect(result.current.draft[10].absorbedBy).toBe(11);
    });
  });

  describe("clearReschedule", () => {
    it("removes reschedule and cleans empty rows", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.updateReschedule(10, { targetDate: "2026-05-01" });
      });
      expect(result.current.draft[10]).toBeTruthy();
      act(() => {
        result.current.clearReschedule(10);
      });
      expect(result.current.draft[10]).toBeUndefined();
    });
  });

  describe("removedSubIds", () => {
    it("tracks marked sub ids and unmark restores them", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.markSubRemoved(99);
      });
      expect(result.current.removedSubIds.has(99)).toBe(true);
      act(() => {
        result.current.unmarkSubRemoved(99);
      });
      expect(result.current.removedSubIds.has(99)).toBe(false);
    });
  });

  describe("toBatchPayload", () => {
    it("emits a reschedule adjustment with optional fields", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.updateReschedule(10, {
          targetDate: "2026-05-01",
          targetTime: "19:00-20:20",
          targetTeacher: "藤田",
          memo: "本多の体調不良対応",
        });
      });
      const out = result.current.toBatchPayload(DATE, SAMPLE_SLOTS, []);
      expect(out.draftAdjustments).toHaveLength(1);
      expect(out.draftAdjustments[0]).toMatchObject({
        date: DATE,
        type: "reschedule",
        slotId: 10,
        targetDate: "2026-05-01",
        targetTime: "19:00-20:20",
        targetTeacher: "藤田",
        memo: "本多の体調不良対応",
      });
    });

    it("omits empty targetTime/targetTeacher fields", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.updateReschedule(10, { targetDate: "2026-05-01" });
      });
      const out = result.current.toBatchPayload(DATE, SAMPLE_SLOTS, []);
      expect(out.draftAdjustments[0]).not.toHaveProperty("targetTime");
      expect(out.draftAdjustments[0]).not.toHaveProperty("targetTeacher");
    });

    it("auto-marks existing reschedule for the same slot as removed", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      const existing = [
        {
          id: 7,
          date: DATE,
          type: "reschedule",
          slotId: 10,
          targetDate: "2026-04-30",
          memo: "",
        },
      ];
      act(() => {
        result.current.updateReschedule(10, { targetDate: "2026-05-01" });
      });
      const out = result.current.toBatchPayload(DATE, SAMPLE_SLOTS, existing);
      expect(out.removedAdjustmentIds).toContain(7);
    });

    it("drops reschedule output when slot is also a combine host (data-defense)", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      // Forcefully construct via setCombine then updateReschedule (which is a
      // no-op on host) — so we need to simulate the bad-state by calling
      // updateReschedule first and combine after, which clears reschedule on
      // absorbed but NOT on host. So set combine first, then reschedule
      // (no-op). This assertion proves the no-op path.
      act(() => {
        result.current.setCombine(11, [10]);
      });
      act(() => {
        result.current.updateReschedule(11, { targetDate: "2026-05-01" });
      });
      const out = result.current.toBatchPayload(DATE, SAMPLE_SLOTS, []);
      // Only the combine adjustment is emitted, no reschedule.
      expect(out.draftAdjustments.filter((a) => a.type === "reschedule")).toHaveLength(0);
      expect(out.draftAdjustments.filter((a) => a.type === "combine")).toHaveLength(1);
    });

    it("returns removedSubIds in payload", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.markSubRemoved(42);
      });
      const out = result.current.toBatchPayload(DATE, SAMPLE_SLOTS, []);
      expect(out.removedSubIds).toEqual([42]);
    });
  });

  describe("reset", () => {
    it("clears draft + removedAdjustmentIds + removedSubIds", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.updateReschedule(10, { targetDate: "2026-05-01" });
        result.current.markAdjustmentRemoved(1);
        result.current.markSubRemoved(2);
      });
      expect(Object.keys(result.current.draft)).toHaveLength(1);
      expect(result.current.removedAdjustmentIds.size).toBe(1);
      expect(result.current.removedSubIds.size).toBe(1);

      act(() => {
        result.current.reset();
      });
      expect(result.current.draft).toEqual({});
      expect(result.current.removedAdjustmentIds.size).toBe(0);
      expect(result.current.removedSubIds.size).toBe(0);
    });
  });
});
