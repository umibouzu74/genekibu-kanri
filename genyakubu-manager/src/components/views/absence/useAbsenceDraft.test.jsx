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
        result.current.updateSub(10, "本多", { substitute: "山田", status: "confirmed" });
        result.current.updateMove(10, "20:30-21:50");
      });
      expect(result.current.draft[10].subs["本多"].substitute).toBe("山田");
      expect(result.current.draft[10].move.targetTime).toBe("20:30-21:50");

      act(() => {
        result.current.updateReschedule(10, { targetDate: "2026-05-01" });
      });
      expect(result.current.draft[10].subs).toBeNull();
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

    it("代行者が未定 (欠勤だけ) の下書きもレコードとして出す", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.updateSub(10, "本多", { substitute: "", status: "requested" });
      });
      const out = result.current.toBatchPayload(DATE, SAMPLE_SLOTS, []);
      expect(out.draftSubs).toHaveLength(1);
      expect(out.draftSubs[0]).toMatchObject({
        date: DATE,
        slotId: 10,
        originalTeacher: "本多",
        substitute: "",
        status: "requested",
      });
    });

    it("同じコマ・同じ元講師の保存済み代行は解除マークに回す (二重登録防止)", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      const existingSubs = [
        {
          id: 42,
          date: DATE,
          slotId: 10,
          originalTeacher: "本多",
          substitute: "",
          status: "requested",
        },
      ];
      act(() => {
        result.current.updateSub(10, "本多", { substitute: "藤田", status: "confirmed" });
      });
      const out = result.current.toBatchPayload(DATE, SAMPLE_SLOTS, [], existingSubs);
      expect(out.draftSubs[0].substitute).toBe("藤田");
      expect(out.removedSubIds).toContain(42);
      // 付け替えであって「解除」ではない (保存メッセージで数えない)
      expect(out.replacedSubIds).toEqual([42]);
    });

    it("別の講師の代行レコードは解除しない (多担任コマ)", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      const existingSubs = [
        {
          id: 43,
          date: DATE,
          slotId: 10,
          originalTeacher: "香川",
          substitute: "",
          status: "requested",
        },
      ];
      act(() => {
        result.current.updateSub(10, "本多", { substitute: "藤田", status: "confirmed" });
      });
      const out = result.current.toBatchPayload(DATE, SAMPLE_SLOTS, [], existingSubs);
      expect(out.removedSubIds).not.toContain(43);
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

    it("records originalTeacher as slot.teacher when no biweekly context", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.updateSub(10, "本多", { substitute: "福江", status: "confirmed" });
      });
      const out = result.current.toBatchPayload(DATE, SAMPLE_SLOTS, []);
      expect(out.draftSubs[0].originalTeacher).toBe("本多");
    });

    it("元講師は下書きのキーをそのまま使う (隔週の A/B は登録側で解決済み)", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      // 中3S: teacher=堀上, partner=川井。B 週は登録側が川井を渡してくる。
      const biweeklySlots = [
        {
          id: 20,
          day: "月",
          time: "18:55-19:40",
          grade: "中3",
          cls: "S",
          subj: "英/数",
          teacher: "堀上",
          note: "隔週(川井)",
          room: "501",
        },
      ];
      act(() => {
        result.current.updateSub(20, "川井", { substitute: "福江", status: "confirmed" });
      });
      const out = result.current.toBatchPayload("2026-04-13", biweeklySlots, []);
      expect(out.draftSubs[0].originalTeacher).toBe("川井");
    });

    it("prefers an explicit per-slot originalTeacher (多担任 prep slot)", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      const prepSlots = [
        {
          id: 30,
          day: "土",
          time: "10:00-11:20",
          grade: "中3",
          cls: "-",
          subj: "プレップ",
          teacher: "香川·福江·川井",
          note: "",
          room: "",
        },
      ];
      act(() => {
        // 川井 の代行を福武に。香川は代行なしで欠勤 (残りの担当者で回す)。
        result.current.updateSub(30, "川井", {
          substitute: "福武",
          status: "confirmed",
        });
        result.current.updateSub(30, "香川", {
          substitute: "",
          status: "confirmed",
        });
      });
      const out = result.current.toBatchPayload("2026-07-11", prepSlots, []);
      // 1 コマに 2 件。slot.teacher 全体 ("香川·福江·川井") には潰さない。
      expect(out.draftSubs).toHaveLength(2);
      expect(
        out.draftSubs.map((r) => [r.originalTeacher, r.substitute, r.status]).sort()
      ).toEqual([
        ["川井", "福武", "confirmed"],
        ["香川", "", "confirmed"],
      ]);
      // 出勤する福江のレコードは作らない
      expect(out.draftSubs.some((r) => r.originalTeacher === "福江")).toBe(false);
    });

    it("同じコマの別の講師を消しても他の講師の欠勤は残る", () => {
      const { result } = renderHook(() => useAbsenceDraft());
      act(() => {
        result.current.updateSub(10, "香川", { substitute: "", status: "requested" });
        result.current.updateSub(10, "福江", { substitute: "", status: "requested" });
      });
      act(() => {
        result.current.clearSub(10, "香川");
      });
      expect(Object.keys(result.current.draft[10].subs)).toEqual(["福江"]);
      // 講師を指定しなければコマごと消える (合同・振替に切り替えたとき)
      act(() => {
        result.current.clearSub(10);
      });
      expect(result.current.draft[10]).toBeUndefined();
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
