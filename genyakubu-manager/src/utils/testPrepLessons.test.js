import { describe, expect, it } from "vitest";
import {
  applyTestPrepExtra,
  applyTestPrepReschedule,
  buildTestPrepExtraPlan,
  buildTestPrepReschedulePlan,
  collectCourseChanges,
  collectRoomNames,
  courseKeyOf,
  listCourseGrades,
  listCourseSchools,
  listCourseSlots,
  matchesCourseQuery,
  roomUsageAt,
  schoolOfSubj,
  suggestTimes,
  upcomingHeldDates,
} from "./testPrepLessons";
import { buildDayOccupancy } from "./dayReschedule";

// 2026-10-14 は水曜、10-15 は木曜、10-21 は水曜。
const WED = "2026-10-14";
const THU = "2026-10-15";
const NEXT_WED = "2026-10-21";

function makeSlot(id, day, time, extras = {}) {
  return {
    id,
    day,
    time,
    grade: "高2",
    cls: "",
    room: "亀62",
    subj: "高松桜井 英語",
    teacher: "石原",
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
    isOffForGrade: () => false,
    ...extras,
  };
}

const SAKURAI_EN = makeSlot(1, "水", "19:00-20:20");
const SAKURAI_MA = makeSlot(2, "水", "20:30-21:50", { subj: "高松桜井 数学", teacher: "小見山" });
const ICHI_EN = makeSlot(3, "木", "19:00-20:20", { subj: "高松一 英語", room: "401" });
const ICHI_MA = makeSlot(4, "木", "17:00-18:00", { subj: "高松一 数学", teacher: "小見山", room: "亀21" });
const CHU3 = makeSlot(5, "水", "19:00-20:20", { grade: "中3", subj: "数学", teacher: "堀上", room: "501" });
const SLOTS = [SAKURAI_EN, SAKURAI_MA, ICHI_EN, ICHI_MA, CHU3];
const CTX = makeCtx({ allSlots: SLOTS });

describe("schoolOfSubj / courseKeyOf", () => {
  it("科目名の頭の語を学校として取り出す。空白の無い科目名は学校なし", () => {
    expect(schoolOfSubj("高松桜井 英語")).toBe("高松桜井");
    expect(schoolOfSubj("高松桜井　英語")).toBe("高松桜井"); // 全角空白
    expect(schoolOfSubj("数学")).toBe("");
    expect(schoolOfSubj("")).toBe("");
  });

  it("コマと追加授業を同じキーで比べられる (クラスの「-」は空と同じ)", () => {
    expect(courseKeyOf({ grade: "高2", cls: "-", subj: "高松桜井 英語" })).toBe(
      courseKeyOf({ grade: "高2", cls: "", subj: "高松桜井 英語" })
    );
  });
});

describe("listCourseSlots / listCourseGrades / listCourseSchools", () => {
  it("学年は高校部を先に、学校は名前順に並ぶ", () => {
    const list = listCourseSlots({ slots: SLOTS, fromDate: WED });
    expect(listCourseGrades(list)).toEqual(["高2", "中3"]);
    expect(listCourseSchools(list, "高2")).toEqual(["高松一", "高松桜井"]);
    expect(listCourseSchools(list, "中3")).toEqual([]);
  });

  it("期間中に有効な時間割が無いコマ (終わった期) は出さない", () => {
    const timetables = [
      { id: 1, name: "1学期", grades: [], startDate: "2026-04-01", endDate: "2026-09-30" },
      { id: 2, name: "2学期", grades: [], startDate: "2026-10-01" },
    ];
    const oldSlot = makeSlot(9, "水", "19:00-20:20", { timetableId: 1 });
    const newSlot = makeSlot(10, "水", "19:00-20:20", { timetableId: 2 });
    const list = listCourseSlots({ slots: [oldSlot, newSlot], timetables, fromDate: WED });
    expect(list.map((s) => s.id)).toEqual([10]);
  });
});

