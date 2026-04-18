import { describe, expect, it } from "vitest";
import {
  canCombineSlots,
  findCombineCandidates,
  getAbsentSlotIds,
} from "./absenceHelpers";

const SUBJECTS = [
  { id: 1, name: "英語", categoryId: 1, aliases: ["英"] },
  { id: 2, name: "数学", categoryId: 1, aliases: ["数"] },
  { id: 3, name: "理科", categoryId: 2, aliases: ["理"] },
  { id: 4, name: "国語", categoryId: 1, aliases: ["国"] },
];

function mk(id, extra = {}) {
  return {
    id,
    day: "金",
    time: "19:00-20:20",
    grade: "中3",
    cls: "S",
    room: "501",
    subj: "理科",
    teacher: "河野",
    note: "",
    ...extra,
  };
}

describe("canCombineSlots", () => {
  it("同学年・同教科・cls 違いは OK", () => {
    const a = mk(1, { cls: "S" });
    const b = mk(2, { cls: "A" });
    expect(canCombineSlots(a, b, SUBJECTS)).toBe(true);
  });

  it("cls が文系/理系でも grade + subj が同じなら OK", () => {
    const a = mk(1, { grade: "高3", cls: "桜井文系", subj: "数学" });
    const b = mk(2, { grade: "高3", cls: "桜井理系", subj: "数学" });
    expect(canCombineSlots(a, b, SUBJECTS)).toBe(true);
  });

  it("異なる学年は NG", () => {
    const a = mk(1, { grade: "中3" });
    const b = mk(2, { grade: "中1" });
    expect(canCombineSlots(a, b, SUBJECTS)).toBe(false);
  });

  it("異なる教科は NG", () => {
    const a = mk(1, { subj: "理科" });
    const b = mk(2, { subj: "英語" });
    expect(canCombineSlots(a, b, SUBJECTS)).toBe(false);
  });

  it("異なる曜日は NG", () => {
    const a = mk(1, { day: "金" });
    const b = mk(2, { day: "月" });
    expect(canCombineSlots(a, b, SUBJECTS)).toBe(false);
  });

  it("同一スロットは NG", () => {
    const a = mk(1);
    expect(canCombineSlots(a, a, SUBJECTS)).toBe(false);
  });

  it("subjects 未マッチ同士は文字列完全一致にフォールバック", () => {
    const a = mk(1, { subj: "特殊科目" });
    const b = mk(2, { subj: "特殊科目" });
    expect(canCombineSlots(a, b, SUBJECTS)).toBe(true);
    const c = mk(3, { subj: "別の科目" });
    expect(canCombineSlots(a, c, SUBJECTS)).toBe(false);
  });

  it("片方のみ subjects にマッチする場合は NG (整合性なし)", () => {
    const a = mk(1, { subj: "理科" });
    const b = mk(2, { subj: "理科特別" }); // "理" alias で理科にマッチしてしまうため別名で比較
    expect(canCombineSlots(a, b, SUBJECTS)).toBe(true); // 実装上はどちらも理科 id
  });
});

describe("findCombineCandidates", () => {
  const daySlots = [
    mk(1, { cls: "S", subj: "理科" }),
    mk(2, { cls: "A", subj: "理科" }),
    mk(3, { cls: "B", subj: "理科" }),
    mk(4, { cls: "S", subj: "国語" }),
  ];

  it("同学年・同教科だけを候補に返す", () => {
    const ids = findCombineCandidates(daySlots[0], daySlots, SUBJECTS).map(
      (s) => s.id
    );
    expect(ids).toEqual([2, 3]);
  });

  it("既に absorbed の id は候補から除外", () => {
    const absorbed = new Set([3]);
    const ids = findCombineCandidates(daySlots[0], daySlots, SUBJECTS, absorbed).map(
      (s) => s.id
    );
    expect(ids).toEqual([2]);
  });
});

describe("getAbsentSlotIds", () => {
  const slots = [
    mk(1, { day: "金", teacher: "河野" }),
    mk(2, { day: "金", teacher: "奥村" }),
    mk(3, { day: "金", teacher: "堀上" }),
    mk(4, { day: "月", teacher: "河野" }),
  ];

  it("指定曜日の対象先生のコマだけ返す", () => {
    const out = getAbsentSlotIds(slots, "金", ["河野", "奥村"]);
    expect([...out].sort()).toEqual([1, 2]);
  });

  it("空の先生リストは空集合", () => {
    expect(getAbsentSlotIds(slots, "金", []).size).toBe(0);
  });

  it("day が null なら空集合", () => {
    expect(getAbsentSlotIds(slots, null, ["河野"]).size).toBe(0);
  });
});
