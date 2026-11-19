// 学年グループ (表示期間設定) と時間割 (期) の結び付き (2026-11-19 の P1-1)。
// 表示期間の開始日を次の期に合わせると、前の期の月がまるごと「開講前」になり、
// 月間・授業時間の集計・バイト出勤表を出し直せなかった。
import { describe, expect, it } from "vitest";
import {
  cutoffGroupKey,
  dropTimetableFromCutoff,
  findGroupForSlot,
  findUngroupedGrades,
  getCutoffGroupLabelsWithSlots,
  getDayCutoffKind,
  getSlotCutoffRange,
  groupsForTimetable,
  isSlotBeyondCutoff,
  resolveCutoffGroupTimetables,
  sharedCutoffGroups,
  summarizeCutoffGroups,
} from "./timetable";
import { computeSessionNumber, getSlotCountStartDate } from "./sessionCount";
import { computeTeachingMinutes, summarizeTeacherRow } from "./teachingMinutes";
import { buildCutoffFollowUp } from "../regular-builder/reflect";

// 2026 年度の時間割 (実データの形): 1学期 4/7〜8/24、2学期 8/25〜12/21、
// 3学期 1/8〜 (終了日なし)。時間割 id 2 は欠番
const TT1 = { id: 1, name: "2026 1学期", startDate: "2026-04-07", endDate: "2026-08-24", grades: [] };
const TT3 = { id: 3, name: "2026 2学期", startDate: "2026-08-25", endDate: "2026-12-21", grades: [] };
const TT4 = { id: 4, name: "2026 3学期", startDate: "2027-01-08", endDate: null, grades: [] };
const TIMETABLES = [TT1, TT3, TT4];

const mk = (id, o = {}) => ({
  id,
  day: "水",
  time: "18:55-19:40",
  grade: "中3",
  cls: "B",
  room: "502",
  subj: "数学",
  teacher: "福武",
  note: "",
  ...o,
});

// 1学期の水曜 (timetableId 無し = 1)、2学期の水曜、3学期の火曜
const S1 = mk(1);
const S1b = mk(2, { time: "19:50-20:35", subj: "英語" });
const S3 = mk(3, { timetableId: 3 });
const S4 = mk(4, { timetableId: 4, day: "火", grade: "高2", subj: "高松高 文系数学", time: "19:00-20:20" });
const SLOTS = [S1, S1b, S3, S4];

// 4 グループとも開始日 2026-08-25 (2学期に合わせた共通の設定。実データ)
const SHARED = {
  groups: [
    { label: "中1・2", grades: ["中1", "中2"], startDate: "2026-08-25", date: null },
    { label: "中3", grades: ["中3"], startDate: "2026-08-25", date: null },
    { label: "高1・2", grades: ["高1", "高2"], startDate: "2026-08-25", date: null },
    { label: "高3", grades: ["高3"], startDate: "2026-08-25", date: null },
  ],
  cohorts: [],
};

const resolved = resolveCutoffGroupTimetables(SHARED, TIMETABLES, SLOTS);

describe("groupsForTimetable / findGroupForSlot", () => {
  const dc = {
    groups: [
      { label: "中3", grades: ["中3"], startDate: "2026-08-25", date: null },
      { label: "中3", grades: ["中3"], startDate: "2026-04-07", date: "2026-07-17", timetableId: 1 },
    ],
  };

  it("結び付いたグループのある時間割はそれだけ、無い時間割は共通のグループ", () => {
    expect(groupsForTimetable(dc.groups, 1)).toEqual([dc.groups[1]]);
    expect(groupsForTimetable(dc.groups, 3)).toEqual([dc.groups[0]]);
    expect(sharedCutoffGroups(dc.groups)).toEqual([dc.groups[0]]);
    expect(groupsForTimetable(dc.groups, null)).toEqual([dc.groups[0]]);
  });

  it("コマは自分の時間割に効くグループで引く (timetableId 無し = 1)", () => {
    expect(findGroupForSlot(S1, dc.groups)).toBe(dc.groups[1]);
    expect(findGroupForSlot(S3, dc.groups)).toBe(dc.groups[0]);
    expect(findGroupForSlot(S4, dc.groups)).toBeNull(); // 高2 はどのグループにも無い
  });

  it("結び付いたグループがあれば共通のグループには落ちない (その学年は未所属)", () => {
    const g = {
      groups: [
        { label: "高1・2", grades: ["高2"], startDate: "2026-08-25", date: null },
        { label: "中3", grades: ["中3"], startDate: null, date: null, timetableId: 4 },
      ],
    };
    expect(findGroupForSlot(S4, g.groups)).toBeNull();
    expect(findUngroupedGrades([S4], g)).toEqual([{ grade: "高2", slotCount: 1 }]);
  });

  it("キーは共通なら名前、結び付いたものは名前@時間割", () => {
    expect(cutoffGroupKey(dc.groups[0])).toBe("中3");
    expect(cutoffGroupKey(dc.groups[1])).toBe("中3@1");
  });
});