describe("matchesCourseQuery", () => {
  it("空白区切りの AND で、全角の学年も受ける", () => {
    expect(matchesCourseQuery(SAKURAI_EN, "高２ 桜井 英語")).toBe(true);
    expect(matchesCourseQuery(SAKURAI_MA, "高２ 桜井 英語")).toBe(false);
    expect(matchesCourseQuery(SAKURAI_EN, "石原")).toBe(true);
    expect(matchesCourseQuery(SAKURAI_EN, "")).toBe(true);
  });
});

describe("upcomingHeldDates", () => {
  it("そのコマの授業がある日を今日から返し、休講の日は飛ばす", () => {
    const ctx = makeCtx({
      allSlots: SLOTS,
      isOffForGrade: (d) => d === NEXT_WED,
    });
    expect(upcomingHeldDates(SAKURAI_EN, { ctx, fromDate: WED, count: 3 })).toEqual([
      WED,
      "2026-10-28",
      "2026-11-04",
    ]);
  });
});

describe("collectRoomNames / suggestTimes / roomUsageAt", () => {
  it("教室は数を数として並べ、振替先の教室も拾う", () => {
    const rooms = collectRoomNames(
      [makeSlot(1, "水", "", { room: "亀3" }), makeSlot(2, "水", "", { room: "亀21" }), makeSlot(3, "水", "", { room: "-" })],
      [{ room: "401" }],
      [{ type: "reschedule", targetRoom: "1001" }]
    );
    expect(rooms).toEqual(["401", "1001", "亀3", "亀21"]);
  });

  it("時間の候補は元の時間 → その曜日の同じ部のコマの時間", () => {
    expect(suggestTimes({ slots: SLOTS, slot: SAKURAI_EN, dateStr: THU })).toEqual([
      "19:00-20:20",
      "17:00-18:00",
    ]);
  });

  it("その時間に使われている教室を返す", () => {
    const occ = buildDayOccupancy({ slots: SLOTS, dateStr: THU, ctx: CTX });
    const usage = roomUsageAt(occ, "17:30-18:30");
    expect([...usage.keys()]).toEqual(["亀21"]);
    expect(roomUsageAt(occ, "")).toEqual(new Map());
  });
});

