import { describe, expect, it } from "vitest";
import {
  addOffsiteLessons,
  addOffsiteSkipRange,
  describeOffsite,
  describeOffsiteBusy,
  draftFromOffsite,
  emptyOffsiteDraft,
  formatOffsiteDays,
  formatOffsitePeriod,
  formatOffsiteTime,
  formatTravel,
  indexOffsiteLessonsByDate,
  isOffsiteClash,
  isOffsiteOnDate,
  isOpenEndedTime,
  knownOffsitePlaces,
  knownOffsiteTimes,
  listOffsiteDates,
  migrateOffsiteLessons,
  nextOffsiteDate,
  normalizeOffsiteTime,
  offsiteByTeacherOnDate,
  offsiteClashOf,
  offsiteConflictsAt,
  offsiteDayStatus,
  offsiteLessonsOnDate,
  offsiteOverlap,
  offsiteStartText,
  offsiteStatus,
  offsiteTimeRange,
  toggleOffsiteSkipDate,
  updateOffsiteLesson,
  validateOffsiteDraft,
} from "./offsiteLessons";
import { splitTeacherField } from "./biweekly";

// 2026-10-01 は木曜。依頼どおりの 4 件 (石原 / 片岡 / 堀上 ×2)
const R = (id, teacher, place, days, time, startDate, over = {}) => ({
  id,
  teacher,
  place,
  days,
  time,
  startDate,
  ...over,
});
const ishihara = R(1, "石原", "村上高松", ["火", "木"], "14:50-15:40", "2026-10-01", { memo: "1月まで？" });
const kataoka = R(2, "片岡", "村上高松", ["木"], "14:50-15:40", "2026-10-01");
const horikamiA = R(3, "堀上", "村上高松", ["火", "木"], "14:50-15:40", "2026-10-01", {
  endDate: "2026-10-13",
});
const horikamiB = R(4, "堀上", "大手前丸亀", ["月", "水"], "13:30", "2026-10-14");
const list = [ishihara, kataoka, horikamiA, horikamiB];

const holidays = [
  { id: 1, date: "2026-10-12", label: "スポーツの日", scope: ["全部"], targetGrades: [], subjKeywords: [] },
  { id: 2, date: "2026-11-03", label: "文化の日", scope: ["全部"], targetGrades: [], subjKeywords: [] },
  // 中学部だけの休講は塾全体の休みではない
  { id: 3, date: "2026-10-20", label: "中学部休講", scope: ["中学部"], targetGrades: [], subjKeywords: [] },
  // 学年を絞った休講も同じ
  { id: 4, date: "2026-10-22", label: "高1休講", scope: ["全部"], targetGrades: ["高1"], subjKeywords: [] },
];

const split = { splitTeachers: splitTeacherField };

describe("normalizeOffsiteTime", () => {
  it("区切りと全角のゆれを吸収して HH:MM-HH:MM にする", () => {
    expect(normalizeOffsiteTime("14:50-15:40")).toEqual({ ok: true, time: "14:50-15:40" });
    expect(normalizeOffsiteTime("１４：５０〜１５：４０")).toEqual({ ok: true, time: "14:50-15:40" });
    expect(normalizeOffsiteTime("14:50ー15:40")).toEqual({ ok: true, time: "14:50-15:40" });
    expect(normalizeOffsiteTime(" 14:50 ～ 15:40 ")).toEqual({ ok: true, time: "14:50-15:40" });
    expect(normalizeOffsiteTime("1450-1540")).toEqual({ ok: true, time: "14:50-15:40" });
    expect(normalizeOffsiteTime("9:05-10:00")).toEqual({ ok: true, time: "09:05-10:00" });
  });

  it("終了未定は開始だけで持つ (13:30 / 13:30- / 13:30〜)", () => {
    expect(normalizeOffsiteTime("13:30")).toEqual({ ok: true, time: "13:30" });
    expect(normalizeOffsiteTime("13:30-")).toEqual({ ok: true, time: "13:30" });
    expect(normalizeOffsiteTime("13:30〜")).toEqual({ ok: true, time: "13:30" });
  });

  it("読めない・逆転・空は理由つきで弾く", () => {
    expect(normalizeOffsiteTime("").ok).toBe(false);
    expect(normalizeOffsiteTime("あいう").ok).toBe(false);
    expect(normalizeOffsiteTime("25:00").ok).toBe(false);
    expect(normalizeOffsiteTime("15:40-14:50")).toMatchObject({ ok: false, error: expect.stringMatching(/後/) });
    expect(normalizeOffsiteTime("14:50-15:40-16:00").ok).toBe(false);
    expect(normalizeOffsiteTime("14:50-15:7x").ok).toBe(false);
  });
});