describe("resolveCutoffGroupTimetables (旧データの読み方)", () => {
  it("共通の開始日より前に終わった時間割に、その時間割の期間の設定を補う", () => {
    const own = resolved.groups.filter((g) => g.timetableId === 1);
    expect(own).toHaveLength(4);
    expect(own.find((g) => g.label === "中3")).toEqual({
      label: "中3",
      grades: ["中3"],
      startDate: "2026-04-07",
      date: "2026-08-24",
      timetableId: 1,
    });
    // オリエンは未設定のまま (既定 = 中学部のみ有効)
    expect(own.every((g) => g.orientationFirstDay === undefined)).toBe(true);
  });

  it("2学期・3学期は共通のグループのまま (補わない)", () => {
    expect(resolved.groups.some((g) => g.timetableId === 3 || g.timetableId === 4)).toBe(false);
    expect(resolved.groups.slice(0, 4)).toEqual(SHARED.groups);
  });

  it("補うものが無ければ同じオブジェクトを返す", () => {
    const early = {
      groups: SHARED.groups.map((g) => ({ ...g, startDate: "2026-04-07" })),
    };
    expect(resolveCutoffGroupTimetables(early, TIMETABLES, SLOTS)).toBe(early);
    expect(resolveCutoffGroupTimetables(resolved, TIMETABLES, SLOTS)).toBe(resolved);
    expect(resolveCutoffGroupTimetables(SHARED, [], SLOTS)).toBe(SHARED);
    expect(resolveCutoffGroupTimetables(null, TIMETABLES, SLOTS)).toBeNull();
  });

  it("その時間割に結び付いたグループが既にあれば触らない", () => {
    const own = {
      groups: [
        ...SHARED.groups,
        { label: "中3", grades: ["中3"], startDate: "2026-04-07", date: "2026-07-17", timetableId: 1 },
      ],
    };
    expect(resolveCutoffGroupTimetables(own, TIMETABLES, SLOTS)).toBe(own);
  });

  it("コマの無い時間割には補わない", () => {
    const r = resolveCutoffGroupTimetables(SHARED, TIMETABLES, [S3, S4]);
    expect(r).toBe(SHARED);
  });

  it("開始日がその時間割の後でないグループは、そのまま写す", () => {
    const mixed = {
      groups: [
        { label: "中3", grades: ["中3"], startDate: "2026-08-25", date: null },
        { label: "高3", grades: ["高3"], startDate: "2026-04-07", date: "2027-01-20", orientationFirstDay: false },
      ],
    };
    const r = resolveCutoffGroupTimetables(mixed, TIMETABLES, SLOTS);
    expect(r.groups.filter((g) => g.timetableId === 1)).toEqual([
      { label: "中3", grades: ["中3"], startDate: "2026-04-07", date: "2026-08-24", timetableId: 1 },
      { ...mixed.groups[1], timetableId: 1 },
    ]);
  });
});

