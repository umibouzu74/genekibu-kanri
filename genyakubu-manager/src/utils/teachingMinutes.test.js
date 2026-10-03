// 期間内の授業時間 (分) の集計 (utils/teachingMinutes)。
import { describe, expect, it } from "vitest";
import {
  computeTeachingMinutes,
  currentPeriodYm,
  formatMinutes,
  lessonMinutes,
  MINUTE_KINDS,
  minutesToHours,
  monthPeriod,
  summarizeTeacherRow,
  teachingMinutesDetailRows,
  teachingMinutesSummaryRows,
} from "./teachingMinutes";

// 2026-09-07 (月) 〜 2026-09-13 (日)
const START = "2026-09-07";
const END = "2026-09-13";

const mk = (id, o = {}) => ({
  id,
  day: "月",
  time: "19:00-20:20",
  grade: "中2",
  cls: "A",
  room: "601",
  subj: "数学",
  teacher: "奥村",
  note: "",
  ...o,
});

const run = (o) => computeTeachingMinutes({ startDate: START, endDate: END, ...o });
// 講師 1 人の合計 (全種別)
const sum = (result, name) => summarizeTeacherRow(result.rows.get(name));

describe("lessonMinutes / formatMinutes", () => {
  it("開始-終了の差を分で返す", () => {
    expect(lessonMinutes("19:00-20:20")).toBe(80);
    expect(lessonMinutes("9:30-10:15")).toBe(45);
  });
  it("終了が無い・読めないものは null", () => {
    expect(lessonMinutes("19:00")).toBeNull();
    expect(lessonMinutes("3限")).toBeNull();
    expect(lessonMinutes("20:00-19:00")).toBeNull();
  });
  it("時間と分で表示する", () => {
    expect(formatMinutes(45)).toBe("45分");
    expect(formatMinutes(120)).toBe("2時間");
    expect(formatMinutes(150)).toBe("2時間30分");
    expect(minutesToHours(150)).toBe(2.5);
  });
});

