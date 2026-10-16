import { describe, expect, it } from "vitest";
import { makeEventHelpers } from "../../components/views/dashboardHelpers";
import { buildCancelIndex } from "../slotCancel";
import {
  buildDayPlans,
  compareSchedules,
  dropHolidayException,
  extraLessonMatchesCourse,
  groupSkippedRanges,
  holidayExceptionTargets,
  parseSourceDate,
  proposeFixes,
  systemSlotStatus,
  withOnlyDate,
} from "./compare";
import { effectiveMapping, suggestMapping } from "./courseMapping";
import { mergeHighSchoolSheets, parseHighSchoolSheet } from "./highSchoolSheet";
import { SMALL_SLOTS as SLOTS, makeSheet, smallH12Sheet as sheet, weekdayIndexOf } from "./testUtils";
import { addHolidayException } from "../holidayExceptions";
import { IRREGULAR_OFF_LABEL } from "../slotDates";

function makeSys({
  slots,
  holidays = [],
  examPeriods = [],
  adjustments = [],
  displayCutoff = null,
  timetables = [],
  extraLessons = [],
}) {
  const helpers = makeEventHelpers(holidays, examPeriods, []);
  const ctx = {
    classSets: [],
    allSlots: slots,
    displayCutoff,
    timetables,
    isOffForGrade: helpers.isOffForGrade,
    biweeklyAnchors: [],
    holidays,
    examPeriods,
    sessionOverrides: [],
    daySchedules: [],
    adjustments,
    _cancelIndex: buildCancelIndex(adjustments),
    orientationOnFirstDay: true,
  };
  return { ctx, adjustments, holidays, examPeriods, displayCutoff, timetables, extraLessons };
}

function run(sysOpts = {}) {
  const merged = mergeHighSchoolSheets([{ name: "10-11月", parsed: parseHighSchoolSheet(sheet()) }]);
  const mapping = effectiveMapping(suggestMapping(merged.courses.values(), SLOTS).byCourse, {});
  const sys = makeSys({ slots: SLOTS, ...sysOpts });
  const result = compareSchedules({ merged, mapping, slots: SLOTS, sys });
  return { merged, mapping, sys, ...result };
}

const kinds = (findings, date) =>
  findings.filter((f) => f.date === date).map((f) => `${f.kind}:${f.courseKey}`).sort();

