import { describe, expect, it } from "vitest";
import {
  TIME_BULK_PRESETS,
  applyTimeBulkEdit,
  isWellFormedTimeRange,
  planTimeBulkEdit,
  slotMatchesFilter,
} from "./timeBulkEdit";

const makeSlot = (id, over = {}) => ({
  id,
  day: "火",
  time: "20:45-21:30",
  grade: "中3",
  cls: "S",
  room: "501",
  subj: "数学",
  teacher: "半田",
  note: "",
  timetableId: 2,
  ...over,
});

const FILTER = { timetableId: 2, grades: ["中3"], days: ["月", "火", "水", "木", "金"] };
const MAPPINGS = [
  { from: "20:45-21:30", to: "18:00-18:45" },
  { from: "21:35-21:50", to: "20:40-20:55" },
];

describe("isWellFormedTimeRange", () => {
  it("HH:MM-HH:MM 形式を受け付ける", () => {
    expect(isWellFormedTimeRange("18:00-18:45")).toBe(true);
    expect(isWellFormedTimeRange(" 9:00-10:30 ")).toBe(true);
  });

  it("範囲でない/壊れた文字列は弾く", () => {
    expect(isWellFormedTimeRange("18:00")).toBe(false);
    expect(isWellFormedTimeRange("18時-19時")).toBe(false);
    expect(isWellFormedTimeRange("")).toBe(false);
    expect(isWellFormedTimeRange(null)).toBe(false);
  });
});

describe("slotMatchesFilter", () => {
  it("timetableId は必須一致 (未設定コマはデフォルト id=1 扱い)", () => {
    expect(slotMatchesFilter(makeSlot(1), FILTER)).toBe(true);
    expect(slotMatchesFilter(makeSlot(1, { timetableId: 1 }), FILTER)).toBe(false);
    expect(
      slotMatchesFilter(makeSlot(1, { timetableId: undefined }), {
        ...FILTER,
        timetableId: 1,
      })
    ).toBe(true);
  });

  it("学年は完全一致 (中1-3 や 附中3 は 中3 指定に含まれない)", () => {
    expect(slotMatchesFilter(makeSlot(1, { grade: "中1-3" }), FILTER)).toBe(false);
    expect(slotMatchesFilter(makeSlot(1, { grade: "附中3" }), FILTER)).toBe(false);
  });

  it("空の grades / days は全対象", () => {
    const f = { timetableId: 2, grades: [], days: [] };
    expect(slotMatchesFilter(makeSlot(1, { grade: "高2", day: "土" }), f)).toBe(true);
  });

  it("days で曜日を絞れる (土曜は平日プリセットの対象外)", () => {
    expect(slotMatchesFilter(makeSlot(1, { day: "土" }), FILTER)).toBe(false);
  });
});

describe("planTimeBulkEdit", () => {
  it("合致コマの変換プランと mapping 別件数を返す", () => {
    const slots = [
      makeSlot(1), // 対象 (mapping 0)
      makeSlot(2, { day: "木", time: "21:35-21:50", subj: "確認テスト" }), // 対象 (mapping 1)
      makeSlot(3, { time: "18:55-19:40" }), // 時刻が合わない
      makeSlot(4, { grade: "中2" }), // 学年が合わない
      makeSlot(5, { timetableId: 1 }), // 別時間割
    ];
    const { changes, countsByMapping } = planTimeBulkEdit(slots, FILTER, MAPPINGS);
    expect(changes.map((c) => [c.slot.id, c.to])).toEqual([
      [1, "18:00-18:45"],
      [2, "20:40-20:55"],
    ]);
    expect(countsByMapping).toEqual([1, 1]);
  });

  it("from との照合は前後空白を無視した完全一致", () => {
    const slots = [makeSlot(1, { time: " 20:45-21:30 " })];
    const { changes } = planTimeBulkEdit(slots, FILTER, MAPPINGS);
    expect(changes).toHaveLength(1);
  });

  it("to が空 / from と同一の mapping は無視する", () => {
    const slots = [makeSlot(1)];
    const noop = [
      { from: "20:45-21:30", to: "" },
      { from: "20:45-21:30", to: "20:45-21:30" },
    ];
    const { changes, countsByMapping } = planTimeBulkEdit(slots, FILTER, noop);
    expect(changes).toHaveLength(0);
    expect(countsByMapping).toEqual([0, 0]);
  });

  it("同一 from が複数あれば先勝ち", () => {
    const slots = [makeSlot(1)];
    const dup = [
      { from: "20:45-21:30", to: "18:00-18:45" },
      { from: "20:45-21:30", to: "19:00-19:45" },
    ];
    const { changes, countsByMapping } = planTimeBulkEdit(slots, FILTER, dup);
    expect(changes[0].to).toBe("18:00-18:45");
    expect(countsByMapping).toEqual([1, 0]);
  });

  it("空入力に耐える", () => {
    expect(planTimeBulkEdit(null, FILTER, MAPPINGS).changes).toEqual([]);
    expect(planTimeBulkEdit([makeSlot(1)], FILTER, []).changes).toEqual([]);
  });
});

describe("applyTimeBulkEdit", () => {
  it("対象コマの time だけ差し替え、他コマは同一参照のまま", () => {
    const target = makeSlot(1);
    const untouched = makeSlot(3, { time: "18:55-19:40" });
    const { slots, changedCount } = applyTimeBulkEdit(
      [target, untouched],
      FILTER,
      MAPPINGS
    );
    expect(changedCount).toBe(1);
    expect(slots[0]).not.toBe(target);
    expect(slots[0].time).toBe("18:00-18:45");
    expect(slots[0].teacher).toBe(target.teacher);
    expect(slots[1]).toBe(untouched);
  });

  it("変更ゼロなら元の配列をそのまま返す", () => {
    const slots = [makeSlot(1, { time: "18:55-19:40" })];
    const result = applyTimeBulkEdit(slots, FILTER, MAPPINGS);
    expect(result.slots).toBe(slots);
    expect(result.changedCount).toBe(0);
  });
});

describe("TIME_BULK_PRESETS", () => {
  it("中3 平日前倒しプリセットが 2026 前期の中3 平日コマに合致する", () => {
    const preset = TIME_BULK_PRESETS[0];
    // 前期の中3 平日の代表的な構成 (複製後の後期時間割 id=2 を想定)
    const slots = [
      makeSlot(1, { time: "18:55-19:40" }),
      makeSlot(2, { time: "19:50-20:35" }),
      makeSlot(3, { time: "20:45-21:30" }),
      makeSlot(4, { time: "21:35-21:50", subj: "確認テスト" }),
      makeSlot(5, { day: "土", time: "20:45-21:30" }), // 土曜は対象外
    ];
    const filter = { timetableId: 2, grades: preset.grades, days: preset.days };
    const { changes } = planTimeBulkEdit(slots, filter, preset.mappings);
    expect(changes.map((c) => [c.slot.id, c.to])).toEqual([
      [3, "18:00-18:45"],
      [4, "20:40-20:55"],
    ]);
    // 1・2 限は後期でも同時刻のまま (2・3 限になるだけ) なので触らない
    expect(changes.some((c) => c.slot.id === 1 || c.slot.id === 2)).toBe(false);
  });

  it("プリセットの mappings は整形済み時刻", () => {
    for (const p of TIME_BULK_PRESETS) {
      for (const m of p.mappings) {
        expect(isWellFormedTimeRange(m.from)).toBe(true);
        expect(isWellFormedTimeRange(m.to)).toBe(true);
      }
    }
  });
});