describe("computeTeachingMinutes", () => {
  it("期間内の曜日ごとにコマの分を合計する", () => {
    const result = run({
      slots: [mk(1), mk(2, { day: "木", time: "18:00-18:45" })],
    });
    expect(result.days).toBe(7);
    expect(sum(result, "奥村")).toEqual({ total: 125, count: 2, days: 2, noTime: 0, unconfirmed: 0 });
    expect(result.rows.get("奥村").byKind.own).toBe(125);
  });

  it("複数講師のコマは全員に分が付く", () => {
    const result = run({ slots: [mk(1, { teacher: "香川·福江・川井" })] });
    expect(sum(result, "香川").total).toBe(80);
    expect(sum(result, "福江").total).toBe(80);
    expect(sum(result, "川井").total).toBe(80);
  });

  it("休講 (isOffForGrade) の日は数えない", () => {
    const { rows } = run({
      slots: [mk(1)],
      isOffForGrade: (d) => d === "2026-09-07",
    });
    expect(rows.get("奥村")).toBeUndefined();
  });

  it("代行は代行者に付き、元講師からは外れる。代行なしで確定した欠勤は誰にも付かない", () => {
    const slots = [mk(1), mk(2, { day: "火", teacher: "西岡" })];
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "奥村", substitute: "福江", status: "confirmed" },
      { id: 2, date: "2026-09-08", slotId: 2, originalTeacher: "西岡", substitute: "", status: "confirmed" },
    ];
    const result = run({ slots, subs });
    expect(result.rows.get("奥村")).toBeUndefined();
    expect(result.rows.get("西岡")).toBeUndefined();
    expect(result.rows.get("福江").byKind.sub).toBe(80);
    expect(sum(result, "福江").unconfirmed).toBe(0);
    expect(result.rows.get("福江").entries[0].originalTeacher).toBe("奥村");
    // 代行なし (残りの担当者で回す) は意図どおりなので知らせない
    expect(result.pendingAbsences).toEqual([]);
  });

  it("代行未定のままの欠勤は誰にも付けず、一覧で知らせる", () => {
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "奥村", substitute: "", status: "requested" },
    ];
    const result = run({ slots: [mk(1)], subs });
    expect(result.rows.get("奥村")).toBeUndefined();
    expect(result.pendingAbsences).toEqual([
      { date: "2026-09-07", time: "19:00-20:20", label: "中2A 数学", teacher: "奥村" },
    ]);
  });

  it("未確定の代行も代行者で数え、件数を残す", () => {
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "奥村", substitute: "福江", status: "requested" },
    ];
    expect(sum(run({ slots: [mk(1)], subs }), "福江").unconfirmed).toBe(1);
  });

  it("代行者が元講師と同じレコードは担当のまま (通常授業) として数える", () => {
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "奥村", substitute: "奥村", status: "confirmed" },
    ];
    const { rows } = run({ slots: [mk(1)], subs });
    expect(rows.get("奥村").byKind).toMatchObject({ own: 80, sub: 0 });
  });

  it("多担任コマは休んだ人だけ外し、代行者が残りの担当と同じなら 1 回だけ数える", () => {
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "香川", substitute: "福江", status: "confirmed" },
    ];
    const result = run({ slots: [mk(1, { teacher: "香川·福江·川井" })], subs });
    expect(result.rows.get("香川")).toBeUndefined();
    expect(sum(result, "福江")).toMatchObject({ total: 80, count: 1 });
    expect(sum(result, "川井").total).toBe(80);
  });

  it("コマ移動・特別時程の実効時刻で数える", () => {
    const adjustments = [{ id: 1, type: "move", date: "2026-09-07", slotId: 1, targetTime: "19:00-19:50" }];
    expect(sum(run({ slots: [mk(1)], adjustments }), "奥村").total).toBe(50);
    const daySchedules = [
      {
        id: 1,
        date: "2026-09-07",
        targetGrades: ["中2"],
        label: "50分授業",
        timeMap: [{ from: "19:00-20:20", to: "17:00-17:50" }],
        cancelTimes: [],
      },
    ];
    expect(sum(run({ slots: [mk(1)], daySchedules }), "奥村").total).toBe(50);
  });

  it("コマ休講・特別時程の部分休講は数えない", () => {
    const adjustments = [{ id: 1, type: "cancel", date: "2026-09-07", slotId: 1 }];
    expect(run({ slots: [mk(1)], adjustments }).rows.get("奥村")).toBeUndefined();
    const daySchedules = [
      { id: 1, date: "2026-09-07", targetGrades: ["中2"], label: "1限カット", timeMap: [], cancelTimes: ["19:00-20:20"] },
    ];
    expect(run({ slots: [mk(1)], daySchedules }).rows.get("奥村")).toBeUndefined();
  });

  it("振替は振替先の日に数える (targetTeacher があればその人)", () => {
    const adjustments = [
      { id: 1, type: "reschedule", date: "2026-09-07", slotId: 1, targetDate: "2026-09-11", targetTime: "17:00-18:00" },
      { id: 2, type: "reschedule", date: "2026-09-07", slotId: 2, targetDate: "2026-09-12", targetTeacher: "河野" },
    ];
    const result = run({ slots: [mk(1), mk(2, { teacher: "堀上" })], adjustments });
    const o = result.rows.get("奥村");
    expect(sum(result, "奥村").total).toBe(60);
    expect(o.entries[0].date).toBe("2026-09-11");
    expect(o.entries[0].rescheduledFrom).toBe("2026-09-07");
    expect(result.rows.get("堀上")).toBeUndefined();
    expect(sum(result, "河野").total).toBe(80);
  });

  it("振替で入ってくる隔週コマは、振替元の週の担当に付く", () => {
    // 8/31 (月) が A 週 → 9/7 は B 週 = パートナー (河野) の週
    const adjustments = [
      { id: 1, type: "reschedule", date: "2026-09-07", slotId: 1, targetDate: "2026-09-11" },
    ];
    const result = run({
      slots: [mk(1, { teacher: "堀上", note: "隔週(河野)" })],
      adjustments,
      biweeklyAnchors: [{ date: "2026-08-31" }],
    });
    expect(result.rows.get("堀上")).toBeUndefined();
    expect(sum(result, "河野").total).toBe(80);
  });

  it("合同で吸収された側の講師には付かない", () => {
    const adjustments = [{ id: 1, type: "combine", date: "2026-09-07", slotId: 1, combineSlotIds: [2] }];
    const result = run({ slots: [mk(1), mk(2, { cls: "B", teacher: "堀上" })], adjustments });
    expect(sum(result, "奥村").total).toBe(80);
    expect(result.rows.get("堀上")).toBeUndefined();
  });

  it("時間割の有効期間外の日は数えない", () => {
    const timetables = [
      { id: 1, name: "1学期", startDate: "2026-04-01", endDate: "2026-09-08", grades: [] },
      { id: 2, name: "2学期", startDate: "2026-09-09", grades: [] },
    ];
    const slots = [
      mk(1, { day: "木", timetableId: 1 }),
      mk(2, { day: "木", timetableId: 2, time: "19:00-19:45" }),
    ];
    expect(sum(run({ slots, timetables }), "奥村").total).toBe(45);
  });

  it("追加授業と講習は種別を分けて数える (講習の external は数えない)", () => {
    const extraLessons = [
      { id: 1, date: "2026-09-13", time: "10:00-11:30", grade: "中3", subj: "数学", teacher: "奥村" },
    ];
    const koshuLessons = [
      { kind: "koshu", date: "2026-09-12", time: "13:00-13:45", teacher: "奥村", grade: "中3", cls: "S", subj: "数学" },
      { kind: "external", date: "2026-09-12", time: "15:00-16:00", teacher: "奥村", subj: "予備校" },
    ];
    const result = run({ slots: [], extraLessons, koshuLessons });
    const r = result.rows.get("奥村");
    expect(r.byKind.extra).toBe(90);
    expect(r.byKind.koshu).toBe(45);
    expect(sum(result, "奥村").total).toBe(135);
  });

  it("特訓シフトは校時ごとに数える (テスト期間の外の日・期間外の日は数えない)", () => {
    const examPeriods = [{ id: 7, name: "2学期中間", startDate: "2026-09-10", endDate: "2026-09-20" }];
    const examPrepSchedules = [
      {
        examPeriodId: 7,
        days: [
          {
            date: "2026-09-12",
            periods: [
              { no: 1, start: "13:00", end: "14:30" },
              { no: 2, start: "14:40", end: "16:10" },
            ],
            assignments: { 奥村: [1, 2], 福江: [2] },
          },
          // テスト期間より前の日 (月間カレンダーにも出ない)
          { date: "2026-09-09", periods: [{ no: 1, start: "13:00", end: "14:00" }], assignments: { 奥村: [1] } },
          // 集計期間 (〜9/13) の外
          { date: "2026-09-19", periods: [{ no: 1, start: "13:00", end: "14:00" }], assignments: { 奥村: [1] } },
        ],
      },
    ];
    const result = run({ slots: [], examPeriods, examPrepSchedules });
    expect(result.rows.get("奥村").byKind.prep).toBe(180);
    expect(result.rows.get("奥村").entries[0].label).toBe("2学期中間 特訓 1校時");
    expect(sum(result, "福江").total).toBe(90);
  });

  it("終了時刻の読めないコマは分を足さずに件数を残す", () => {
    expect(sum(run({ slots: [mk(1, { time: "19:00" })] }), "奥村")).toMatchObject({
      total: 0,
      count: 1,
      noTime: 1,
    });
  });

  it("隔週コマは担当週の講師に付く", () => {
    // アンカー無し = 週を決められないので主担当
    const slot = mk(1, { teacher: "堀上", note: "隔週(河野)" });
    const plain = run({ slots: [slot] });
    expect(sum(plain, "堀上").total).toBe(80);
    expect(plain.rows.get("河野")).toBeUndefined();
    // 8/31 が A 週 → 9/7 は B 週 = パートナー
    const anchored = run({ slots: [slot], biweeklyAnchors: [{ date: "2026-08-31" }] });
    expect(anchored.rows.get("堀上")).toBeUndefined();
    expect(sum(anchored, "河野").total).toBe(80);
  });
});