describe("表示期間の開始日が 2026-08-25 のままで、1学期の日付にコマが出る", () => {
  it("1学期のコマは 6/10 に期間内 (修正前は開始日 8/25 より前で落ちていた)", () => {
    expect(isSlotBeyondCutoff("2026-06-10", S1, SHARED)).toBe(true); // 読み方を補わないと落ちる
    expect(isSlotBeyondCutoff("2026-06-10", S1, resolved)).toBe(false);
    expect(getSlotCutoffRange(S1, resolved)).toEqual({ startDate: "2026-04-07", endDate: "2026-08-24" });
  });

  it("2学期のコマの窓は今までどおり", () => {
    expect(getSlotCutoffRange(S3, resolved)).toEqual(getSlotCutoffRange(S3, SHARED));
    expect(isSlotBeyondCutoff("2026-08-24", S3, resolved)).toBe(true);
    expect(isSlotBeyondCutoff("2026-09-02", S3, resolved)).toBe(false);
  });

  it("全日の判定: 1学期の日は「開講前」にならない。2学期・3学期は今までどおり", () => {
    const active = getCutoffGroupLabelsWithSlots(SLOTS, resolved);
    expect(active.has("中3@1")).toBe(true);
    expect(getDayCutoffKind("2026-06-10", SHARED, { activeGroupLabels: getCutoffGroupLabelsWithSlots(SLOTS, SHARED) })).toBe("before");
    expect(getDayCutoffKind("2026-06-10", resolved, { activeGroupLabels: active })).toBeNull();
    expect(getDayCutoffKind("2026-10-07", resolved, { activeGroupLabels: active })).toBeNull();
    expect(getDayCutoffKind("2027-01-12", resolved, { activeGroupLabels: active })).toBeNull();
    // 1学期より前は従来どおり「開講前」
    expect(getDayCutoffKind("2026-04-01", resolved, { activeGroupLabels: active })).toBe("before");
  });

  it("同じ名前のグループの窓は期ごとにまとめて見る (期と期の間は「開講前」)", () => {
    const dc = {
      groups: [
        { label: "中3", grades: ["中3"], startDate: "2026-08-25", date: "2026-12-19", timetableId: 3 },
        { label: "中3", grades: ["中3"], startDate: "2027-01-08", date: "2027-03-19", timetableId: 4 },
      ],
    };
    const slots = [S3, mk(9, { timetableId: 4 })];
    const active = getCutoffGroupLabelsWithSlots(slots, dc);
    expect(getDayCutoffKind("2026-12-25", dc, { activeGroupLabels: active })).toBe("before");
    expect(getDayCutoffKind("2027-03-25", dc, { activeGroupLabels: active })).toBe("after");
    expect(getDayCutoffKind("2027-02-03", dc, { activeGroupLabels: active })).toBeNull();
  });

  it("コマ数の集計は期ごとのグループに分かれる", () => {
    const summary = summarizeCutoffGroups(SLOTS, resolved);
    expect(summary.get("中3@1").slotIds).toEqual([1, 2]);
    expect(summary.get("中3").slotIds).toEqual([3]);
    expect(summary.get("高1・2").slotIds).toEqual([4]);
  });
});

describe("前の期の第N回・オリエン", () => {
  const ctx = (displayCutoff) => ({
    classSets: [],
    allSlots: SLOTS,
    displayCutoff,
    timetables: TIMETABLES,
    isOffForGrade: () => false,
    orientationOnFirstDay: true,
  });

  it("1学期のコマは 1学期の開始日から数え、開講日の 1 限はオリエン (中学部の既定)", () => {
    const c = ctx(resolved);
    expect(getSlotCountStartDate(S1, c)).toBe("2026-04-07");
    // 4/8 (水) が開講日。18:55 の数学がオリエン、19:50 の英語は ①
    expect(computeSessionNumber(S1, "2026-04-08", c)).toBe(0);
    expect(computeSessionNumber(S1b, "2026-04-08", c)).toBe(1);
    expect(computeSessionNumber(S1, "2026-04-15", c)).toBe(1);
    expect(computeSessionNumber(S1, "2026-06-10", c)).toBe(9);
  });

  it("2学期のコマの第N回は今までどおり", () => {
    for (const d of ["2026-08-26", "2026-09-02", "2026-11-18"]) {
      expect(computeSessionNumber(S3, d, ctx(resolved))).toBe(computeSessionNumber(S3, d, ctx(SHARED)));
    }
  });
});