describe("compareSchedules", () => {
  const HOLIDAYS = [
    { id: 1, date: "2026-10-12", label: "スポーツの日", scope: ["全部"], targetGrades: [], subjKeywords: [] },
  ];

  it("予定表で休み (灰色・休校) なのにシステムで授業がある日を出す", () => {
    const { findings } = run({ holidays: HOLIDAYS });
    expect(kinds(findings, "2026-10-15")).toEqual(["needOff:高1|高松西高校"]);
    expect(kinds(findings, "2026-11-09")).toEqual(["needOff:高1|高松西高校"]);
    // 休講日が登録済みの 10/12 は食い違わない
    expect(kinds(findings, "2026-10-12")).toEqual([]);
    const f = findings.find((x) => x.date === "2026-10-15");
    expect(f.yt.label).toBe("休講 (灰色)");
    expect(f.sys.held.map((x) => x.slot.id)).toEqual([2]);
  });

  it("予定表で授業があるのにシステムで休み → 理由つきで出す (直す案は出さない)", () => {
    const { findings } = run({
      holidays: [
        ...HOLIDAYS,
        { id: 2, date: "2026-10-22", label: "高2休講", scope: ["高校部"], targetGrades: ["高2"], subjKeywords: [] },
      ],
    });
    const f = findings.find((x) => x.date === "2026-10-22");
    expect(f.kind).toBe("needOn");
    expect(f.courseKey).toBe("高2|古文・漢文");
    expect(f.sys.off[0].status.label).toBe("休講日「高2休講」");
  });

  it("いつもの曜日以外の授業 (振替) は、システムに振替が無ければ出す。注記から振替元を読む", () => {
    const { findings } = run({ holidays: HOLIDAYS });
    const f = findings.find((x) => x.date === "2026-11-06");
    expect(f).toMatchObject({ kind: "missingExtra", courseKey: "高1|高松西高校", sourceDate: "2026-11-09" });
    // 日まるごと振替を登録すれば、11/6 も 11/9 (振替で他日へ) も食い違わない
    const { findings: after } = run({
      holidays: HOLIDAYS,
      adjustments: [{ id: 1, type: "reschedule", date: "2026-11-09", slotId: 1, targetDate: "2026-11-06" }],
    });
    expect(kinds(after, "2026-11-06")).toEqual([]);
    expect(kinds(after, "2026-11-09")).toEqual([]);
  });

  it("表示期間設定の境目の近くは比べ (開講前・終講後と出す)、遠い日は比べていない期間として返す", () => {
    const displayCutoff = {
      groups: [{ label: "高1・2", grades: ["高1", "高2"], startDate: "2026-10-05", date: "2026-11-05" }],
      cohorts: [],
    };
    const { findings, courses, ungroupedGrades } = run({ holidays: HOLIDAYS, displayCutoff });
    const f = findings.find((x) => x.date === "2026-10-01");
    expect(f.kind).toBe("needOn");
    expect(f.sys.off[0].status).toMatchObject({ kind: "before-start", label: "開講前 (表示期間設定の開始日 10/5)" });
    // 終了日の 10 日後までは比べる (11/12 木) / それより後は比べない (11/16 月〜)
    expect(findings.find((x) => x.date === "2026-11-12").sys.off[0].status.label).toBe(
      "終講後 (表示期間設定の終了日 11/5)"
    );
    expect(findings.filter((x) => x.date > "2026-11-15")).toEqual([]);
    expect(courses.find((c) => c.key === "高1|高松西高校").skipped).toEqual([{ start: "2026-11-16", end: "2026-11-30" }]);
    expect(ungroupedGrades).toEqual([]);
    // 期間がまるごと遠ければ比べない (次の期の表示期間設定がまだ無いとき)
    const later = {
      groups: [{ label: "高1・2", grades: ["高1", "高2"], startDate: "2027-01-08", date: null }],
      cohorts: [],
    };
    const r = run({ holidays: HOLIDAYS, displayCutoff: later });
    expect(r.findings).toEqual([]);
    expect(r.courses.find((c) => c.key === "高1|高松西高校").skipped).toEqual([
      { start: "2026-10-01", end: "2026-11-30" },
    ]);
  });

  it("比べない講座・コマの無い講座は、比べていない期間に数えない (状態だけ返す)", () => {
    const merged = mergeHighSchoolSheets([{ name: "10-11月", parsed: parseHighSchoolSheet(sheet()) }]);
    const sugg = suggestMapping(merged.courses.values(), SLOTS).byCourse;
    const mapping = effectiveMapping(sugg, { "高1|高松西高校": { skip: true }, "高2|古文・漢文": { subjects: ["高2|古典"] } });
    const r = compareSchedules({ merged, mapping, slots: SLOTS, sys: makeSys({ slots: SLOTS, holidays: HOLIDAYS }) });
    expect(r.courses.map((c) => [c.key, c.status, c.skipped])).toEqual([
      ["高1|高松西高校", "skip", []],
      ["高2|古文・漢文", "stale", []],
    ]);
    expect(r.findings).toEqual([]);
  });

  it("振替元の注記があれば、振替元の曜日のコマが全部この日へ振り替えてあるかを見る", () => {
    const slots = [
      ...SLOTS,
      { id: 6, day: "月", time: "20:50-21:50", grade: "高1", subj: "高松西 英語", room: "701", teacher: "F" },
    ];
    const merged = mergeHighSchoolSheets([{ name: "10-11月", parsed: parseHighSchoolSheet(sheet()) }]);
    const mapping = effectiveMapping(suggestMapping(merged.courses.values(), slots).byCourse, {});
    const adjustments = [{ id: 1, type: "reschedule", date: "2026-11-09", slotId: 1, targetDate: "2026-11-06" }];
    const sys = makeSys({ slots, holidays: HOLIDAYS, adjustments });
    const { findings } = compareSchedules({ merged, mapping, slots, sys });
    // 数学だけ振り替えた: 11/6 は英語がまだ / 11/9 は英語が残っている
    const extra = findings.find((x) => x.date === "2026-11-06");
    expect(extra).toMatchObject({ kind: "missingExtra", sourceDate: "2026-11-09" });
    expect(extra.pending.map((s) => s.id)).toEqual([6]);
    const plan = buildDayPlans({ findings, merged, slots, sys }).find((p) => p.date === "2026-11-09");
    // 残った英語は休講日にせず、日まるごと振替へ
    expect(plan.fix.holidays).toEqual([]);
    expect(plan.moves).toEqual([{ targetDate: "2026-11-06", slots: [expect.objectContaining({ id: 6 })] }]);
  });

  it("振替元の日が休講日で休みなら、日まるごと振替では移せないと分かるように返す", () => {
    const holidays = [
      ...HOLIDAYS,
      { id: 2, date: "2026-11-09", label: "休校", scope: ["高校部"], targetGrades: [], subjKeywords: [] },
    ];
    const { findings } = run({ holidays });
    const f = findings.find((x) => x.date === "2026-11-06");
    expect(f.pending).toEqual([]);
    expect(f.sourceOff.map((x) => [x.slot.id, x.status.label])).toEqual([[1, "休講日「休校」"]]);
    expect(kinds(findings, "2026-11-09")).toEqual([]);
  });

  it("いつもの曜日以外の日でも、その曜日のシステムのコマで授業があれば食い違いにしない", () => {
    const slots = [
      ...SLOTS,
      { id: 7, day: "金", time: "19:40-20:40", grade: "高1", subj: "高松西 理科", room: "701", teacher: "G" },
    ];
    const merged = mergeHighSchoolSheets([{ name: "10-11月", parsed: parseHighSchoolSheet(sheet()) }]);
    const sugg = suggestMapping(merged.courses.values(), slots).byCourse;
    const mapping = effectiveMapping(sugg, {
      "高1|高松西高校": { subjects: ["高1|高松西 数学", "高1|高松西 英語", "高1|高松西 理科"] },
    });
    const sys = makeSys({ slots, holidays: HOLIDAYS });
    const { findings } = compareSchedules({ merged, mapping, slots, sys });
    expect(kinds(findings, "2026-11-06")).toEqual([]);
  });

  it("学年グループに入っていない学年を知らせる", () => {
    const displayCutoff = { groups: [{ label: "高1", grades: ["高1"], startDate: null, date: null }], cohorts: [] };
    expect(run({ holidays: HOLIDAYS, displayCutoff }).ungroupedGrades).toEqual(["高2"]);
  });
});