describe("時刻の表示", () => {
  it("offsiteTimeRange / isOpenEndedTime", () => {
    expect(offsiteTimeRange("14:50-15:40")).toEqual({ start: 890, end: 940 });
    expect(offsiteTimeRange("13:30")).toEqual({ start: 810, end: null });
    expect(offsiteTimeRange("")).toBeNull();
    expect(isOpenEndedTime("13:30")).toBe(true);
    expect(isOpenEndedTime("14:50-15:40")).toBe(false);
  });

  it("終了未定はそう書く", () => {
    expect(formatOffsiteTime("14:50-15:40")).toBe("14:50-15:40");
    expect(formatOffsiteTime("13:30")).toBe("13:30〜 (終了未定)");
    expect(offsiteStartText("14:50-15:40")).toBe("14:50");
    expect(offsiteStartText("13:30")).toBe("13:30〜");
  });
});

describe("offsiteOverlap", () => {
  it("終了時刻があれば半開区間で判定する", () => {
    expect(offsiteOverlap("14:50-15:40", "15:00-16:00")).toBe("overlap");
    expect(offsiteOverlap("14:50-15:40", "15:40-16:30")).toBeNull();
    expect(offsiteOverlap("14:50-15:40", "14:00-14:50")).toBeNull();
    expect(offsiteOverlap("14:50-15:40", "14:00-15:00")).toBe("overlap");
  });

  it("点のコマ (終了なし) は開始が区間に入るかで見る", () => {
    expect(offsiteOverlap("14:50-15:40", "15:00")).toBe("overlap");
    expect(offsiteOverlap("14:50-15:40", "14:50")).toBe("overlap");
    expect(offsiteOverlap("14:50-15:40", "15:40")).toBeNull();
  });

  it("終了未定: 後から始まるコマは maybe、最中に始まるなら overlap、前に終わるなら null", () => {
    expect(offsiteOverlap("13:30", "16:25-17:25")).toBe("maybe");
    expect(offsiteOverlap("13:30", "16:00")).toBe("maybe");
    expect(offsiteOverlap("13:30", "13:00-14:00")).toBe("overlap");
    expect(offsiteOverlap("13:30", "13:30-14:20")).toBe("overlap");
    expect(offsiteOverlap("13:30", "12:00-13:30")).toBeNull();
    expect(offsiteOverlap("13:30", "12:00")).toBeNull();
  });

  it("読めない時刻は null", () => {
    expect(offsiteOverlap("", "16:00-17:00")).toBeNull();
    expect(offsiteOverlap("14:50-15:40", "1限")).toBeNull();
  });
});

describe("表記", () => {
  it("曜日は月→土の順に並べ、重複と範囲外を落とす", () => {
    expect(formatOffsiteDays(["木", "火", "火", "日"])).toBe("火・木");
  });

  it("期間は未定を明記し、年をまたぐときだけ年を付ける", () => {
    expect(formatOffsitePeriod(ishihara)).toBe("10/1〜未定");
    expect(formatOffsitePeriod(horikamiA)).toBe("10/1〜10/13");
    expect(formatOffsitePeriod({ startDate: "2026-10-14", endDate: "2027-03-31" })).toBe(
      "2026/10/14〜2027/3/31"
    );
  });

  it("describeOffsite / describeOffsiteBusy", () => {
    expect(describeOffsite(ishihara)).toBe("村上高松 火・木 14:50-15:40");
    expect(describeOffsite(horikamiB, { withTeacher: true })).toBe(
      "堀上: 大手前丸亀 月・水 13:30〜 (終了未定)"
    );
    expect(describeOffsiteBusy(ishihara)).toBe("他校舎: 村上高松 14:50-15:40");
  });
});