describe("授業時間の集計 (バイト出勤表の元)", () => {
  const minutes = (displayCutoff, startDate, endDate, slots = SLOTS) =>
    computeTeachingMinutes({ startDate, endDate, slots, timetables: TIMETABLES, displayCutoff });

  it("2026/6/1〜6/30 に 1学期のコマを数える", () => {
    expect(minutes(SHARED, "2026-06-01", "2026-06-30").rows.get("福武")).toBeUndefined();
    const row = minutes(resolved, "2026-06-01", "2026-06-30").rows.get("福武");
    // 6 月の水曜 (6/3・10・17・24) × 2 コマ (45 分)
    expect(summarizeTeacherRow(row)).toMatchObject({ count: 8, total: 360, days: 4 });
  });

  it("期切替の「表示期間設定も新しい期に合わせる」を実行しても前の期の月の集計は変わらない", () => {
    // 2学期の終了日 12/19 まで (12/20・12/21 は出さない) の共通の設定
    const before = {
      groups: SHARED.groups.map((g) => ({ ...g, date: "2026-12-19" })),
      cohorts: [],
    };
    const slots = [S3, mk(5, { timetableId: 3, day: "月" }), S4];
    const follow = buildCutoffFollowUp({
      displayCutoff: before,
      startDate: "2027-01-08",
      endDate: "2027-03-19",
      clearOrientation: true,
      timetableId: 4,
    });
    expect(follow.changed).toBe(true);
    const after = resolveCutoffGroupTimetables(follow.next, TIMETABLES, slots);
    // 共通の設定 (= 2学期のコマが従う設定) はそのまま、3学期だけの設定が増える
    expect(sharedCutoffGroups(after.groups)).toEqual(before.groups);
    expect(groupsForTimetable(after.groups, 4).every((g) => g.date === "2027-03-19")).toBe(true);

    const decBefore = minutes(before, "2026-11-21", "2026-12-20", slots);
    const decAfter = minutes(after, "2026-11-21", "2026-12-20", slots);
    expect(summarizeTeacherRow(decAfter.rows.get("福武"))).toEqual(
      summarizeTeacherRow(decBefore.rows.get("福武"))
    );
    // 12/20 (日) は授業なし、12/21 (月) は終了日の後なので数えない (変わらない)
    expect(decAfter.rows.get("福武").entries.some((e) => e.date === "2026-12-21")).toBe(false);
    // 3学期は新しい期の設定で出る
    expect(isSlotBeyondCutoff("2027-01-12", S4, after)).toBe(false);
  });

  it("共通の開始日を 3学期に動かしても (古い端末などで)、2学期の月は時間割の期間で出る", () => {
    const moved = { groups: SHARED.groups.map((g) => ({ ...g, startDate: "2027-01-08" })), cohorts: [] };
    const r = resolveCutoffGroupTimetables(moved, TIMETABLES, SLOTS);
    expect(getSlotCutoffRange(S3, r)).toEqual({ startDate: "2026-08-25", endDate: "2026-12-21" });
    const row = minutes(r, "2026-10-01", "2026-10-31").rows.get("福武");
    expect(summarizeTeacherRow(row).count).toBe(4); // 10 月の水曜 4 回
  });
});

describe("dropTimetableFromCutoff (時間割の削除)", () => {
  it("その時間割に結び付いた学年グループと終講日を外す", () => {
    const dc = {
      groups: [
        { label: "中3", grades: ["中3"], startDate: null, date: null },
        { label: "中3", grades: ["中3"], startDate: null, date: "2026-12-19", timetableId: 3 },
      ],
      cohorts: [
        { id: "M|中3|水", label: "中3 水", grade: "中3", date: "2026-12-16", timetableId: 3 },
        { id: "M|中3|水", label: "中3 水", grade: "中3", date: "2027-03-17", timetableId: 4 },
      ],
    };
    const r = dropTimetableFromCutoff(dc, 3);
    expect(r.groups).toEqual([dc.groups[0]]);
    expect(r.cohorts).toEqual([dc.cohorts[1]]);
    expect(dropTimetableFromCutoff(dc, 9)).toBe(dc);
  });
});