describe("systemSlotStatus", () => {
  const slot = { id: 9, day: "木", grade: "高2", subj: "古文漢文", time: "19:40-20:40" };
  it("テスト期間・コマ休講・時間割の期間外を理由にする", () => {
    const exam = makeSys({
      slots: [slot],
      examPeriods: [{ id: 1, name: "中間", startDate: "2026-10-01", endDate: "2026-10-31", targetGrades: ["高2"] }],
    });
    expect(systemSlotStatus(slot, "2026-10-15", exam)).toMatchObject({ held: false, kind: "exam" });
    const adj = [{ id: 1, type: "cancel", date: "2026-10-15", slotId: 9, memo: "行事" }];
    expect(systemSlotStatus(slot, "2026-10-15", makeSys({ slots: [slot], adjustments: adj }))).toMatchObject({
      held: false,
      kind: "cancel",
      label: "コマ休講 (行事)",
    });
    const tt = [{ id: 1, name: "1学期", startDate: "2026-04-01", endDate: "2026-07-31", grades: [] }];
    expect(systemSlotStatus(slot, "2026-10-15", makeSys({ slots: [slot], timetables: tt }))).toMatchObject({
      kind: "timetable",
    });
    expect(systemSlotStatus(slot, "2026-10-15", makeSys({ slots: [slot] }))).toMatchObject({ held: true });
  });
});

