import { describe, expect, it } from "vitest";
import {
  buildCancelIndex,
  collectCancelledSlots,
  findCancelAdjustment,
  isSlotCancelledOnDate,
  slotCancelReason,
  slotsStartingBefore,
} from "./slotCancel";

// 2026-09-19 は土曜。
const SAT = "2026-09-19";

const mk = (id, time, extras = {}) => ({
  id,
  day: "土",
  time,
  grade: "中3",
  cls: "S",
  subj: "数学",
  teacher: "堀上",
  room: "",
  note: "",
  ...extras,
});

const SLOTS = [
  mk(1, "13:00-14:20"),
  mk(2, "14:30-15:20"),
  mk(3, "15:30-16:50"),
  mk(4, "17:00-18:20", { grade: "高1" }),
  mk(5, "3限", { grade: "高1" }), // 時刻の読めないコマ
];

const CANCEL = { id: 100, type: "cancel", date: SAT, slotId: 2, memo: "学校行事" };
const OTHER = { id: 101, type: "move", date: SAT, slotId: 3, targetTime: "17:00-18:20", memo: "" };

describe("findCancelAdjustment / isSlotCancelledOnDate", () => {
  it("同じ (日付, コマ) の cancel だけを拾う (他の種別・他の日は無視)", () => {
    const adjustments = [OTHER, CANCEL, { ...CANCEL, id: 102, date: "2026-09-26" }];
    expect(findCancelAdjustment(SLOTS[1], SAT, adjustments)).toBe(CANCEL);
    expect(findCancelAdjustment(SLOTS[2], SAT, adjustments)).toBeNull();
    expect(isSlotCancelledOnDate(SLOTS[1], SAT, { adjustments })).toBe(true);
    expect(isSlotCancelledOnDate(SLOTS[1], "2026-09-12", { adjustments })).toBe(false);
    expect(isSlotCancelledOnDate(SLOTS[2], SAT, { adjustments })).toBe(false);
  });

  it("索引 (Map) でも配列でも同じ答え", () => {
    const index = buildCancelIndex([OTHER, CANCEL]);
    expect(findCancelAdjustment(2, SAT, index)).toBe(CANCEL);
    expect(isSlotCancelledOnDate(SLOTS[1], SAT, { _cancelIndex: index })).toBe(true);
    expect(isSlotCancelledOnDate(SLOTS[0], SAT, { _cancelIndex: index })).toBe(false);
  });

  it("特別時程の部分休講も同じ入口で true になる", () => {
    const daySchedules = [
      { id: 1, date: SAT, targetGrades: ["中3"], timeMap: [], cancelTimes: ["13:00-14:20"] },
    ];
    expect(isSlotCancelledOnDate(SLOTS[0], SAT, { daySchedules, adjustments: [] })).toBe(true);
    expect(slotCancelReason(SLOTS[0], SAT, { daySchedules, adjustments: [] })).toMatchObject({
      kind: "daySchedule",
    });
    expect(slotCancelReason(SLOTS[1], SAT, { daySchedules, adjustments: [CANCEL] })).toEqual({
      kind: "cancel",
      adj: CANCEL,
    });
    expect(slotCancelReason(SLOTS[2], SAT, { daySchedules, adjustments: [CANCEL] })).toBeNull();
  });

  it("ctx が無くても落ちない", () => {
    expect(isSlotCancelledOnDate(SLOTS[0], SAT)).toBe(false);
    expect(isSlotCancelledOnDate(null, SAT, { adjustments: [CANCEL] })).toBe(false);
  });
});

describe("collectCancelledSlots", () => {
  it("その日の cancel をコマに引き当てて時刻順に返す (消えたコマは飛ばす)", () => {
    const adjustments = [
      { id: 1, type: "cancel", date: SAT, slotId: 3, memo: "" },
      { id: 2, type: "cancel", date: SAT, slotId: 1, memo: "" },
      { id: 3, type: "cancel", date: SAT, slotId: 999, memo: "" },
      { id: 4, type: "cancel", date: "2026-09-26", slotId: 2, memo: "" },
      OTHER,
    ];
    const out = collectCancelledSlots(SLOTS, SAT, adjustments);
    expect(out.map((x) => x.slot.id)).toEqual([1, 3]);
    expect(out[0].adj.id).toBe(2);
  });
});

describe("slotsStartingBefore", () => {
  it("開始時刻が指定より前のコマだけ (時刻の読めないコマは含めない)", () => {
    expect(slotsStartingBefore(SLOTS, "15:30").map((s) => s.id)).toEqual([1, 2]);
    expect(slotsStartingBefore(SLOTS, "13:00")).toEqual([]);
    expect(slotsStartingBefore(SLOTS, "")).toEqual([]);
    expect(slotsStartingBefore(SLOTS, "23:59").map((s) => s.id)).toEqual([1, 2, 3, 4]);
  });
});
