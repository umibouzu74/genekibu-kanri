// 同じ内容のコマ (重複) の検出 (2026-11-19、P1-2)。
import { describe, expect, it } from "vitest";
import {
  countDuplicatesInTarget,
  defaultKeepSlotId,
  findDuplicateSlotGroups,
  slotContentKey,
  slotIdsToRemove,
} from "./duplicateSlots";
import { countSlotReferences } from "./orphanCleanup";

const mk = (id, o = {}) => ({
  id,
  day: "水",
  time: "19:50-20:35",
  grade: "中3",
  cls: "B",
  room: "502",
  subj: "数学",
  teacher: "福武",
  note: "",
  ...o,
});

describe("slotContentKey", () => {
  it("id を除いて比べ、timetableId 無しは 1、講師の「・」と時刻のゼロ埋めをそろえる", () => {
    expect(slotContentKey(mk(1))).toBe(slotContentKey(mk(283, { timetableId: 1 })));
    expect(slotContentKey(mk(1, { teacher: "香川·福江" }))).toBe(
      slotContentKey(mk(2, { teacher: "香川・福江" }))
    );
    expect(slotContentKey(mk(1, { time: "9:30-10:50" }))).toBe(
      slotContentKey(mk(2, { time: "09:30-10:50" }))
    );
  });

  it("時間割を上書きできる (移す先での一致を見る)", () => {
    expect(slotContentKey(mk(1, { timetableId: 2 }), 1)).toBe(slotContentKey(mk(9)));
  });
});

describe("findDuplicateSlotGroups", () => {
  it("同じ時間割の同じ内容のコマを組にする (実データの形: 1〜282 と 283〜508)", () => {
    const slots = [mk(1), mk(283, { timetableId: 1 }), mk(2, { day: "木" }), mk(3, { timetableId: 3 })];
    const groups = findDuplicateSlotGroups(slots);
    expect(groups).toHaveLength(1);
    expect(groups[0].timetableId).toBe(1);
    expect(groups[0].slots.map((s) => s.id)).toEqual([1, 283]);
  });

  it("別の時間割の同じコマは重複にしない (期切替で残した前の期)", () => {
    expect(findDuplicateSlotGroups([mk(1), mk(2, { timetableId: 3 })])).toEqual([]);
  });

  it("隔週の相手・担当の切り替え・曜日・時刻・教室が違うものは別のコマ", () => {
    const base = mk(1, { note: "隔週(河野)" });
    const cases = [
      mk(2, { note: "隔週(堀上)" }),
      mk(3, { note: "隔週(河野)", teacherChanges: [{ from: "2026-10-27", teacher: "福江" }] }),
      mk(4, { note: "隔週(河野)", time: "18:55-19:40" }),
      mk(5, { note: "隔週(河野)", room: "503" }),
    ];
    expect(findDuplicateSlotGroups([base, ...cases])).toEqual([]);
  });

  it("担当の切り替えが同じなら重複", () => {
    const changes = [{ from: "2026-10-27", teacher: "福江" }];
    const groups = findDuplicateSlotGroups([
      mk(1, { teacherChanges: changes }),
      mk(2, { teacherChanges: [{ from: "2026-10-27", teacher: "福江", memo: "" }] }),
    ]);
    expect(groups).toHaveLength(1);
  });
});

describe("countDuplicatesInTarget", () => {
  it("移す先に同じ内容のコマがある数", () => {
    const slots = [mk(1), mk(2, { day: "金" }), mk(10, { timetableId: 2 }), mk(11, { timetableId: 2, day: "土" })];
    const moving = slots.filter((s) => s.timetableId === 2);
    expect(countDuplicatesInTarget(moving, slots, 1)).toBe(1);
  });
});

describe("残すコマの既定と消すコマ", () => {
  const group = { key: "k", slots: [mk(1), mk(283)] };
  const refs = countSlotReferences({
    subs: [{ id: 1, slotId: 283, date: "2026-06-10" }],
    adjustments: [{ id: 1, type: "combine", slotId: 5, combineSlotIds: [283] }],
    sessionOverrides: [],
    classSets: [{ id: 1, slotIds: [1] }, { id: 2, units: [{ grade: "中3", day: "水" }], slotIds: [1] }],
    holidays: [{ id: 1, date: "2026-06-10", excludeSlotIds: [283] }],
  });

  it("countSlotReferences: 代行・調整 (合同の相手も)・旧式の授業セット・休講日の例外を数える", () => {
    expect(refs.get("283")).toBe(3);
    expect(refs.get("1")).toBe(1); // units 形式のセットは数えない
    expect(refs.get("5")).toBe(1);
  });

  it("既定は参照の多い方、決め方を選べる", () => {
    expect(defaultKeepSlotId(group, refs)).toBe(283);
    expect(defaultKeepSlotId(group, new Map())).toBe(1);
    expect(defaultKeepSlotId(group, refs, "lowest")).toBe(1);
    expect(defaultKeepSlotId(group, refs, "highest")).toBe(283);
  });

  it("slotIdsToRemove: 残すコマ以外を並べる", () => {
    const g3 = { key: "k3", slots: [mk(7), mk(8), mk(9)] };
    expect(slotIdsToRemove([group, g3], new Map([["k", 283], ["k3", 8]]))).toEqual([1, 7, 9]);
  });
});