describe("proposeFixes", () => {
  const S = (id, grade, subj, day = "木") => ({ id, day, grade, subj, time: "19:00-20:00" });

  it("その日の高校部のコマが全部休みなら、高校部の休講日 1 件", () => {
    const r = proposeFixes({ date: "2026-10-28", offSlots: [S(1, "高1", "高松西 数学")], keepSlots: [S(9, "中2", "数学")] });
    expect(r.holidays).toEqual([
      { date: "2026-10-28", label: "休講 (予定表)", scope: ["高校部"], targetGrades: [], subjKeywords: [] },
    ]);
    expect(r.cancels).toEqual([]);
  });

  it("学年まるごと休みなら学年、一部なら対象クラス (頭の語)", () => {
    const r = proposeFixes({
      date: "2026-10-15",
      offSlots: [S(1, "高1", "高松一 英語"), S(2, "高1", "高松桜井 数学"), S(3, "高2", "古文漢文")],
      keepSlots: [S(4, "高1", "高松西 数学"), S(5, "高3", "共テ世界史")],
    });
    expect(r.holidays).toEqual([
      { date: "2026-10-15", label: "休講 (予定表)", scope: ["高校部"], targetGrades: ["高2"], subjKeywords: [] },
      {
        date: "2026-10-15",
        label: "休講 (予定表)",
        scope: ["高校部"],
        targetGrades: ["高1"],
        subjKeywords: ["高松一", "高松桜井"],
      },
    ]);
  });

  it("頭の語だと残したいコマに当たるときは科目名そのもの、それも当たればコマ休講", () => {
    const r = proposeFixes({
      date: "2026-09-09",
      offSlots: [S(1, "高2", "高松一 英語"), S(2, "高2", "高松一 英語選抜")],
      keepSlots: [S(3, "高2", "高松一 物理")],
    });
    expect(r.holidays[0].subjKeywords).toEqual(["高松一 英語"]);
    const r2 = proposeFixes({
      date: "2026-09-09",
      offSlots: [S(1, "高2", "高松一 英語")],
      keepSlots: [S(3, "高2", "高松一 英語選抜")],
    });
    expect(r2.holidays).toEqual([]);
    expect(r2.cancels).toEqual([{ date: "2026-09-09", slotId: 1, memo: "予定表チェック" }]);
  });

  it("代行・時間割調整のあるコマにはコマ休講を置かず、手で直す扱い", () => {
    const r = proposeFixes({
      date: "2026-09-09",
      offSlots: [S(1, "高2", "高松一 英語")],
      keepSlots: [S(3, "高2", "高松一 英語選抜")],
      subs: [{ id: 1, date: "2026-09-09", slotId: 1, originalTeacher: "A", substitute: "B" }],
    });
    expect(r.cancels).toEqual([]);
    expect(r.manual).toEqual([{ slot: expect.objectContaining({ id: 1 }), reason: "sub" }]);
  });

  it("休講日で止めるコマに代行・合同があれば注意として返す (休講日の案はそのまま)", () => {
    const r = proposeFixes({
      date: "2026-10-28",
      offSlots: [S(1, "高1", "高松西 数学")],
      keepSlots: [],
      adjustments: [{ id: 5, type: "combine", date: "2026-10-28", slotId: 1, combineSlotIds: [2] }],
    });
    expect(r.holidays).toHaveLength(1);
    expect(r.cautions).toEqual([{ slot: expect.objectContaining({ id: 1 }), reason: "adjustment" }]);
  });

  it("1 語の科目名は頭の 2 文字 / 括弧の前 / 科目名そのものの順で選ぶ", () => {
    const r = proposeFixes({
      date: "2026-08-28",
      offSlots: [S(1, "高3", "共テ英語(Hi)", "金")],
      keepSlots: [S(2, "高3", "共テ英語(St)", "金")],
    });
    expect(r.holidays[0].subjKeywords).toEqual(["共テ英語(Hi)"]);
  });
});

