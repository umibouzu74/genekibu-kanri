import { describe, expect, it } from "vitest";
import {
  ADJ_ENTRY,
  adjustmentEntryHeading,
  adjustmentEntryLabel,
  adjustmentEntryLabelParts,
  collectMonthAdjustmentEntries,
  describeAdjustmentItem,
} from "./eventCalendarAdjustments";

const SLOTS = [
  { id: 1, day: "月", time: "19:40-21:00", grade: "中3", cls: "A", subj: "英語", teacher: "香川" },
  { id: 2, day: "月", time: "18:00-19:30", grade: "中3", cls: "B", subj: "数学", teacher: "福江" },
  { id: 3, day: "土", time: "10:00-11:30", grade: "高1", cls: "-", subj: "英語", teacher: "河野" },
];
const RS = (over) => ({ type: "reschedule", date: "2026-12-07", targetDate: "2026-12-04", ...over });

describe("collectMonthAdjustmentEntries", () => {
  const range = ["2026-12-01", "2026-12-31"];

  it("日まるごと振替は振替元と振替先の両方の日に、相手の日付ごとに 1 件", () => {
    const adjustments = [RS({ id: 1, slotId: 1 }), RS({ id: 2, slotId: 2 })];
    const { byDate, rows } = collectMonthAdjustmentEntries(adjustments, SLOTS, ...range);
    const out = byDate.get("2026-12-07");
    const inn = byDate.get("2026-12-04");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ direction: "out", fromDate: "2026-12-07", toDate: "2026-12-04" });
    // 出ていく側は時刻順
    expect(out[0].items.map((x) => x.slot.id)).toEqual([2, 1]);
    expect(inn).toHaveLength(1);
    expect(inn[0]).toMatchObject({ direction: "in", fromDate: "2026-12-07", toDate: "2026-12-04" });
    expect(adjustmentEntryLabel(out[0])).toBe("↻ 振替 2 コマ → 12/4");
    expect(adjustmentEntryLabel(inn[0])).toBe("↻ 振替 2 コマ ← 12/7");
    // 狭いセルで切らさない末尾 = 相手の日付
    expect(adjustmentEntryLabelParts(out[0])).toEqual(["↻ 振替 2 コマ", "→ 12/4"]);
    // 一覧は組で 1 行。並べる日付は振替元
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: ADJ_ENTRY.RESCHEDULE, date: "2026-12-07" });
    expect(adjustmentEntryHeading(rows[0])).toBe(
      "振替: 2026-12-07 (月) → 2026-12-04 (金) (2 コマ)"
    );
  });

  it("振替先の日付が違えば別の件になる", () => {
    const adjustments = [
      RS({ id: 1, slotId: 1, targetDate: "2026-12-04" }),
      RS({ id: 2, slotId: 2, targetDate: "2026-12-05" }),
    ];
    const { byDate, rows } = collectMonthAdjustmentEntries(adjustments, SLOTS, ...range);
    expect(byDate.get("2026-12-07").map((e) => e.toDate)).toEqual(["2026-12-04", "2026-12-05"]);
    expect(rows).toHaveLength(2);
  });

  it("相手の日が月の外なら、この月の側だけに出る (一覧は振替先の日付で並べる)", () => {
    const adjustments = [RS({ id: 1, slotId: 1, date: "2026-11-30", targetDate: "2026-12-02" })];
    const { byDate, rows } = collectMonthAdjustmentEntries(adjustments, SLOTS, ...range);
    expect([...byDate.keys()]).toEqual(["2026-12-02"]);
    expect(rows[0]).toMatchObject({ date: "2026-12-02", fromDate: "2026-11-30" });
  });

  it("コマ休講は日ごとに 1 件 (時刻順)。消えたコマを指す調整は数えない", () => {
    const adjustments = [
      { id: 5, type: "cancel", date: "2026-12-12", slotId: 1, memo: "行事" },
      { id: 6, type: "cancel", date: "2026-12-12", slotId: 2 },
      { id: 7, type: "cancel", date: "2026-12-12", slotId: 99 },
    ];
    const { byDate, rows } = collectMonthAdjustmentEntries(adjustments, SLOTS, ...range);
    const [entry] = byDate.get("2026-12-12");
    expect(entry.kind).toBe(ADJ_ENTRY.SLOT_CANCEL);
    expect(entry.items.map((x) => x.slot.id)).toEqual([2, 1]);
    expect(adjustmentEntryLabel(entry)).toBe("🚫 コマ休講 2");
    expect(adjustmentEntryLabelParts(entry)).toEqual(["🚫 コマ休講", "2"]);
    expect(adjustmentEntryHeading(entry)).toBe("コマ休講: 2026-12-12 (土) (2 コマ)");
    expect(rows).toHaveLength(1);
  });

  it("合同・移動や月の外の調整は拾わない", () => {
    const adjustments = [
      { id: 1, type: "combine", date: "2026-12-07", slotId: 1, combineSlotIds: [2] },
      { id: 2, type: "move", date: "2026-12-07", slotId: 1, targetTime: "20:00-21:20" },
      { id: 3, type: "cancel", date: "2027-01-09", slotId: 3 },
    ];
    const { byDate, rows } = collectMonthAdjustmentEntries(adjustments, SLOTS, ...range);
    expect(byDate.size).toBe(0);
    expect(rows).toEqual([]);
  });
});

describe("describeAdjustmentItem", () => {
  it("時刻・コマ・担当。振替は時刻か担当が変わるときだけ行き先を書く", () => {
    expect(describeAdjustmentItem({ slot: SLOTS[0], adj: RS({ slotId: 1 }) })).toBe(
      "19:40-21:00 中3A 英語 香川"
    );
    expect(
      describeAdjustmentItem({
        slot: SLOTS[0],
        adj: RS({ slotId: 1, targetTime: "20:00-21:20", targetTeacher: "福江" }),
      })
    ).toBe("19:40-21:00 中3A 英語 香川 → 20:00-21:20 (福江)");
    // 担当が元担当と同じなら書かない
    expect(
      describeAdjustmentItem({ slot: SLOTS[0], adj: RS({ slotId: 1, targetTeacher: "香川" }) })
    ).toBe("19:40-21:00 中3A 英語 香川");
  });

  it("クラスが「-」のコマはクラスを出さない。メモは末尾", () => {
    expect(
      describeAdjustmentItem({
        slot: SLOTS[2],
        adj: { type: "cancel", date: "2026-12-12", slotId: 3, memo: "模試" },
      })
    ).toBe("10:00-11:30 高1 英語 河野 — 模試");
  });
});