describe("buildTestPrepReschedulePlan", () => {
  const base = {
    slots: SLOTS,
    slot: SAKURAI_EN,
    sourceDate: WED,
    targetDate: THU,
    ctx: CTX,
  };

  it("10/14 の高2 桜井 英語を 10/15 の 17:00-18:00 に別の教室で", () => {
    const plan = buildTestPrepReschedulePlan({
      ...base,
      timeInput: "１７：００〜１８：００",
      roomInput: "亀63",
    });
    expect(plan.errors).toEqual([]);
    expect(plan.record).toEqual({
      date: WED,
      type: "reschedule",
      slotId: 1,
      targetDate: THU,
      targetTime: "17:00-18:00",
      targetRoom: "亀63",
    });
    expect(plan.conflicts).toEqual([]);
  });

  it("時間・教室・担当が元と同じなら持たない", () => {
    const plan = buildTestPrepReschedulePlan({
      ...base,
      timeInput: "19:00-20:20",
      roomInput: "亀62",
      teacherInput: "石原",
    });
    expect(plan.record).toEqual({ date: WED, type: "reschedule", slotId: 1, targetDate: THU });
  });

  it("ゼロ埋めの無いコマの時間と同じ時間なら持たない", () => {
    const morning = { ...SAKURAI_EN, time: "9:30-10:50" };
    const plan = buildTestPrepReschedulePlan({ ...base, slot: morning, timeInput: "09:30-10:50" });
    expect(plan.record.targetTime).toBeUndefined();
  });

  it("隔週の B 週は振替元の日の担当 (パートナー) を元の担当として扱う", () => {
    // 10/7 を A 週 → 10/14 は B 週 = 河野
    // 隔週コマの科目は「A 週/B 週」(B 週は数学)
    const biweekly = { ...SAKURAI_EN, subj: "英/数", teacher: "堀上", note: "隔週(河野)" };
    const ctx = makeCtx({ allSlots: [biweekly], biweeklyAnchors: [{ date: "2026-10-07", weekType: "A" }] });
    const plan = buildTestPrepReschedulePlan({ ...base, slot: biweekly, ctx, teacherInput: "河野" });
    expect(plan.fromTeachers).toEqual(["河野"]);
    // 元の担当と同じなので持たない
    expect(plan.record.targetTeacher).toBeUndefined();
  });

  it("開始だけなら元の長さで終わりを補う", () => {
    const plan = buildTestPrepReschedulePlan({ ...base, timeInput: "1700" });
    expect(plan.record.targetTime).toBe("17:00-18:20");
  });

  it("振替先で講師・教室が重なれば警告として出す (保存は止めない)", () => {
    const plan = buildTestPrepReschedulePlan({
      ...base,
      timeInput: "17:00-18:00",
      roomInput: "亀21",
      teacherInput: "小見山",
    });
    expect(plan.errors).toEqual([]);
    expect(plan.conflicts.map((c) => c.kind).sort()).toEqual(["room", "teacher"]);
    expect(plan.record.targetTeacher).toBe("小見山");
  });

  it("振替元の日にそのコマの授業が無ければ理由を出して止める", () => {
    const ctx = makeCtx({ allSlots: SLOTS, isOffForGrade: (d) => d === WED });
    const plan = buildTestPrepReschedulePlan({ ...base, ctx });
    expect(plan.errors[0]).toMatch(/授業がありません \(休講・テスト期間\)/);
    expect(plan.record).toBeNull();
  });

  it("曜日の違う日・同じ日・合同のコマは振り替えない", () => {
    expect(buildTestPrepReschedulePlan({ ...base, sourceDate: THU }).errors[0]).toMatch(/水曜ではありません/);
    expect(buildTestPrepReschedulePlan({ ...base, targetDate: WED }).errors[0]).toMatch(/別の日/);
    const adjustments = [{ id: 1, date: WED, type: "combine", slotId: 5, combineSlotIds: [1] }];
    expect(buildTestPrepReschedulePlan({ ...base, adjustments }).errors[0]).toMatch(/合同/);
  });

  it("時間が読めなければ止める", () => {
    const plan = buildTestPrepReschedulePlan({ ...base, timeInput: "18:00-17:00" });
    expect(plan.errors).toEqual(["終了時刻は開始時刻より後にしてください"]);
  });

  it("登録済みの振替は自分自身と重ならず、上書きの注意を出す", () => {
    const adjustments = [
      { id: 7, date: WED, type: "reschedule", slotId: 1, targetDate: THU, targetTime: "17:00-18:00", targetRoom: "亀63" },
    ];
    const plan = buildTestPrepReschedulePlan({
      ...base,
      adjustments,
      timeInput: "17:00-18:00",
      roomInput: "亀63",
    });
    expect(plan.conflicts).toEqual([]);
    expect(plan.notes.some((n) => n.includes("上書きします"))).toBe(true);
  });

  it("代行・コマ移動・前倒し・休講日への振替は注意書きで知らせる", () => {
    const ctx = makeCtx({ allSlots: SLOTS, isOffForGrade: (d) => d === "2026-10-10" });
    const plan = buildTestPrepReschedulePlan({
      ...base,
      targetDate: "2026-10-10",
      adjustments: [{ id: 3, date: WED, type: "move", slotId: 1, targetTime: "18:00-19:20" }],
      subs: [{ id: 1, date: WED, slotId: 1, originalTeacher: "石原", substitute: "", status: "requested" }],
      today: "2026-10-12",
      ctx,
    });
    expect(plan.errors).toEqual([]);
    const text = plan.notes.join("\n");
    expect(text).toMatch(/コマ移動 \(→ 18:00-19:20\) は外します/);
    expect(text).toMatch(/代行・欠勤が 1 件/);
    expect(text).toMatch(/休講日・テスト期間です/);
    expect(text).toMatch(/前倒し/);
    expect(text).toMatch(/今日より前/);
  });
});

