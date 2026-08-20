import { describe, expect, it } from "vitest";
import {
  canCombineSlots,
  findCombineCandidates,
  getAbsenceDaySlots,
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

  it("alias で両方が同じ科目 id に解決されるケースは合同可", () => {
    // "理科" と "理科特別" はどちらも "理" alias 経由で理科 (id:3) にマッチ
    // するため、canCombineSlots は true を返す (aliases の部分一致仕様)。
    const a = mk(1, { subj: "理科" });
    const b = mk(2, { subj: "理科特別" });
    expect(canCombineSlots(a, b, SUBJECTS)).toBe(true);
  });

  it("一方だけ subjects にマッチする場合は NG (未マッチ側が不明のため)", () => {
    // "理科" は理科 (id:3) にマッチ、"XYZ謎科目" は aliases にも無いため null
    const a = mk(1, { subj: "理科" });
    const b = mk(2, { subj: "XYZ謎科目" });
    expect(canCombineSlots(a, b, SUBJECTS)).toBe(false);
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

describe("getAbsenceDaySlots", () => {
  // 期切替後: 1学期 (〜9/14) と 2学期 (9/15〜) が両方残っている状態。
  const TIMETABLES = [
    { id: 1, name: "1学期", grades: [], startDate: "", endDate: "2026-09-14" },
    { id: 2, name: "2学期", grades: [], startDate: "2026-09-15", endDate: "" },
  ];
  const spring = mk(1, { day: "月", timetableId: 1, teacher: "滝澤" });
  const fall = mk(2, { day: "月", timetableId: 2, teacher: "滝澤" });
  const otherDay = mk(3, { day: "火", timetableId: 2 });
  const slots = [spring, fall, otherDay];

  it("同じ曜日でも期間外の時間割のコマは出さない (2 重表示の防止)", () => {
    const autumn = getAbsenceDaySlots(slots, "2026-09-21", "月", {
      timetables: TIMETABLES,
    });
    expect(autumn.map((s) => s.id)).toEqual([2]);

    const summer = getAbsenceDaySlots(slots, "2026-06-01", "月", {
      timetables: TIMETABLES,
    });
    expect(summer.map((s) => s.id)).toEqual([1]);
  });

  it("表示期間 (学年グループ / コース別終講日) の外も落とす", () => {
    const displayCutoff = {
      groups: [{ label: "中学部", grades: ["中3"], startDate: "2026-09-15", date: "2027-02-28" }],
      cohorts: [],
    };
    expect(
      getAbsenceDaySlots(slots, "2026-09-21", "月", {
        timetables: TIMETABLES,
        displayCutoff,
      }).map((s) => s.id)
    ).toEqual([2]);
    // 開始日より前 = 時間割は有効でもコマは出ない
    expect(
      getAbsenceDaySlots(slots, "2026-09-14", "月", {
        timetables: TIMETABLES,
        displayCutoff,
      })
    ).toEqual([]);
  });

  it("時間割が未設定なら曜日だけで絞る (単一時間割運用)", () => {
    expect(getAbsenceDaySlots(slots, "2026-09-21", "月", {}).map((s) => s.id)).toEqual([
      1, 2,
    ]);
  });

  it("date / dayName が無ければ空", () => {
    expect(getAbsenceDaySlots(slots, "", "月", {})).toEqual([]);
    expect(getAbsenceDaySlots(slots, "2026-09-21", null, {})).toEqual([]);
  });
});
