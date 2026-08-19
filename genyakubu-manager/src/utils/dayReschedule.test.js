import { describe, expect, it } from "vitest";
import {
  applyDayReschedule,
  buildDayOccupancy,
  buildDayReschedulePlan,
  collectDayRescheduleCandidates,
  findDayRescheduleAdjustments,
} from "./dayReschedule";

// 2026-12-04 は金曜、2026-12-07 は月曜、2026-12-11 は金曜。
const MON = "2026-12-07";
const FRI = "2026-12-04";

const NEVER_OFF = () => false;

function makeSlot(id, day, time, extras = {}) {
  return {
    id,
    day,
    time,
    grade: "中3",
    cls: "S",
    room: "602",
    subj: "数学",
    teacher: "堀上",
    note: "",
    ...extras,
  };
}

function makeCtx(extras = {}) {
  return {
    allSlots: [],
    classSets: [],
    timetables: [],
    displayCutoff: { groups: [] },
    daySchedules: [],
    biweeklyAnchors: [],
    holidays: [],
    examPeriods: [],
    isOffForGrade: NEVER_OFF,
    ...extras,
  };
}

describe("collectDayRescheduleCandidates", () => {
  it("その日の曜日のコマだけを時刻順で返す", () => {
    const slots = [
      makeSlot(2, "月", "20:30-21:50"),
      makeSlot(1, "月", "19:00-20:20"),
      makeSlot(3, "金", "19:00-20:20"),
    ];
    const { candidates, skipped } = collectDayRescheduleCandidates({
      slots,
      dateStr: MON,
      ctx: makeCtx({ allSlots: slots }),
    });
    expect(candidates.map((s) => s.id)).toEqual([1, 2]);
    expect(skipped).toEqual([]);
  });

  it("休講のコマは理由つきで対象外にする", () => {
    const slots = [makeSlot(1, "月", "19:00-20:20"), makeSlot(2, "月", "20:30-21:50")];
    const ctx = makeCtx({
      allSlots: slots,
      isOffForGrade: (d, grade) => d === MON && grade === "中3",
    });
    const { candidates, skipped } = collectDayRescheduleCandidates({
      slots,
      dateStr: MON,
      ctx,
    });
    expect(candidates).toEqual([]);
    expect(skipped.map((x) => x.reason)).toEqual([
      "休講・テスト期間",
      "休講・テスト期間",
    ]);
  });

  it("時間割の有効期間外・表示期間外は理由を出し分ける", () => {
    const slots = [
      makeSlot(1, "月", "19:00-20:20", { timetableId: 1 }),
      makeSlot(2, "月", "20:30-21:50", { timetableId: 2, grade: "高3" }),
    ];
    const ctx = makeCtx({
      allSlots: slots,
      timetables: [
        // 1: 12/1 で終了済み / 2: 有効
        { id: 1, name: "前期", type: "regular", startDate: null, endDate: "2026-12-01", grades: [] },
        { id: 2, name: "後期", type: "regular", startDate: null, endDate: null, grades: [] },
      ],
      displayCutoff: {
        groups: [{ label: "高校部", grades: ["高3"], startDate: null, date: "2026-12-05" }],
      },
    });
    const { candidates, skipped } = collectDayRescheduleCandidates({
      slots,
      dateStr: MON,
      ctx,
    });
    expect(candidates).toEqual([]);
    expect(skipped.map((x) => [x.slot.id, x.reason])).toEqual([
      [1, "時間割の期間外"],
      [2, "表示期間外"],
    ]);
  });

  it("隔週コマの B 週 (実施なし) は対象外", () => {
    const slots = [
      makeSlot(1, "月", "19:00-20:20", {
        note: "隔週(河野)",
        // 12/7 は基準日 (A 週) の翌週 = B 週
        biweeklyAnchors: [{ date: "2026-11-30", weekType: "A" }],
      }),
    ];
    const { candidates, skipped } = collectDayRescheduleCandidates({
      slots,
      dateStr: MON,
      ctx: makeCtx({ allSlots: slots }),
    });
    expect(candidates).toEqual([]);
    expect(skipped[0].reason).toBe("実施なし (隔週など)");
  });
});

