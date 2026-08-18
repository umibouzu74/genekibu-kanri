import { describe, expect, it } from "vitest";
import {
  buildClassSetIndex,
  expandClassSetSlotIds,
  isLegacySet,
  isUnitBasedSet,
  unitsFromSlotIds,
} from "./classSets";

function makeSlot(id, grade, day, extras = {}) {
  return {
    id,
    grade,
    day,
    time: "19:00-20:20",
    cls: "",
    room: "601",
    subj: "数学",
    teacher: "T",
    note: "",
    ...extras,
  };
}

const SLOTS = [
  makeSlot(1, "中3", "火"),
  makeSlot(2, "中3", "水"),
  makeSlot(3, "中3", "木"),
  makeSlot(4, "中3", "金"),
  makeSlot(5, "中1", "火"),
];

describe("形式の判定", () => {
  it("units があれば units 形式", () => {
    const cs = { id: 1, label: "中3 (火・木)", units: [{ grade: "中3", day: "火" }] };
    expect(isUnitBasedSet(cs)).toBe(true);
    expect(isLegacySet(cs)).toBe(false);
  });
  it("slotIds だけなら旧形式", () => {
    const cs = { id: 1, label: "旧", slotIds: [1, 3] };
    expect(isUnitBasedSet(cs)).toBe(false);
    expect(isLegacySet(cs)).toBe(true);
  });
  it("units が空配列なら units 形式ではない", () => {
    expect(isUnitBasedSet({ id: 1, label: "x", units: [] })).toBe(false);
  });
});

describe("expandClassSetSlotIds", () => {
  it("units 形式は (学年, 曜日) の全コマへ展開する", () => {
    const cs = {
      id: 1,
      label: "中3 (火・木)",
      units: [
        { grade: "中3", day: "火" },
        { grade: "中3", day: "木" },
      ],
    };
    expect(expandClassSetSlotIds(cs, SLOTS)).toEqual([1, 3]);
  });

  it("units 形式は後から増えたコマも自動的に含む (期切替で作り直したコマ)", () => {
    const cs = { id: 1, label: "中3 (火)", units: [{ grade: "中3", day: "火" }] };
    const withNewTerm = [...SLOTS, makeSlot(101, "中3", "火", { timetableId: 2 })];
    expect(expandClassSetSlotIds(cs, withNewTerm)).toEqual([1, 101]);
  });

  it("旧形式は slotIds をそのまま返す", () => {
    expect(expandClassSetSlotIds({ id: 1, label: "旧", slotIds: [2, 4] }, SLOTS)).toEqual([
      2, 4,
    ]);
  });
});

describe("unitsFromSlotIds", () => {
  it("コマ id から (学年, 曜日) を逆算する (旧形式の変換用)", () => {
    expect(unitsFromSlotIds([1, 3, 5], SLOTS)).toEqual([
      { grade: "中3", day: "火" },
      { grade: "中3", day: "木" },
      { grade: "中1", day: "火" },
    ]);
  });
  it("削除済みのコマ id は無視する", () => {
    expect(unitsFromSlotIds([999], SLOTS)).toEqual([]);
  });
});

describe("buildClassSetIndex", () => {
  it("slotId → 同セットのコマ一覧 を引ける", () => {
    const sets = [
      {
        id: 1,
        label: "中3 (火・木)",
        units: [
          { grade: "中3", day: "火" },
          { grade: "中3", day: "木" },
        ],
      },
      {
        id: 2,
        label: "中3 (水・金)",
        units: [
          { grade: "中3", day: "水" },
          { grade: "中3", day: "金" },
        ],
      },
    ];
    const idx = buildClassSetIndex(sets, SLOTS);
    expect(idx.get(1)).toEqual([1, 3]);
    expect(idx.get(3)).toEqual([1, 3]);
    expect(idx.get(2)).toEqual([2, 4]);
    expect(idx.get(5)).toBeUndefined();
  });

  it("同じコマが複数セットに載っている場合は先に定義されたセットを採る", () => {
    const sets = [
      { id: 1, label: "A", units: [{ grade: "中3", day: "火" }] },
      {
        id: 2,
        label: "B",
        units: [
          { grade: "中3", day: "火" },
          { grade: "中3", day: "水" },
        ],
      },
    ];
    expect(buildClassSetIndex(sets, SLOTS).get(1)).toEqual([1]);
  });
});