describe("buildDayPlans", () => {
  it("日ごとにまとめ、振替元の日は休講日にせず日まるごと振替へ回す", () => {
    const { findings, merged, sys } = run();
    const plans = buildDayPlans({ findings, merged, slots: SLOTS, sys });
    // 11/9 (休校) は予定表で 11/6 へ振り替えている → 休講日の案は出さない
    const p = plans.find((x) => x.date === "2026-11-09");
    expect(p.fix.holidays).toEqual([]);
    expect(p.moves).toEqual([{ targetDate: "2026-11-06", slots: [expect.objectContaining({ id: 1 })] }]);
    const q = plans.find((x) => x.date === "2026-10-15");
    // 木曜は高2 のコマ (古文漢文・高松西 英語) と中2 が残るので、高1 だけ
    expect(q.fix.holidays).toEqual([
      { date: "2026-10-15", label: "休講 (予定表)", scope: ["高校部"], targetGrades: ["高1"], subjKeywords: [] },
    ]);
    expect(plans.find((x) => x.date === "2026-11-06").extras).toHaveLength(1);
  });

  it("休校の行の文字を休講日の名前に使う", () => {
    // 11/9 の振替の注記が無い表 (振替元にならない) で
    const plain = mergeHighSchoolSheets([{ name: "10-11月", parsed: parseHighSchoolSheet(sheet({ withMove: false })) }]);
    const mapping = effectiveMapping(suggestMapping(plain.courses.values(), SLOTS).byCourse, {});
    const sys = makeSys({ slots: SLOTS });
    const { findings } = compareSchedules({ merged: plain, mapping, slots: SLOTS, sys });
    const p = buildDayPlans({ findings, merged: plain, slots: SLOTS, sys }).find((x) => x.date === "2026-11-09");
    expect(p.fix.holidays).toEqual([
      { date: "2026-11-09", label: "休校", scope: ["高校部"], targetGrades: [], subjKeywords: [] },
    ]);
  });

  it("今たまたま休みのコマ (テスト期間など) にも休講日の案を当てない", () => {
    const slots = [
      { id: 1, day: "月", time: "19:40-20:40", grade: "高1", subj: "高松西 数学" },
      { id: 9, day: "月", time: "19:40-20:40", grade: "高3", subj: "共テ英語(Hi)" },
    ];
    const sys = makeSys({
      slots,
      examPeriods: [{ id: 1, name: "高3 模試", startDate: "2026-10-19", endDate: "2026-10-19", targetGrades: ["高3"] }],
    });
    const findings = [
      {
        date: "2026-10-19",
        courseKey: "高1|高松西高校",
        kind: "needOff",
        yt: { status: "cancelled", label: "休講 (灰色)" },
        sys: { held: [{ slot: slots[0] }], off: [] },
      },
    ];
    const [plan] = buildDayPlans({ findings, merged: null, slots, sys });
    // 高3 は今テスト期間で休みだが、高校部まるごとの休講日にはしない
    expect(plan.fix.holidays.map((h) => h.targetGrades)).toEqual([["高1"]]);
    expect(plan.keepSlots.map((s) => s.id)).toEqual([9]);
  });
});

describe("parseSourceDate", () => {
  it("注記の「12/7(月)の振替」から年つきの日付", () => {
    expect(parseSourceDate(["←12/7(月)の振替→"], "2026-12-04")).toBe("2026-12-07");
    expect(parseSourceDate(["←1/4の振替"], "2026-12-28")).toBe("2027-01-04");
    expect(parseSourceDate(["休講 →"], "2026-12-04")).toBeNull();
  });
});

// ─── 追加授業 ─────────────────────────────────────────────────────

// 7 月の高1・高2 プレップ (土曜の講座)。7/17 (金)・7/21 (火)・7/22 (水) は夏期講習のプレップ
function prepSheet() {
  return makeSheet("2026 H1H2【7月】", (s) => {
    s.set(1, 1, "2026年度 【高1・高2ゼミ】 7月予定表");
    s.set(4, 3, "高1・高2");
    s.set(6, 3, "高予備プレップ");
    const map = s.month({ year: 2026, month: 7, dayCol: 1, firstRow: 7, labelRow: 3 });
    for (const [iso, r] of map) {
      if (weekdayIndexOf(iso) === 6 || ["2026-07-17", "2026-07-21", "2026-07-22"].includes(iso)) s.set(r, 3, "★");
    }
  });
}
const PREP_SLOTS = [{ id: 21, day: "土", time: "13:00-15:00", grade: "高1高2", subj: "高予備プレップ", room: "" }];
const PREP_EXTRAS = ["2026-07-17", "2026-07-21", "2026-07-22"].map((date, i) => ({
  id: i + 1,
  date,
  time: "13:00-16:00",
  grade: "中1-高3",
  subj: "プレップ",
  teacher: "A",
  label: "夏期講習",
}));

function runPrep(sysOpts = {}) {
  const merged = mergeHighSchoolSheets([{ name: "7月", parsed: parseHighSchoolSheet(prepSheet()) }]);
  const mapping = effectiveMapping(suggestMapping(merged.courses.values(), PREP_SLOTS).byCourse, {});
  const sys = makeSys({ slots: PREP_SLOTS, ...sysOpts });
  return compareSchedules({ merged, mapping, slots: PREP_SLOTS, sys });
}