describe("summarizeTeacherRow (合計に含める種別)", () => {
  const result = run({
    slots: [mk(1)],
    koshuLessons: [
      { kind: "koshu", date: "2026-09-12", time: "13:00-13:45", teacher: "奥村", grade: "中3", subj: "数学" },
    ],
  });
  const row = result.rows.get("奥村");

  it("選んだ種別だけで合計・コマ数・出勤日数を出す", () => {
    expect(summarizeTeacherRow(row)).toMatchObject({ total: 125, count: 2, days: 2 });
    expect(summarizeTeacherRow(row, ["own"])).toMatchObject({ total: 80, count: 1, days: 1 });
    expect(summarizeTeacherRow(row, new Set(["koshu"]))).toMatchObject({ total: 45, days: 1 });
  });

  it("行が無ければ 0", () => {
    expect(summarizeTeacherRow(undefined)).toEqual({
      total: 0,
      count: 0,
      days: 0,
      noTime: 0,
      unconfirmed: 0,
    });
  });

  it("CSV: 選んだ講師は授業が無くても 0 で出し、種別の列は全種別", () => {
    const s = teachingMinutesSummaryRows(result.rows, ["奥村", "居ない人"], ["own"]);
    expect(s.headers).toHaveLength(3 + MINUTE_KINDS.length + 3);
    expect(s.body).toEqual([
      ["奥村", 80, 1.33, 80, 0, 0, 45, 0, 1, 1, 0],
      ["居ない人", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    const d = teachingMinutesDetailRows(result.rows, ["奥村"], ["own"]);
    expect(d.body).toEqual([
      ["奥村", "2026-09-07", "月", "19:00-20:20", 80, "通常授業", "中2A 数学", "", "○"],
      ["奥村", "2026-09-12", "土", "13:00-13:45", 45, "講習", "中3 数学", "", ""],
    ]);
  });
});

describe("monthPeriod / currentPeriodYm", () => {
  it("末日締めは 1 日〜末日", () => {
    expect(monthPeriod(2026, 2, 0)).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
  });
  it("20 日締めは前月 21 日〜当月 20 日 (年をまたぐ)", () => {
    expect(monthPeriod(2026, 1, 20)).toEqual({ startDate: "2025-12-21", endDate: "2026-01-20" });
  });
  it("締め日が月の日数を超えるときは末日で締める", () => {
    expect(monthPeriod(2026, 3, 30)).toEqual({ startDate: "2026-03-01", endDate: "2026-03-30" });
    expect(monthPeriod(2026, 2, 30)).toEqual({ startDate: "2026-01-31", endDate: "2026-02-28" });
  });
  it("今日を含む「◯月分」: 締め日を過ぎたら翌月分 (年をまたぐ)", () => {
    expect(currentPeriodYm("2026-10-03", 0)).toEqual({ y: 2026, m: 10 });
    expect(currentPeriodYm("2026-10-20", 20)).toEqual({ y: 2026, m: 10 });
    expect(currentPeriodYm("2026-10-21", 20)).toEqual({ y: 2026, m: 11 });
    expect(currentPeriodYm("2026-12-25", 20)).toEqual({ y: 2027, m: 1 });
    // 含む期間は monthPeriod と一致する
    const { y, m } = currentPeriodYm("2026-12-25", 20);
    expect(monthPeriod(y, m, 20)).toEqual({ startDate: "2026-12-21", endDate: "2027-01-20" });
  });
});
