import { describe, expect, it } from "vitest";
import { makeEventHelpers } from "../../components/views/dashboardHelpers";
import { buildCancelIndex } from "../slotCancel";
import { buildDayPlans, compareSchedules, parseSourceDate, proposeFixes, systemSlotStatus } from "./compare";
import { effectiveMapping, suggestMapping } from "./courseMapping";
import { mergeHighSchoolSheets, parseHighSchoolSheet } from "./highSchoolSheet";
import { SMALL_SLOTS as SLOTS, smallH12Sheet as sheet } from "./testUtils";

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

  it("表示期間の外の学期は比べず、学期の中で開講日より前の日は「開講前」と出す", () => {
    const displayCutoff = {
      groups: [{ label: "高1・2", grades: ["高1", "高2"], startDate: "2026-10-05", date: "2026-11-30" }],
      cohorts: [],
    };
    const { findings, ungroupedGrades } = run({ holidays: HOLIDAYS, displayCutoff });
    const f = findings.find((x) => x.date === "2026-10-01");
    expect(f.kind).toBe("needOn");
    expect(f.sys.off[0].status.kind).toBe("before-start");
    expect(ungroupedGrades).toEqual([]);
    // 学期がまるごと表示期間の外なら比べない
    const later = {
      groups: [{ label: "高1・2", grades: ["高1", "高2"], startDate: "2027-01-08", date: null }],
      cohorts: [],
    };
    const r = run({ holidays: HOLIDAYS, displayCutoff: later });
    expect(r.findings).toEqual([]);
    expect(r.courses.find((c) => c.key === "高1|高松西高校").skippedTerms).toHaveLength(1);
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
      { date: "2026-10-28", label: "休講", scope: ["高校部"], targetGrades: [], subjKeywords: [] },
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
      { date: "2026-10-15", label: "休講", scope: ["高校部"], targetGrades: ["高2"], subjKeywords: [] },
      { date: "2026-10-15", label: "休講", scope: ["高校部"], targetGrades: ["高1"], subjKeywords: ["高松一", "高松桜井"] },
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
    expect(r.manual).toEqual([{ slot: expect.objectContaining({ id: 1 }), reason: "代行・欠勤の登録がある" }]);
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
  it("日ごとにまとめ、休校の行の文字を休講日の名前に使う", () => {
    const { findings, merged, sys } = run();
    const plans = buildDayPlans({ findings, merged, slots: SLOTS, sys });
    const p = plans.find((x) => x.date === "2026-11-09");
    // 月曜は高1 高松西 数学だけ → 高校部まるごと (中学部のコマは無い)
    expect(p.fix.holidays).toEqual([
      { date: "2026-11-09", label: "休校", scope: ["高校部"], targetGrades: [], subjKeywords: [] },
    ]);
    const q = plans.find((x) => x.date === "2026-10-15");
    // 木曜は高2 のコマ (古文漢文・高松西 英語) と中2 が残るので、高1 だけ
    expect(q.fix.holidays).toEqual([
      { date: "2026-10-15", label: "休講", scope: ["高校部"], targetGrades: ["高1"], subjKeywords: [] },
    ]);
    expect(plans.find((x) => x.date === "2026-11-06").extras).toHaveLength(1);
  });
});

describe("parseSourceDate", () => {
  it("注記の「12/7(月)の振替」から年つきの日付", () => {
    expect(parseSourceDate(["←12/7(月)の振替→"], "2026-12-04")).toBe("2026-12-07");
    expect(parseSourceDate(["←1/4の振替"], "2026-12-28")).toBe("2027-01-04");
    expect(parseSourceDate(["休講 →"], "2026-12-04")).toBeNull();
  });
});