describe("追加授業も授業ありとして数える", () => {
  it("学年は部をまたぐ範囲も広げ、科目名はどちらかが含めば当たり", () => {
    const course = { grades: ["高1", "高2"], name: "高予備プレップ" };
    expect(extraLessonMatchesCourse(PREP_EXTRAS[0], course, PREP_SLOTS)).toBe(true);
    // 学年が重ならない / 科目名が当たらない / 1 文字だけ
    expect(extraLessonMatchesCourse({ ...PREP_EXTRAS[0], grade: "中1-3" }, course, PREP_SLOTS)).toBe(false);
    expect(extraLessonMatchesCourse({ ...PREP_EXTRAS[0], subj: "英語" }, course, PREP_SLOTS)).toBe(false);
    expect(extraLessonMatchesCourse({ ...PREP_EXTRAS[0], subj: "プ" }, course, PREP_SLOTS)).toBe(false);
    // 講座と違う学年のコマを選んだ講座は、コマの学年でも当てる
    const sl = { grades: ["高1", "高2"], name: "Speaking/Listening" };
    const slSlots = [{ grade: "高3", subj: "SpeakingListening" }];
    expect(extraLessonMatchesCourse({ grade: "高3", subj: "SpeakingListening 補講" }, sl, slSlots)).toBe(true);
  });

  it("いつもの曜日以外の授業 (夏期のプレップ) は、追加授業があれば食い違いにしない", () => {
    const without = runPrep();
    expect(without.findings.filter((f) => f.kind === "missingExtra").map((f) => f.date)).toEqual([
      "2026-07-17",
      "2026-07-21",
      "2026-07-22",
    ]);
    expect(runPrep({ extraLessons: PREP_EXTRAS }).findings).toEqual([]);
  });

  it("いつもの曜日でも、システムのコマが休みの日に追加授業があれば食い違いにしない", () => {
    const holidays = [{ id: 1, date: "2026-07-18", label: "高校部休講", scope: ["高校部"], targetGrades: [], subjKeywords: [] }];
    expect(runPrep({ holidays, extraLessons: PREP_EXTRAS }).findings.map((f) => `${f.date}:${f.kind}`)).toEqual([
      "2026-07-18:needOn",
    ]);
    const extra = { ...PREP_EXTRAS[0], id: 9, date: "2026-07-18" };
    expect(runPrep({ holidays, extraLessons: [...PREP_EXTRAS, extra] }).findings).toEqual([]);
  });
});

// ─── 休講日の例外・不定期のコマ ──────────────────────────────────