describe("applyTestPrepReschedule", () => {
  const plan = (extras = {}) =>
    buildTestPrepReschedulePlan({
      slots: SLOTS,
      slot: SAKURAI_EN,
      sourceDate: WED,
      targetDate: THU,
      timeInput: "17:00-18:00",
      roomInput: "亀63",
      ctx: CTX,
      ...extras,
    });

  it("振替を 1 件足す (メモ・作成日時つき)", () => {
    const { next, added, removed } = applyTestPrepReschedule({
      adjustments: [{ id: 4, date: "2026-10-01", type: "cancel", slotId: 2, memo: "" }],
      plan: plan(),
      memo: " テスト対策 ",
      now: "2026-10-15T00:00:00.000Z",
    });
    expect(removed).toEqual([]);
    expect(added).toEqual({
      id: 5,
      date: WED,
      type: "reschedule",
      slotId: 1,
      targetDate: THU,
      targetTime: "17:00-18:00",
      targetRoom: "亀63",
      memo: "テスト対策",
      createdAt: "2026-10-15T00:00:00.000Z",
    });
    expect(next).toHaveLength(2);
  });

  it("同じ日の同じコマの振替・コマ移動は置き換え、同じ振替先なら合同を引き継ぐ", () => {
    const combineWith = { date: "2026-10-16", slotId: 3 };
    const adjustments = [
      { id: 7, date: WED, type: "reschedule", slotId: 1, targetDate: THU, combineWith, memo: "" },
      { id: 8, date: WED, type: "move", slotId: 1, targetTime: "18:00-19:20", memo: "" },
      { id: 9, date: WED, type: "reschedule", slotId: 2, targetDate: THU, memo: "" },
    ];
    const { next, added, removed } = applyTestPrepReschedule({
      adjustments,
      plan: plan({ adjustments }),
    });
    expect(removed.map((a) => a.id)).toEqual([7, 8]);
    // 消した振替の id を使い回さない
    expect(added.id).toBe(10);
    expect(added.combineWith).toEqual(combineWith);
    expect(next.map((a) => a.id)).toEqual([9, 10]);
  });

  it("振替先の日を変えたら合同は引き継がない", () => {
    const adjustments = [
      { id: 7, date: WED, type: "reschedule", slotId: 1, targetDate: "2026-10-16", combineWith: { date: "2026-10-16", slotId: 3 }, memo: "" },
    ];
    const { added } = applyTestPrepReschedule({ adjustments, plan: plan({ adjustments }) });
    expect(added.combineWith).toBeUndefined();
  });

  it("一覧から直している振替は、振替元の日を変えても置き換える", () => {
    const adjustments = [
      { id: 7, date: NEXT_WED, type: "reschedule", slotId: 1, targetDate: "2026-10-22", memo: "" },
    ];
    const { next, removed } = applyTestPrepReschedule({
      adjustments,
      plan: plan({ adjustments, editingAdjId: 7 }),
    });
    expect(removed.map((a) => a.id)).toEqual([7]);
    expect(next).toHaveLength(1);
    expect(next[0].date).toBe(WED);
  });

  it("エラーのあるプランは何も変えない", () => {
    const adjustments = [{ id: 1, date: WED, type: "cancel", slotId: 2, memo: "" }];
    const res = applyTestPrepReschedule({
      adjustments,
      plan: buildTestPrepReschedulePlan({ slots: SLOTS, slot: null, ctx: CTX }),
    });
    expect(res.next).toBe(adjustments);
    expect(res.added).toBeNull();
  });
});