describe("offsiteDayStatus", () => {
  it("曜日・期間が合う日は on、それ以外は null", () => {
    expect(offsiteDayStatus(ishihara, "2026-10-01", holidays)).toBe("on"); // 木
    expect(offsiteDayStatus(ishihara, "2026-10-06", holidays)).toBe("on"); // 火
    expect(offsiteDayStatus(ishihara, "2026-10-02", holidays)).toBeNull(); // 金
    expect(offsiteDayStatus(ishihara, "2026-09-29", holidays)).toBeNull(); // 開始前の火
    expect(offsiteDayStatus(horikamiA, "2026-10-13", holidays)).toBe("on"); // 終了日当日
    expect(offsiteDayStatus(horikamiA, "2026-10-15", holidays)).toBeNull(); // 終了後の木
  });

  it("塾の全体休講日は既定で休み (keepOnHolidays で外せる)", () => {
    expect(offsiteDayStatus(ishihara, "2026-11-03", holidays)).toBe("holiday");
    expect(isOffsiteOnDate(ishihara, "2026-11-03", holidays)).toBe(false);
    expect(
      offsiteDayStatus({ ...ishihara, keepOnHolidays: true }, "2026-11-03", holidays)
    ).toBe("on");
  });

  it("部門・学年を絞った休講は塾全体の休みではない", () => {
    expect(offsiteDayStatus(ishihara, "2026-10-20", holidays)).toBe("on"); // 火 中学部休講
    expect(offsiteDayStatus(ishihara, "2026-10-22", holidays)).toBe("on"); // 木 高1休講
  });

  it("休みにした日は skip (休講日より優先して出す)", () => {
    const rec = { ...ishihara, skipDates: ["2026-10-06", "2026-11-03"] };
    expect(offsiteDayStatus(rec, "2026-10-06", holidays)).toBe("skip");
    expect(offsiteDayStatus(rec, "2026-11-03", holidays)).toBe("skip");
  });

  it("holidays を渡さなければ休講日は見ない", () => {
    expect(offsiteDayStatus(ishihara, "2026-11-03")).toBe("on");
  });
});