describe("buildDayOccupancy", () => {
  it("振替で入ってくるコマも塞がり扱いにする", () => {
    const slots = [
      makeSlot(1, "金", "19:00-20:20", { teacher: "河野" }),
      makeSlot(2, "月", "19:00-20:20", { teacher: "堀上" }),
    ];
    const adjustments = [
      { id: 1, date: MON, type: "reschedule", slotId: 2, targetDate: FRI },
    ];
    const occ = buildDayOccupancy({
      slots,
      dateStr: FRI,
      adjustments,
      ctx: makeCtx({ allSlots: slots }),
    });
    expect(occ.map((o) => [o.slot.id, o.incoming])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it("他日へ出ていくコマ・合同に吸収されたコマは塞がり扱いにしない", () => {
    const slots = [
      makeSlot(1, "金", "19:00-20:20"),
      makeSlot(2, "金", "19:00-20:20", { cls: "A" }),
      makeSlot(3, "金", "20:30-21:50"),
    ];
    const adjustments = [
      { id: 1, date: FRI, type: "combine", slotId: 1, combineSlotIds: [2] },
      { id: 2, date: FRI, type: "reschedule", slotId: 3, targetDate: MON },
    ];
    const occ = buildDayOccupancy({
      slots,
      dateStr: FRI,
      adjustments,
      ctx: makeCtx({ allSlots: slots }),
    });
    expect(occ.map((o) => o.slot.id)).toEqual([1]);
  });
});

describe("buildDayReschedulePlan", () => {
  const slots = [
    makeSlot(1, "月", "19:00-20:20", { teacher: "堀上" }),
    makeSlot(2, "月", "20:30-21:50", { teacher: "河野", room: "603" }),
  ];

  it("その日のコマを全部まとめて振り替えるプランを作る", () => {
    const plan = buildDayReschedulePlan({
      slots,
      sourceDate: MON,
      targetDate: FRI,
      ctx: makeCtx({ allSlots: slots }),
    });
    expect(plan.errors).toEqual([]);
    expect(plan.sourceDay).toBe("月");
    expect(plan.targetDay).toBe("金");
    expect(plan.entries.map((e) => e.slot.id)).toEqual([1, 2]);
    expect(plan.entries.every((e) => e.conflicts.length === 0)).toBe(true);
    // 前倒しの振替であることは注意書きに出す (エラーにはしない)
    expect(plan.notes.some((n) => n.includes("前倒し"))).toBe(true);
  });

  it("選択したコマだけを対象にできる", () => {
    const plan = buildDayReschedulePlan({
      slots,
      sourceDate: MON,
      targetDate: FRI,
      selectedSlotIds: [2],
      ctx: makeCtx({ allSlots: slots }),
    });
    expect(plan.entries.map((e) => e.slot.id)).toEqual([2]);
    expect(plan.candidates).toHaveLength(2);
  });

  it("振替先の同時刻に同じ講師がいると重なりとして出す", () => {
    const all = [...slots, makeSlot(3, "金", "19:00-19:45", { teacher: "堀上", room: "701" })];
    const plan = buildDayReschedulePlan({
      slots: all,
      sourceDate: MON,
      targetDate: FRI,
      ctx: makeCtx({ allSlots: all }),
    });
    const first = plan.entries.find((e) => e.slot.id === 1);
    expect(first.conflicts).toHaveLength(1);
    expect(first.conflicts[0].kind).toBe("teacher");
    expect(first.conflicts[0].label).toContain("堀上");
    expect(plan.notes.some((n) => n.includes("重なり"))).toBe(true);
  });

  it("時間が重ならなければ同じ講師でも重なりにしない", () => {
    const all = [...slots, makeSlot(3, "金", "17:00-18:20", { teacher: "堀上" })];
    const plan = buildDayReschedulePlan({
      slots: all,
      sourceDate: MON,
      targetDate: FRI,
      ctx: makeCtx({ allSlots: all }),
    });
    expect(plan.entries.every((e) => e.conflicts.length === 0)).toBe(true);
  });

  it("同じ教室が重なると教室の重なりとして出す", () => {
    const all = [...slots, makeSlot(3, "金", "19:00-20:20", { teacher: "藤田", room: "602" })];
    const plan = buildDayReschedulePlan({
      slots: all,
      sourceDate: MON,
      targetDate: FRI,
      ctx: makeCtx({ allSlots: all }),
    });
    const first = plan.entries.find((e) => e.slot.id === 1);
    expect(first.conflicts.map((c) => c.kind)).toEqual(["room"]);
  });

  it("同じ日付・空の対象はエラーにする", () => {
    const same = buildDayReschedulePlan({
      slots,
      sourceDate: MON,
      targetDate: MON,
      ctx: makeCtx({ allSlots: slots }),
    });
    expect(same.errors).toContain("振替元と振替先が同じ日です");

    const none = buildDayReschedulePlan({
      slots,
      sourceDate: MON,
      targetDate: FRI,
      selectedSlotIds: [],
      ctx: makeCtx({ allSlots: slots }),
    });
    expect(none.errors).toContain("振替するコマを 1 つ以上選んでください");

    const noSlots = buildDayReschedulePlan({
      slots: [],
      sourceDate: MON,
      targetDate: FRI,
      ctx: makeCtx(),
    });
    expect(noSlots.errors).toContain("振替元日に実施されるコマがありません");
  });

  it("同じ曜日の別の週へ振り替えると通常授業との重なりを出す", () => {
    // 12/7 (月) → 12/14 (月)。振替先にも同じコマの通常授業があるので二重になる。
    const plan = buildDayReschedulePlan({
      slots,
      sourceDate: MON,
      targetDate: "2026-12-14",
      ctx: makeCtx({ allSlots: slots }),
    });
    expect(plan.entries.every((e) => e.conflicts.length > 0)).toBe(true);
    expect(plan.entries[0].conflicts.map((c) => c.kind)).toEqual([
      "teacher",
      "room",
    ]);
  });

  it("同じ振替元日からの登録済み振替は自分自身なので重なりにしない", () => {
    const adjustments = [
      { id: 1, date: MON, type: "reschedule", slotId: 1, targetDate: FRI },
      { id: 2, date: MON, type: "reschedule", slotId: 2, targetDate: FRI },
    ];
    const plan = buildDayReschedulePlan({
      slots,
      adjustments,
      sourceDate: MON,
      targetDate: FRI,
      ctx: makeCtx({ allSlots: slots }),
    });
    expect(plan.entries.every((e) => e.conflicts.length === 0)).toBe(true);
    expect(plan.entries.every((e) => e.existing)).toBe(true);
  });

  it("選ばなかったコマの既存の振替は振替先の埋まりとして数える", () => {
    // slot 2 は前に 12/4 へ振替済み。今回は slot 1 だけを 12/4 へ移す。
    const all = [
      makeSlot(1, "月", "19:00-20:20", { teacher: "堀上" }),
      makeSlot(2, "月", "19:00-20:20", { teacher: "堀上", cls: "A", room: "701" }),
    ];
    const adjustments = [
      { id: 1, date: MON, type: "reschedule", slotId: 2, targetDate: FRI },
    ];
    const plan = buildDayReschedulePlan({
      slots: all,
      adjustments,
      sourceDate: MON,
      targetDate: FRI,
      selectedSlotIds: [1],
      ctx: makeCtx({ allSlots: all }),
    });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].conflicts.map((c) => c.kind)).toEqual(["teacher"]);
  });

  it("登録済みの振替は上書き対象として拾う", () => {
    const adjustments = [
      { id: 7, date: MON, type: "reschedule", slotId: 1, targetDate: "2026-12-11" },
    ];
    const plan = buildDayReschedulePlan({
      slots,
      adjustments,
      sourceDate: MON,
      targetDate: FRI,
      ctx: makeCtx({ allSlots: slots }),
    });
    expect(plan.entries.find((e) => e.slot.id === 1).existing.id).toBe(7);
    expect(plan.notes.some((n) => n.includes("上書き"))).toBe(true);
  });
});

describe("applyDayReschedule", () => {
  const slots = [
    makeSlot(1, "月", "19:00-20:20"),
    makeSlot(2, "月", "20:30-21:50", { teacher: "河野" }),
  ];

  it("選択コマぶんの reschedule を採番して追加する", () => {
    const plan = buildDayReschedulePlan({
      slots,
      sourceDate: MON,
      targetDate: FRI,
      ctx: makeCtx({ allSlots: slots }),
    });
    const { next, added, replaced } = applyDayReschedule({
      adjustments: [{ id: 4, date: MON, type: "move", slotId: 9, targetTime: "19:00-20:20" }],
      plan,
      sourceDate: MON,
      targetDate: FRI,
      memo: "12/7 → 12/4",
    });
    expect(added).toBe(2);
    expect(replaced).toBe(0);
    expect(next).toHaveLength(3);
    const created = next.filter((a) => a.type === "reschedule");
    expect(created.map((a) => a.id)).toEqual([5, 6]);
    expect(created.every((a) => a.date === MON && a.targetDate === FRI)).toBe(true);
    expect(created.every((a) => a.memo === "12/7 → 12/4")).toBe(true);
    expect(created.every((a) => typeof a.createdAt === "string")).toBe(true);
  });

  it("同じコマの既存の振替は置き換える (二重登録しない)", () => {
    const adjustments = [
      { id: 1, date: MON, type: "reschedule", slotId: 1, targetDate: "2026-12-11" },
    ];
    const plan = buildDayReschedulePlan({
      slots,
      adjustments,
      sourceDate: MON,
      targetDate: FRI,
      ctx: makeCtx({ allSlots: slots }),
    });
    const { next, added, replaced } = applyDayReschedule({
      adjustments,
      plan,
      sourceDate: MON,
      targetDate: FRI,
    });
    expect(added).toBe(2);
    expect(replaced).toBe(1);
    expect(next).toHaveLength(2);
    expect(next.every((a) => a.targetDate === FRI)).toBe(true);
    // memo 未指定のときは載せない
    expect(next.every((a) => a.memo === undefined)).toBe(true);
  });
});

describe("findDayRescheduleAdjustments", () => {
  const adjustments = [
    { id: 1, date: MON, type: "reschedule", slotId: 1, targetDate: FRI },
    { id: 2, date: MON, type: "reschedule", slotId: 2, targetDate: "2026-12-11" },
    { id: 3, date: MON, type: "move", slotId: 3, targetTime: "19:00-20:20" },
    { id: 4, date: "2026-12-14", type: "reschedule", slotId: 4, targetDate: FRI },
  ];

  it("振替元日で引く", () => {
    expect(findDayRescheduleAdjustments(adjustments, MON).map((a) => a.id)).toEqual([1, 2]);
  });

  it("振替先まで指定して引く", () => {
    expect(
      findDayRescheduleAdjustments(adjustments, MON, FRI).map((a) => a.id)
    ).toEqual([1]);
  });

  it("日付なしは空", () => {
    expect(findDayRescheduleAdjustments(adjustments, "")).toEqual([]);
  });
});
