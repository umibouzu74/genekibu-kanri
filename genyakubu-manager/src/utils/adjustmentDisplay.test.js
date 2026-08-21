import { describe, expect, it } from "vitest";
import {
  buildAdjustmentIndex,
  collectOutgoingReschedules,
  describeRescheduleTarget,
  describeSlot,
  isDayEmptiedByReschedule,
  outgoingDayLabel,
} from "./adjustmentDisplay";

describe("buildAdjustmentIndex", () => {
  const base = "2026-04-20";

  const EMPTY_INDEX = {
    combineAbsorbedBySlot: new Map(),
    combineHostBySlot: new Map(),
    moveBySlot: new Map(),
    rescheduleOutBySlot: new Map(),
    rescheduleInBySlot: new Map(),
    dayScheduleMoveBySlot: new Map(),
  };

  it("returns empty maps when adjustments is empty/null", () => {
    expect(buildAdjustmentIndex(null, base)).toEqual(EMPTY_INDEX);
    expect(buildAdjustmentIndex([], base)).toEqual(EMPTY_INDEX);
  });

  it("returns empty maps when date is falsy", () => {
    const adjustments = [{ id: 1, date: base, type: "move", slotId: 10, targetTime: "20:00-21:00" }];
    expect(buildAdjustmentIndex(adjustments, "")).toEqual(EMPTY_INDEX);
  });

  // ─── 特別時程 (daySchedules) の合流 ───────────────────────────────
  describe("daySchedules merge", () => {
    // 2026-10-07 は水曜日
    const wed = "2026-10-07";
    const slots = [
      { id: 1, day: "水", time: "16:25-17:25", grade: "附中1", teacher: "武下" },
      { id: 2, day: "水", time: "21:00-21:30", grade: "附中", teacher: "松川" },
      { id: 3, day: "水", time: "16:25-17:25", grade: "中1", teacher: "他" },
      { id: 4, day: "金", time: "16:25-17:25", grade: "附中1", teacher: "武下" },
    ];
    const daySchedules = [
      {
        id: 1,
        date: wed,
        label: "附属 50分授業",
        targetGrades: ["附中1", "附中2", "附中3", "附中"],
        timeMap: [{ from: "16:25-17:25", to: "17:00-17:50" }],
        cancelTimes: [],
        memo: "",
      },
    ];

    it("対象学年・当日曜日のコマだけ moveBySlot に読み替えが載る", () => {
      const r = buildAdjustmentIndex([], wed, { slots, daySchedules });
      expect(r.moveBySlot.get(1)).toBe("17:00-17:50");
      expect(r.dayScheduleMoveBySlot.get(1)?.label).toBe("附属 50分授業");
      expect(r.moveBySlot.has(2)).toBe(false); // timeMap 外は据え置き
      expect(r.moveBySlot.has(3)).toBe(false); // 対象外学年
      expect(r.moveBySlot.has(4)).toBe(false); // 曜日不一致 (金)
    });

    it("個別の move 調整が同じコマにあればそちらが優先", () => {
      const adjustments = [
        { id: 9, date: wed, type: "move", slotId: 1, targetTime: "19:00-19:50" },
      ];
      const r = buildAdjustmentIndex(adjustments, wed, { slots, daySchedules });
      expect(r.moveBySlot.get(1)).toBe("19:00-19:50");
      expect(r.dayScheduleMoveBySlot.has(1)).toBe(false);
    });

    it("cancelTimes のコマには読み替えを作らない", () => {
      const cut = [
        { ...daySchedules[0], timeMap: [], cancelTimes: ["16:25-17:25"] },
      ];
      const r = buildAdjustmentIndex([], wed, { slots, daySchedules: cut });
      expect(r.moveBySlot.has(1)).toBe(false);
    });

    it("別日には効かない", () => {
      const r = buildAdjustmentIndex([], "2026-10-14", { slots, daySchedules });
      expect(r.moveBySlot.size).toBe(0);
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

  it("indexes reschedule adjustments by source (out) and target (in) dates", () => {
    const adjustments = [
      { id: 1, date: base, type: "reschedule", slotId: 20, targetDate: "2026-04-27", targetTime: "19:00-20:20" },
      { id: 2, date: "2026-04-13", type: "reschedule", slotId: 21, targetDate: base, targetTime: "20:30-21:50", targetTeacher: "本多" },
    ];
    const r = buildAdjustmentIndex(adjustments, base);
    // source date view: slot 20 is going out
    expect(r.rescheduleOutBySlot.get(20)?.targetDate).toBe("2026-04-27");
    // source date view: slot 21 is coming in from 2026-04-13
    expect(r.rescheduleInBySlot.get(21)?.targetDate).toBe(base);
    expect(r.rescheduleInBySlot.get(21)?.targetTeacher).toBe("本多");
    // reschedule entries should not affect move/combine indices
    expect(r.moveBySlot.size).toBe(0);
    expect(r.combineHostBySlot.size).toBe(0);
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

// ─── 振替元 (他日へ出ていくコマ) の表示 ─────────────────────────────
describe("振替元の表示ヘルパ", () => {
  const MON = "2026-12-07";
  const FRI = "2026-12-04";
  const mk = (id, time) => ({
    id,
    day: "月",
    time,
    grade: "中3",
    cls: "S",
    subj: "数学",
    teacher: "堀上",
  });
  const slots = [mk(1, "19:00-20:20"), mk(2, "17:30-18:50"), mk(3, "20:30-21:50")];
  const adj = (id, slotId, extra = {}) => ({
    id,
    date: MON,
    type: "reschedule",
    slotId,
    targetDate: FRI,
    ...extra,
  });

  const indexOf = (adjustments) =>
    buildAdjustmentIndex(adjustments, MON).rescheduleOutBySlot;

  it("出ていくコマを時刻順に集める", () => {
    const out = collectOutgoingReschedules(
      slots,
      indexOf([adj(11, 1), adj(12, 2)])
    );
    expect(out.map((o) => o.slot.id)).toEqual([2, 1]);
  });

  it("振替が無ければ空", () => {
    expect(collectOutgoingReschedules(slots, indexOf([]))).toEqual([]);
    expect(collectOutgoingReschedules([], indexOf([adj(11, 1)]))).toEqual([]);
  });

  it("全部出ていったら「振替で休み」の日", () => {
    const all = collectOutgoingReschedules(
      slots,
      indexOf([adj(11, 1), adj(12, 2), adj(13, 3)])
    );
    expect(isDayEmptiedByReschedule(slots, all)).toBe(true);
  });

  it("一部だけ残るなら休みではない", () => {
    const some = collectOutgoingReschedules(slots, indexOf([adj(11, 1)]));
    expect(isDayEmptiedByReschedule(slots, some)).toBe(false);
  });

  it("その日にやる他のコマ (振替で入る / 追加授業) が 1 つでもあれば休みではない", () => {
    const all = collectOutgoingReschedules(
      slots,
      indexOf([adj(11, 1), adj(12, 2), adj(13, 3)])
    );
    expect(isDayEmptiedByReschedule(slots, all, 1)).toBe(false);
  });

  it("元々コマの無い日は休みと言わない", () => {
    expect(isDayEmptiedByReschedule([], [])).toBe(false);
  });

  it("振替先の表記は日付 → 時刻 → 担当の順、short は月日だけ", () => {
    const a = adj(11, 1, { targetTime: "19:40-21:00", targetTeacher: "福江" });
    expect(describeRescheduleTarget(a)).toBe("2026-12-04 (金) 19:40-21:00 (福江)");
    expect(describeRescheduleTarget(a, { short: true })).toBe("12/4 19:40 (福江)");
    expect(describeRescheduleTarget(adj(12, 2))).toBe("2026-12-04 (金)");
    expect(describeRescheduleTarget({})).toBe("");
  });

  it("担当が変わらない振替では振替先の担当を出さない", () => {
    const a = adj(11, 1, { targetTime: "19:40-21:00", targetTeacher: "福江" });
    expect(describeRescheduleTarget(a, { originalTeacher: "福江" })).toBe(
      "2026-12-04 (金) 19:40-21:00"
    );
    expect(describeRescheduleTarget(a, { originalTeacher: "堀上" })).toBe(
      "2026-12-04 (金) 19:40-21:00 (福江)"
    );
  });

  it("見出しは行き先が 1 つならその日付、複数なら「他 N 日」", () => {
    const one = collectOutgoingReschedules(slots, indexOf([adj(11, 1), adj(12, 2)]));
    expect(outgoingDayLabel(one)).toBe(
      "この日の授業は 2 コマとも 2026-12-04 (金) へ振替済み"
    );
    const two = collectOutgoingReschedules(
      slots,
      indexOf([adj(11, 1), adj(12, 2, { targetDate: "2026-12-05" })])
    );
    expect(outgoingDayLabel(two)).toContain("他 1 日");
    expect(outgoingDayLabel([])).toBe("");
  });
});