describe("buildTestPrepExtraPlan / applyTestPrepExtra", () => {
  const base = {
    slots: SLOTS,
    template: SAKURAI_EN,
    dates: [THU, "2026-10-17"],
    timeInput: "17:00-18:00",
    roomInput: "亀63",
    teacherInput: "石原",
    label: "テスト対策",
    ctx: CTX,
  };

  it("コマを型にして実施日ごとに追加授業を作る", () => {
    const plan = buildTestPrepExtraPlan(base);
    expect(plan.errors).toEqual([]);
    expect(plan.records).toEqual([
      { date: THU, time: "17:00-18:00", grade: "高2", cls: "", room: "亀63", subj: "高松桜井 英語", teacher: "石原", label: "テスト対策", note: "" },
      { date: "2026-10-17", time: "17:00-18:00", grade: "高2", cls: "", room: "亀63", subj: "高松桜井 英語", teacher: "石原", label: "テスト対策", note: "" },
    ]);
    const { next, added } = applyTestPrepExtra({
      extraLessons: [{ id: 3, date: "2026-09-01", time: "18:00-19:00", grade: "中3", subj: "数学", teacher: "" }],
      plan,
    });
    expect(added.map((l) => l.id)).toEqual([4, 5]);
    expect(next).toHaveLength(3);
  });

  it("複数担当は正史の区切りに揃える", () => {
    const plan = buildTestPrepExtraPlan({ ...base, teacherInput: "石原・小見山" });
    expect(plan.records[0].teacher).toBe("石原·小見山");
  });

  it("時間は必須 (空では作らない)。実施日も必須", () => {
    expect(buildTestPrepExtraPlan({ ...base, timeInput: "" }).errors[0]).toMatch(/時間を入れて/);
    expect(buildTestPrepExtraPlan({ ...base, dates: [] }).errors[0]).toMatch(/実施日/);
  });

  it("実施日ごとに講師・教室の重なりを出す", () => {
    const plan = buildTestPrepExtraPlan({
      ...base,
      dates: [THU],
      roomInput: "亀21",
      teacherInput: "小見山",
    });
    expect(plan.conflictsByDate).toHaveLength(1);
    expect(plan.conflictsByDate[0].date).toBe(THU);
    expect(plan.conflictsByDate[0].conflicts.map((c) => c.kind).sort()).toEqual(["room", "teacher"]);
  });

  it("直すときは 1 日だけ・その 1 件を書き換える", () => {
    const lesson = { id: 3, date: THU, time: "17:00-18:00", grade: "高2", cls: "", room: "亀63", subj: "高松桜井 英語", teacher: "石原", label: "テスト対策", note: "" };
    expect(buildTestPrepExtraPlan({ ...base, editingId: 3 }).errors[0]).toMatch(/1 日/);
    const plan = buildTestPrepExtraPlan({
      ...base,
      extraLessons: [lesson],
      dates: [THU],
      roomInput: "亀64",
      editingId: 3,
    });
    // 直している自分自身とは重ならない / 同じ日の追加授業の注意も出さない
    expect(plan.conflictsByDate).toEqual([]);
    expect(plan.notes).toEqual([]);
    const { next, updated, before } = applyTestPrepExtra({ extraLessons: [lesson], plan });
    expect(before).toBe(lesson);
    expect(updated.room).toBe("亀64");
    expect(next).toEqual([updated]);
  });
});

describe("collectCourseChanges", () => {
  it("コースの振替と追加授業を、授業の日付順に並べる", () => {
    const adjustments = [
      { id: 1, date: WED, type: "reschedule", slotId: 1, targetDate: THU, targetTime: "17:00-18:00" },
      { id: 2, date: WED, type: "reschedule", slotId: 2, targetDate: THU },
      { id: 3, date: "2026-09-30", type: "reschedule", slotId: 1, targetDate: "2026-10-01" },
      { id: 4, date: WED, type: "cancel", slotId: 1 },
    ];
    const extraLessons = [
      { id: 1, date: "2026-10-17", time: "13:00-14:00", grade: "高2", cls: "", subj: "高松桜井 英語", teacher: "石原" },
      { id: 2, date: "2026-10-17", time: "13:00-14:00", grade: "高1", cls: "", subj: "高松桜井 英語", teacher: "石原" },
    ];
    const key = courseKeyOf(SAKURAI_EN);
    const list = collectCourseChanges({
      adjustments,
      extraLessons,
      slots: SLOTS,
      matchCourse: (x) => courseKeyOf(x) === key,
      fromDate: "2026-10-10",
    });
    expect(list.map((x) => x.key)).toEqual(["rs:1", "extra:1"]);
  });
});
