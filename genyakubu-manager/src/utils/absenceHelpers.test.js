import { describe, expect, it } from "vitest";
import {
  canCombineSlots,
  collectAbsenceTargets,
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
  // 2026-09-25 は金曜。
  const FRI = "2026-09-25";
  const slots = [
    mk(1, { day: "金", teacher: "河野" }),
    mk(2, { day: "金", teacher: "奥村" }),
    mk(3, { day: "金", teacher: "堀上" }),
    mk(4, { day: "月", teacher: "河野" }),
  ];

  it("指定日の曜日の対象先生のコマだけ返す", () => {
    const out = getAbsentSlotIds(slots, FRI, ["河野", "奥村"]);
    expect([...out].sort()).toEqual([1, 2]);
  });

  it("隔週コマは担当する週だけ赤枠にする (パートナーは note から拾う)", () => {
    const ctx = { biweeklyAnchors: [{ date: FRI, weekType: "A" }] };
    const biweekly = [mk(5, { day: "金", teacher: "河野", note: "隔週(堀上)" })];
    // A 週 = 講師欄の河野が担当
    expect([...getAbsentSlotIds(biweekly, FRI, ["河野"], ctx)]).toEqual([5]);
    expect([...getAbsentSlotIds(biweekly, FRI, ["堀上"], ctx)]).toEqual([]);
    // 翌週 (B 週) は逆
    const nextFri = "2026-10-02";
    expect([...getAbsentSlotIds(biweekly, nextFri, ["堀上"], ctx)]).toEqual([5]);
    expect([...getAbsentSlotIds(biweekly, nextFri, ["河野"], ctx)]).toEqual([]);
  });

  it("空の先生リストは空集合", () => {
    expect(getAbsentSlotIds(slots, FRI, []).size).toBe(0);
  });

  it("date が null なら空集合", () => {
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

// targets は slot オブジェクトも持つので、(コマ id, 講師) だけで比べる。
const pairs = (targets) => targets.map((t) => [t.slotId, t.teacher]);

describe("collectAbsenceTargets", () => {
  // 2026-09-25 は金曜。
  const DATE = "2026-09-25";
  const daySlots = [
    mk(1, { teacher: "河野" }),
    mk(2, { teacher: "堀上", time: "20:30-21:50" }),
    mk(3, { teacher: "香川·福江", subj: "英語", time: "17:00-18:20" }),
  ];

  it("欠勤の先生が担当するコマだけを対象にする", () => {
    const { targets } = collectAbsenceTargets({
      slots: daySlots,
      date: DATE,
      teachers: ["河野"],
    });
    expect(pairs(targets)).toEqual([[1, "河野"]]);
  });

  it("多担任コマは欠勤する本人を元講師にする", () => {
    const { targets } = collectAbsenceTargets({
      slots: daySlots,
      date: DATE,
      teachers: ["福江"],
    });
    expect(pairs(targets)).toEqual([[3, "福江"]]);
  });

  it("休講・テスト期間のコマは理由つきで外す", () => {
    const { targets, skipped } = collectAbsenceTargets({
      slots: daySlots,
      date: DATE,
      teachers: ["河野"],
      ctx: { isOffForGrade: () => true },
    });
    expect(targets).toEqual([]);
    expect(skipped.map((x) => [x.slot.id, x.reason])).toEqual([
      [1, "休講・テスト期間"],
    ]);
  });

  it("すでに代行・欠勤が登録されているコマは外す", () => {
    const { targets, skipped } = collectAbsenceTargets({
      slots: daySlots,
      date: DATE,
      teachers: ["河野"],
      existingSubs: [
        { id: 9, date: DATE, slotId: 1, originalTeacher: "河野", substitute: "" },
      ],
    });
    expect(targets).toEqual([]);
    expect(skipped.map((x) => x.reason)).toEqual(["登録済み"]);
  });

  it("解除マーク済みの代行は「未登録」として扱う", () => {
    const { targets } = collectAbsenceTargets({
      slots: daySlots,
      date: DATE,
      teachers: ["河野"],
      existingSubs: [
        { id: 9, date: DATE, slotId: 1, originalTeacher: "河野", substitute: "" },
      ],
      removedSubIds: new Set([9]),
    });
    expect(pairs(targets)).toEqual([[1, "河野"]]);
  });

  it("保存済みの振替・合同で片付いているコマも外す", () => {
    const { targets, skipped } = collectAbsenceTargets({
      slots: daySlots,
      date: DATE,
      teachers: ["河野", "堀上"],
      existingAdjustments: [
        { id: 1, date: DATE, type: "reschedule", slotId: 1, targetDate: "2026-09-28" },
        { id: 2, date: DATE, type: "combine", slotId: 9, combineSlotIds: [2] },
      ],
    });
    expect(targets).toEqual([]);
    expect(skipped.map((x) => x.reason).sort()).toEqual([
      "合同で対応済み",
      "振替で対応済み",
    ]);
  });

  it("解除マーク済みの調整は無かったことにする", () => {
    const { targets } = collectAbsenceTargets({
      slots: daySlots,
      date: DATE,
      teachers: ["河野"],
      existingAdjustments: [
        { id: 1, date: DATE, type: "reschedule", slotId: 1, targetDate: "2026-09-28" },
      ],
      removedAdjustmentIds: new Set([1]),
    });
    expect(pairs(targets)).toEqual([[1, "河野"]]);
  });

  it("多担任コマで 2 人同時に休むなら 2 件とも対象にする", () => {
    const { targets, skipped } = collectAbsenceTargets({
      slots: daySlots,
      date: DATE,
      teachers: ["香川", "福江"],
    });
    // プレップ (香川·福江·川井) で 2 人が休む = (コマ, 講師) が 2 組。
    // 出勤する川井のぶんは作らない。
    expect(pairs(targets)).toEqual([
      [3, "香川"],
      [3, "福江"],
    ]);
    expect(skipped).toEqual([]);
  });

  it("下書きで振替・合同にしたコマは外す", () => {
    const { targets, skipped } = collectAbsenceTargets({
      slots: daySlots,
      date: DATE,
      teachers: ["河野", "堀上"],
      draft: {
        1: { reschedule: { targetDate: "2026-09-28" } },
        2: { absorbedBy: 1 },
      },
    });
    expect(targets).toEqual([]);
    expect(skipped.map((x) => x.reason).sort()).toEqual([
      "合同で対応済み",
      "振替で対応済み",
    ]);
  });

  it("隔週コマは担当していない週なら対象外", () => {
    const anchors = [{ date: "2026-09-25", weekType: "A" }];
    const slots = [
      mk(5, { teacher: "河野", note: "隔週(堀上)" }),
    ];
    // A 週 = 講師欄の河野が担当。堀上は今週いない。
    const forPartner = collectAbsenceTargets({
      slots,
      date: DATE,
      teachers: ["堀上"],
      ctx: { biweeklyAnchors: anchors },
    });
    expect(forPartner.targets).toEqual([]);
    expect(forPartner.skipped.map((x) => x.reason)).toEqual([
      "この週は担当しない (隔週)",
    ]);
    const forMain = collectAbsenceTargets({
      slots,
      date: DATE,
      teachers: ["河野"],
      ctx: { biweeklyAnchors: anchors },
    });
    expect(pairs(forMain.targets)).toEqual([[5, "河野"]]);
  });

  it("先生未選択なら何も返さない", () => {
    expect(collectAbsenceTargets({ slots: daySlots, date: DATE, teachers: [] })).toEqual({
      targets: [],
      skipped: [],
    });
  });
});