describe("休講日の例外 (この日はこのコマだけ授業あり)", () => {
  const HOLS = [
    { id: 1, date: "2026-10-12", label: "スポーツの日", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    { id: 2, date: "2026-10-22", label: "高2休講", scope: ["高校部"], targetGrades: ["高2"], subjKeywords: [] },
  ];

  it("休講日で休みのコマを案にし、例外にすれば食い違いが消える。元に戻すと戻る", () => {
    const { findings } = run({ holidays: HOLS });
    const f = findings.find((x) => x.date === "2026-10-22");
    expect(f.kind).toBe("needOn");
    const targets = holidayExceptionTargets(f);
    expect(targets.map((s) => s.id)).toEqual([3]);
    const { next, changedIds } = addHolidayException(HOLS, targets[0], "2026-10-22");
    expect(changedIds).toEqual([2]);
    expect(next[1].excludeSlotIds).toEqual([3]);
    expect(run({ holidays: next }).findings.find((x) => x.date === "2026-10-22")).toBeUndefined();
    // 元に戻す: 足した休講日からだけ外し、空になったキーは消す
    const back = dropHolidayException(next, changedIds, 3);
    expect(back).toEqual(HOLS);
    // 前からあった例外は残す
    const withOld = [{ ...HOLS[0], excludeSlotIds: [3] }, next[1]];
    expect(dropHolidayException(withOld, [2], 3)[0].excludeSlotIds).toEqual([3]);
  });

  it("休講日以外の理由 (テスト期間など) で休みのコマは例外の案にしない", () => {
    const f = {
      sys: {
        off: [
          { slot: { id: 1 }, status: { kind: "exam" } },
          { slot: { id: 2 }, status: { kind: "holiday" } },
        ],
      },
    };
    expect(holidayExceptionTargets(f).map((s) => s.id)).toEqual([2]);
  });
});

describe("不定期のコマ", () => {
  const IRR = SLOTS.map((s) => (s.id === 3 ? { ...s, irregular: true, onlyDates: ["2026-10-01", "2026-10-08"] } : s));
  const runIrr = (slots) => {
    const merged = mergeHighSchoolSheets([{ name: "10-11月", parsed: parseHighSchoolSheet(sheet()) }]);
    const mapping = effectiveMapping(suggestMapping(merged.courses.values(), slots).byCourse, {});
    return compareSchedules({ merged, mapping, slots, sys: makeSys({ slots, holidays: [] }) });
  };

  it("実施日でない日は理由つきで出し、表示期間の外の扱い (比べていない期間) にはしない", () => {
    const r = runIrr(IRR);
    const f = r.findings.find((x) => x.date === "2026-10-15" && x.courseKey === "高2|古文・漢文");
    expect(f.kind).toBe("needOn");
    expect(f.sys.off[0].status).toMatchObject({ kind: "irregular", label: IRREGULAR_OFF_LABEL });
    expect(r.courses.find((c) => c.key === "高2|古文・漢文").skipped).toEqual([]);
  });

  it("実施日に加える / 外す", () => {
    const added = withOnlyDate(IRR, [3, 1], "2026-10-15", true);
    expect(added.find((s) => s.id === 3).onlyDates).toEqual(["2026-10-01", "2026-10-08", "2026-10-15"]);
    // 毎週のコマは変えない
    expect(added.find((s) => s.id === 1)).toBe(IRR.find((s) => s.id === 1));
    expect(runIrr(added).findings.find((x) => x.date === "2026-10-15" && x.courseKey === "高2|古文・漢文")).toBeUndefined();
    expect(withOnlyDate(added, [3], "2026-10-15", false).find((s) => s.id === 3).onlyDates).toEqual([
      "2026-10-01",
      "2026-10-08",
    ]);
  });
});

// ─── 比べていない期間のまとめ / 振替元の案内 ─────────────────────

describe("groupSkippedRanges", () => {
  it("学年の組ごとに、重なる・続く期間を 1 つにまとめて講座の数を添える", () => {
    const courses = new Map([
      ["a", { family: "高3" }],
      ["b", { family: "高3" }],
      ["c", { family: "高3" }],
      ["d", { family: "高1・高2" }],
    ]);
    const summaries = [
      { key: "a", skipped: [{ start: "2026-12-25", end: "2026-12-31" }] },
      { key: "b", skipped: [{ start: "2026-12-26", end: "2026-12-31" }] },
      { key: "c", skipped: [{ start: "2026-12-25", end: "2026-12-31" }] },
      { key: "d", skipped: [{ start: "2026-12-25", end: "2026-12-31" }] },
      { key: "x", skipped: [{ start: "2026-01-01", end: "2026-01-02" }] }, // 講座が無い
    ];
    expect(groupSkippedRanges(summaries, courses)).toEqual([
      { family: "高1・高2", start: "2026-12-25", end: "2026-12-31", courseCount: 1, partial: false },
      { family: "高3", start: "2026-12-25", end: "2026-12-31", courseCount: 3, partial: true },
    ]);
    // 離れた期間は分ける
    const two = groupSkippedRanges(
      [{ key: "a", skipped: [{ start: "2026-08-01", end: "2026-08-10" }, { start: "2026-12-25", end: "2026-12-31" }] }],
      courses
    );
    expect(two.map((t) => `${t.start}〜${t.end}`)).toEqual(["2026-08-01〜2026-08-10", "2026-12-25〜2026-12-31"]);
  });
});

describe("buildDayPlans (確認済みを除いたとき)", () => {
  it("振替先の日を確認済みにしても、振替元の日は休講日にせず振替の案内のまま", () => {
    const { findings, merged, sys } = run();
    const open = findings.filter((f) => f.date !== "2026-11-06");
    const p = buildDayPlans({ findings: open, allFindings: findings, merged, slots: SLOTS, sys }).find(
      (x) => x.date === "2026-11-09"
    );
    expect(p.fix.holidays).toEqual([]);
    expect(p.moves).toHaveLength(1);
  });
});