describe("offsiteLessonsOnDate / offsiteByTeacherOnDate", () => {
  it("その日に行く予定を開始時刻順で返し、講師で絞れる", () => {
    const d = "2026-10-01"; // 木: 石原・片岡・堀上 (村上高松)
    expect(offsiteLessonsOnDate(list, d, { holidays }).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(offsiteLessonsOnDate(list, d, { teacher: "片岡", holidays }).map((r) => r.id)).toEqual([2]);
    // 10/14 (水) は堀上の大手前丸亀だけ
    expect(offsiteLessonsOnDate(list, "2026-10-14", { holidays }).map((r) => r.id)).toEqual([4]);
  });

  it("開始時刻 → 行き先の順", () => {
    const a = R(10, "A", "B校", ["火"], "15:00-16:00", "2026-10-01");
    const b = R(11, "B", "A校", ["火"], "13:30", "2026-10-01");
    const c = R(12, "C", "A校", ["火"], "15:00-16:00", "2026-10-01");
    expect(offsiteLessonsOnDate([a, b, c], "2026-10-06").map((r) => r.id)).toEqual([11, 12, 10]);
  });

  it("講師ごとの Map", () => {
    const m = offsiteByTeacherOnDate(list, "2026-10-08", holidays); // 木
    expect([...m.keys()].sort()).toEqual(["堀上", "片岡", "石原"].sort());
    expect(m.get("堀上").map((r) => r.id)).toEqual([3]);
  });

  it("引数不正は空", () => {
    expect(offsiteLessonsOnDate(null, "2026-10-01")).toEqual([]);
    expect(offsiteLessonsOnDate(list, "")).toEqual([]);
  });
});

describe("indexOffsiteLessonsByDate", () => {
  it("堀上の 10 月: 10/13 まで村上高松 (火木)、10/14 から大手前丸亀 (月水)", () => {
    const m = indexOffsiteLessonsByDate(list, {
      teacher: "堀上",
      holidays,
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect([...m.keys()]).toEqual([
      "2026-10-01",
      "2026-10-06",
      "2026-10-08",
      "2026-10-13",
      "2026-10-14",
      "2026-10-19",
      "2026-10-21",
      "2026-10-26",
      "2026-10-28",
    ]);
    expect(m.get("2026-10-13")[0].place).toBe("村上高松");
    expect(m.get("2026-10-14")[0].place).toBe("大手前丸亀");
  });

  it("範囲が無ければ空", () => {
    expect(indexOffsiteLessonsByDate(list, { teacher: "堀上" }).size).toBe(0);
    expect(indexOffsiteLessonsByDate([], { from: "2026-10-01", to: "2026-10-31" }).size).toBe(0);
  });
});

describe("listOffsiteDates / nextOffsiteDate / offsiteStatus", () => {
  it("期間内の曜日が合う日を状態つきで並べる", () => {
    const rec = { ...ishihara, skipDates: ["2026-11-05"] };
    const out = listOffsiteDates(rec, { from: "2026-11-01", to: "2026-11-12", holidays });
    expect(out).toEqual([
      { date: "2026-11-03", status: "holiday" },
      { date: "2026-11-05", status: "skip" },
      { date: "2026-11-10", status: "on" },
      { date: "2026-11-12", status: "on" },
    ]);
  });

  it("終了日で打ち切る", () => {
    const out = listOffsiteDates(horikamiA, { from: "2026-10-01", to: "2026-12-31", holidays });
    expect(out.map((x) => x.date)).toEqual([
      "2026-10-01",
      "2026-10-06",
      "2026-10-08",
      "2026-10-13",
    ]);
  });

  it("次に行く日 (当日を含む・休みを飛ばす)", () => {
    expect(nextOffsiteDate(ishihara, "2026-10-02", holidays)).toBe("2026-10-06");
    expect(nextOffsiteDate(ishihara, "2026-10-06", holidays)).toBe("2026-10-06");
    expect(nextOffsiteDate(ishihara, "2026-11-03", holidays)).toBe("2026-11-05");
    expect(nextOffsiteDate(horikamiA, "2026-10-14", holidays)).toBeNull();
  });

  it("今日から見た状態", () => {
    expect(offsiteStatus(ishihara, "2026-10-02")).toBe("active");
    expect(offsiteStatus(horikamiB, "2026-10-02")).toBe("upcoming");
    expect(offsiteStatus(horikamiA, "2026-10-14")).toBe("ended");
    expect(offsiteStatus(horikamiA, "2026-10-13")).toBe("active");
  });
});

describe("offsiteConflictsAt", () => {
  it("その講師・日・時刻に重なる予定を overlap / maybe で返す", () => {
    expect(offsiteConflictsAt(list, "石原", "2026-10-06", "15:00-16:00", holidays)).toEqual([
      { rec: ishihara, kind: "overlap" },
    ]);
    expect(offsiteConflictsAt(list, "石原", "2026-10-06", "19:50-20:35", holidays)).toEqual([]);
    // 終了未定 (大手前丸亀 13:30〜) の後のコマは「かもしれない」
    expect(offsiteConflictsAt(list, "堀上", "2026-10-19", "16:25-17:25", holidays)).toEqual([
      { rec: horikamiB, kind: "maybe" },
    ]);
    // 休講日は行かないので重ならない
    expect(offsiteConflictsAt(list, "石原", "2026-11-03", "15:00-16:00", holidays)).toEqual([]);
    expect(offsiteConflictsAt(list, "", "2026-10-06", "15:00-16:00", holidays)).toEqual([]);
  });
});

describe("入力 (validate / add / update)", () => {
  const draft = {
    ...emptyOffsiteDraft("2026-10-01"),
    teacher: "石原・片岡",
    place: " 村上高松 ",
    days: ["木", "火"],
    time: "１４：５０〜１５：４０",
  };

  it("講師は区切りで複数書け、時間は保存形に整える", () => {
    expect(validateOffsiteDraft(draft, split)).toEqual({
      ok: true,
      teachers: ["石原", "片岡"],
      time: "14:50-15:40",
    });
  });

  it("足りない項目は field つきで返す", () => {
    expect(validateOffsiteDraft({ ...draft, teacher: " " }, split)).toMatchObject({ ok: false, field: "teacher" });
    expect(validateOffsiteDraft({ ...draft, place: "" }, split)).toMatchObject({ ok: false, field: "place" });
    expect(validateOffsiteDraft({ ...draft, days: [] }, split)).toMatchObject({ ok: false, field: "days" });
    expect(validateOffsiteDraft({ ...draft, time: "" }, split)).toMatchObject({ ok: false, field: "time" });
    expect(validateOffsiteDraft({ ...draft, startDate: "" }, split)).toMatchObject({ ok: false, field: "startDate" });
    expect(
      validateOffsiteDraft({ ...draft, endDate: "2026-09-30" }, split)
    ).toMatchObject({ ok: false, field: "endDate" });
    expect(
      validateOffsiteDraft(draft, { ...split, editing: true })
    ).toMatchObject({ ok: false, field: "teacher" });
  });

  it("講師ごとに 1 件ずつ作り、undefined を含めない", () => {
    const v = validateOffsiteDraft(draft, split);
    const { list: next, added } = addOffsiteLessons([ishihara], draft, {
      teachers: v.teachers,
      time: v.time,
      nextId: 5,
      nowIso: "2026-10-02T00:00:00.000Z",
    });
    expect(next).toHaveLength(3);
    expect(added).toEqual([
      {
        id: 5,
        teacher: "石原",
        place: "村上高松",
        days: ["火", "木"],
        time: "14:50-15:40",
        startDate: "2026-10-01",
        createdAt: "2026-10-02T00:00:00.000Z",
      },
      {
        id: 6,
        teacher: "片岡",
        place: "村上高松",
        days: ["火", "木"],
        time: "14:50-15:40",
        startDate: "2026-10-01",
        createdAt: "2026-10-02T00:00:00.000Z",
      },
    ]);
    for (const r of added) {
      expect(Object.values(r).every((v2) => v2 !== undefined)).toBe(true);
    }
  });

  it("終了日・休講日も行く・メモは入れたときだけ持つ", () => {
    const { added } = addOffsiteLessons([], { ...draft, endDate: "2026-10-13", keepOnHolidays: true, memo: " 1月？ " }, {
      teachers: ["堀上"],
      time: "14:50-15:40",
      nextId: 1,
      nowIso: "x",
    });
    expect(added[0]).toMatchObject({ endDate: "2026-10-13", keepOnHolidays: true, memo: "1月？" });
  });

  it("更新は createdAt を残し、期間の外に出た休みの日だけ落とす", () => {
    const rec = { ...ishihara, createdAt: "c", skipDates: ["2026-10-06", "2026-12-24"] };
    const next = updateOffsiteLesson(
      [rec, kataoka],
      1,
      { ...draftFromOffsite(rec), endDate: "2026-11-30" },
      { teacher: "石原", time: "14:50-15:40", nowIso: "u" }
    );
    expect(next[0]).toEqual({
      id: 1,
      teacher: "石原",
      place: "村上高松",
      days: ["火", "木"],
      time: "14:50-15:40",
      startDate: "2026-10-01",
      endDate: "2026-11-30",
      memo: "1月まで？",
      skipDates: ["2026-10-06"],
      createdAt: "c",
      updatedAt: "u",
    });
    expect(next[1]).toBe(kataoka);
  });

  it("draftFromOffsite は保存形をフォームへ戻す", () => {
    expect(draftFromOffsite(horikamiB)).toEqual({
      teacher: "堀上",
      place: "大手前丸亀",
      days: ["月", "水"],
      time: "13:30",
      startDate: "2026-10-14",
      endDate: "",
      travelMinutes: "",
      keepOnHolidays: false,
      memo: "",
    });
  });
});

describe("休みの日の編集", () => {
  it("toggleOffsiteSkipDate は付け外しし、空になったらキーごと消す", () => {
    const a = toggleOffsiteSkipDate(ishihara, "2026-10-06");
    expect(a.skipDates).toEqual(["2026-10-06"]);
    const b = toggleOffsiteSkipDate(a, "2026-10-06");
    expect("skipDates" in b).toBe(false);
  });

  it("addOffsiteSkipRange は期間内の担当曜日だけを休みにする (冬休みなど)", () => {
    const { rec, added } = addOffsiteSkipRange(ishihara, "2026-12-24", "2027-01-07");
    // 火木: 12/24(木) 12/29(火) 12/31(木) 1/5(火) 1/7(木)
    expect(added).toBe(5);
    expect(rec.skipDates).toEqual([
      "2026-12-24",
      "2026-12-29",
      "2026-12-31",
      "2027-01-05",
      "2027-01-07",
    ]);
    // 既に休みの日は数えない / 期間外 (終了後) は足さない
    expect(addOffsiteSkipRange(rec, "2026-12-24", "2026-12-24").added).toBe(0);
    expect(addOffsiteSkipRange(horikamiA, "2026-12-01", "2026-12-31").added).toBe(0);
    expect(addOffsiteSkipRange(ishihara, "2026-12-31", "2026-12-01").added).toBe(0);
  });
});

describe("入力候補", () => {
  it("行き先は五十音、時間は開始時刻順 (使用頻度では並べない)", () => {
    expect(knownOffsitePlaces(list)).toEqual(["大手前丸亀", "村上高松"].sort((a, b) => a.localeCompare(b, "ja")));
    expect(knownOffsiteTimes(list)).toEqual(["13:30", "14:50-15:40"]);
  });
});

describe("migrateOffsiteLessons", () => {
  it("RTDB が落とした配列を補い、型を揃える", () => {
    const raw = [
      { id: 1, teacher: " 石原 ", place: "村上高松", time: "14:50-15:40", startDate: "2026-10-01", days: ["木", "火"] },
      // days が RTDB に消された (保存時は空配列)
      { id: 2, teacher: "片岡", place: "村上高松", time: "14:50-15:40", startDate: "2026-10-01" },
    ];
    const out = migrateOffsiteLessons(raw);
    expect(out[0]).toEqual({
      id: 1,
      teacher: "石原",
      place: "村上高松",
      days: ["火", "木"],
      time: "14:50-15:40",
      startDate: "2026-10-01",
    });
    expect(out[1].days).toEqual([]);
  });

  it("講師・行き先・開始日の無いものと壊れた値は落とす", () => {
    const out = migrateOffsiteLessons([
      null,
      "x",
      { id: 3, teacher: "", place: "A", startDate: "2026-10-01" },
      { id: 4, teacher: "A", place: "", startDate: "2026-10-01" },
      { id: 5, teacher: "A", place: "B", startDate: "10/1" },
      { id: "x", teacher: "A", place: "B", startDate: "2026-10-01" },
      { id: 6, teacher: "A", place: "B", startDate: "2026-10-01", endDate: "", skipDates: ["bad", "2026-10-08", "2026-10-08"], keepOnHolidays: "yes", memo: 3 },
    ]);
    expect(out).toEqual([
      { id: 6, teacher: "A", place: "B", days: [], time: "", startDate: "2026-10-01", skipDates: ["2026-10-08"] },
    ]);
  });

  it("冪等で、配列でなければ空", () => {
    const once = migrateOffsiteLessons(list);
    expect(migrateOffsiteLessons(once)).toEqual(once);
    expect(migrateOffsiteLessons(null)).toEqual([]);
    expect(migrateOffsiteLessons({ 0: ishihara })).toEqual([]);
  });
});

describe("移動時間 (travelMinutes)", () => {
  it("時間帯は重ならなくても、間が移動時間より短いと travel", () => {
    // 14:50-15:40 + 移動 30 分: 16:00 のコマは戻りが間に合わない、16:10 は間に合う
    expect(offsiteOverlap("14:50-15:40", "16:00-16:50", 30)).toBe("travel");
    expect(offsiteOverlap("14:50-15:40", "16:10-17:00", 30)).toBeNull();
    // 行く前のコマ: 14:30 に終わると 14:50 に間に合わない
    expect(offsiteOverlap("14:50-15:40", "13:40-14:30", 30)).toBe("travel");
    expect(offsiteOverlap("14:50-15:40", "13:00-14:20", 30)).toBeNull();
    // 重なるものは overlap のまま / 移動時間なしは従来どおり
    expect(offsiteOverlap("14:50-15:40", "15:00-16:00", 30)).toBe("overlap");
    expect(offsiteOverlap("14:50-15:40", "16:00-16:50")).toBeNull();
    // 終了未定: 前のコマだけ移動を見る (後は maybe のまま)
    expect(offsiteOverlap("13:30", "12:30-13:10", 30)).toBe("travel");
    expect(offsiteOverlap("13:30", "16:25-17:25", 30)).toBe("maybe");
  });

  it("isOffsiteClash / offsiteClashOf / 表記", () => {
    const rec = { ...ishihara, travelMinutes: 30 };
    expect(offsiteClashOf(rec, "16:00-16:50")).toBe("travel");
    expect(isOffsiteClash("travel")).toBe(true);
    expect(isOffsiteClash("maybe")).toBe(false);
    expect(describeOffsiteBusy(rec)).toBe("他校舎: 村上高松 14:50-15:40 (移動 30 分)");
    expect(formatTravel(ishihara)).toBe("");
  });

  it("入力は 0〜180 の整数、空欄はなし。保存は 1 以上のときだけ持つ", () => {
    const d = { ...emptyOffsiteDraft("2026-10-01"), teacher: "石原", place: "村上高松", days: ["火"], time: "14:50-15:40" };
    expect(validateOffsiteDraft({ ...d, travelMinutes: "200" }, split)).toMatchObject({ ok: false, field: "travelMinutes" });
    expect(validateOffsiteDraft({ ...d, travelMinutes: "1.5" }, split)).toMatchObject({ ok: false, field: "travelMinutes" });
    expect(validateOffsiteDraft({ ...d, travelMinutes: "３０" }, split).ok).toBe(true);
    const add = (t) =>
      addOffsiteLessons([], { ...d, travelMinutes: t }, { teachers: ["石原"], time: "14:50-15:40", nextId: 1, nowIso: "x" }).added[0];
    expect(add("３０").travelMinutes).toBe(30);
    expect("travelMinutes" in add("")).toBe(false);
    expect("travelMinutes" in add("0")).toBe(false);
    expect(draftFromOffsite({ ...ishihara, travelMinutes: 30 }).travelMinutes).toBe("30");
    expect(migrateOffsiteLessons([{ ...ishihara, travelMinutes: 30 }])[0].travelMinutes).toBe(30);
    expect("travelMinutes" in migrateOffsiteLessons([{ ...ishihara, travelMinutes: -5 }])[0]).toBe(false);
  });
});

describe("校正で直したところ", () => {
  it("同じ講師の重ね書きは 1 件にする", () => {
    const d = { ...emptyOffsiteDraft("2026-10-01"), teacher: "石原・石原", place: "村上高松", days: ["火"], time: "14:50-15:40" };
    expect(validateOffsiteDraft(d, split).teachers).toEqual(["石原"]);
  });

  it("曜日を変えたら、当たらなくなった休みの日を落とす", () => {
    const rec = { ...ishihara, skipDates: ["2026-10-06", "2026-10-08"] }; // 火・木
    const next = updateOffsiteLesson([rec], 1, { ...draftFromOffsite(rec), days: ["木"] }, {
      teacher: "石原",
      time: "14:50-15:40",
      nowIso: "u",
    });
    expect(next[0].skipDates).toEqual(["2026-10-08"]);
  });

  it("読み込んだ時刻のゆれを保存形に揃え、読めないものはそのまま残す", () => {
    const out = migrateOffsiteLessons([
      { ...ishihara, time: "１４：５０〜１５：４０" },
      { ...kataoka, time: "午後" },
    ]);
    expect(out.map((r) => r.time)).toEqual(["14:50-15:40", "午後"]);
  });
});
