// 期間内の授業時間 (分) の集計 (utils/teachingMinutes)。
import { describe, expect, it } from "vitest";
import {
  computeTeachingMinutes,
  currentPeriodYm,
  datesInRange,
  describeEntryNotes,
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
    expect(result.issues.pendingAbsences).toEqual([]);
  });

  it("代行未定のままの欠勤は誰にも付けず、一覧で知らせる", () => {
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "奥村", substitute: "", status: "requested" },
    ];
    const result = run({ slots: [mk(1)], subs });
    expect(result.rows.get("奥村")).toBeUndefined();
    expect(result.issues.pendingAbsences).toEqual([
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
    // 振替先の担当が元の担当と違えば代行として数える (元の担当を備考に)
    expect(result.rows.get("河野").entries[0]).toMatchObject({ kind: "sub", originalTeacher: "堀上" });
  });

  // 同じコマの 9/7 と 9/14 を同じ 9/19 (土) へまとめて振り替える。コマ id の
  // Map で引くと後の 1 件で上書きされ、240 分になっていた (2026-10-03)
  it("同じコマを同じ日へ 2 回振り替えたら 2 回数える", () => {
    const adjustments = [
      { id: 1, type: "reschedule", date: "2026-09-07", slotId: 1, targetDate: "2026-09-19", targetTime: "10:00-11:20" },
      { id: 2, type: "reschedule", date: "2026-09-14", slotId: 1, targetDate: "2026-09-19", targetTime: "13:00-14:20" },
    ];
    const result = computeTeachingMinutes({
      startDate: "2026-09-07",
      endDate: "2026-09-20",
      slots: [mk(1)],
      adjustments,
    });
    // 月曜 2 回は振替で出ていき、9/19 に 2 回入る = 80 × 2
    expect(sum(result, "奥村")).toMatchObject({ total: 160, count: 2, days: 1 });
  });

  // 振替先で合同にした側 (combineWith) は授業をしていないので数えない
  it("振替先で合同にした側は数えない (受け入れる側の担当だけ)", () => {
    const adjustments = [
      { id: 1, type: "reschedule", date: "2026-09-07", slotId: 1, targetDate: "2026-09-11" },
      { id: 2, type: "reschedule", date: "2026-09-07", slotId: 2, targetDate: "2026-09-11", combineWith: 1 },
    ];
    const result = run({
      slots: [mk(1), mk(2, { cls: "B", teacher: "堀上" })],
      adjustments,
    });
    expect(sum(result, "奥村").total).toBe(80);
    expect(result.rows.get("堀上")).toBeUndefined();
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

  // 全学年が表示期間の外の日 (夏休み等) でも、日付を指定して登録した振替・
  // 追加授業は行った授業。月間カレンダーには出ないが、給与から消さない
  it("表示期間外の日の振替・追加授業も数え、印を付ける", () => {
    const displayCutoff = {
      groups: [{ label: "中学部", grades: ["中2"], startDate: "2026-04-01", date: "2026-09-08" }],
    };
    const adjustments = [
      { id: 1, type: "reschedule", date: "2026-09-07", slotId: 1, targetDate: "2026-09-12" },
    ];
    const extraLessons = [
      { id: 3, date: "2026-09-13", time: "10:00-11:00", grade: "中2", subj: "補講", teacher: "奥村" },
    ];
    const result = run({ slots: [mk(1)], displayCutoff, adjustments, extraLessons });
    const entries = result.rows.get("奥村").entries;
    expect(entries.map((e) => [e.date, e.kind, !!e.outsideDisplay])).toEqual([
      ["2026-09-12", "own", true],
      ["2026-09-13", "extra", true],
    ]);
    expect(sum(result, "奥村").total).toBe(140);
  });

  it("元講師がその日の担当にいない代行は、両方に数えた上で知らせる", () => {
    // 8/31 が A 週 → 9/7 は B 週 = 河野。古いレコードは主担当 (堀上) で登録されていた
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "堀上", substitute: "福江", status: "confirmed" },
    ];
    const result = run({
      slots: [mk(1, { teacher: "堀上", note: "隔週(河野)" })],
      subs,
      biweeklyAnchors: [{ date: "2026-08-31" }],
    });
    expect(sum(result, "河野").total).toBe(80);
    expect(sum(result, "福江").total).toBe(80);
    expect(result.issues.subMismatches).toEqual([
      {
        date: "2026-09-07",
        time: "19:00-20:20",
        label: "中2A 数学",
        teacher: "堀上",
        substitute: "福江",
        activeTeachers: ["河野"],
      },
    ]);
  });

  it("元講師の名前の前後の空白は無視する (担当を外す)", () => {
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "奥村 ", substitute: "福江", status: "confirmed" },
    ];
    const result = run({ slots: [mk(1)], subs });
    expect(result.rows.get("奥村")).toBeUndefined();
    expect(result.issues.subMismatches).toEqual([]);
  });

  it("同じ講師の同じ日の授業で時間帯が重なるものは、両方に数えた上で知らせる", () => {
    const slots = [mk(1), mk(2, { cls: "B", time: "19:30-20:20" }), mk(3, { cls: "C", time: "20:20-21:00" })];
    const result = run({ slots });
    expect(sum(result, "奥村").total).toBe(80 + 50 + 40);
    // 19:00-20:20 と 19:30-20:20 だけ (20:20 開始は重ならない)
    expect(result.issues.overlaps.map((o) => [o.a.label, o.b.label])).toEqual([
      ["中2A 数学", "中2B 数学"],
    ]);
  });

  it("相手の読めない「隔週」の B 週は、主担当に数えた上で知らせる。全角括弧の相手は読める", () => {
    const anchors = [{ date: "2026-08-31" }];
    const unknown = run({ slots: [mk(1, { note: "隔週" })], biweeklyAnchors: anchors });
    expect(sum(unknown, "奥村").total).toBe(80);
    expect(unknown.issues.biweeklyUnknown).toHaveLength(1);
    const fullWidth = run({ slots: [mk(1, { note: "隔週（河野）" })], biweeklyAnchors: anchors });
    expect(sum(fullWidth, "河野").total).toBe(80);
    expect(fullWidth.issues.biweeklyUnknown).toEqual([]);
  });

  it("隔週の複合教科はその週の教科で出す", () => {
    const anchors = [{ date: "2026-08-31" }];
    const result = run({
      slots: [mk(1, { subj: "英/数", note: "隔週(河野)" })],
      biweeklyAnchors: anchors,
    });
    // 9/7 は B 週 → 2 つ目の教科
    expect(result.rows.get("河野").entries[0].label).toBe("中2A 数");
  });

  it("時刻の無い講習の 1 限と 2 限を 1 つにまとめない", () => {
    const koshuLessons = [
      { kind: "koshu", key: "a:1", date: "2026-09-12", time: null, teacher: "奥村", grade: "中3", subj: "数学" },
      { kind: "koshu", key: "a:2", date: "2026-09-12", time: null, teacher: "奥村", grade: "中3", subj: "数学" },
    ];
    const result = run({ slots: [], koshuLessons });
    expect(sum(result, "奥村")).toMatchObject({ count: 2, noTime: 2 });
    expect(result.rows.get("奥村").noTimeByKind.koshu).toBe(2);
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
    expect(s.headers).toContain("通常授業(分)");
    expect(s.headers).toContain("講習(分)(合計外)");
    expect(s.headers.at(-1)).toBe("終了時刻なし(件)");
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

describe("datesInRange", () => {
  it("開始〜終了の日付 (両端を含む)。形式違い・逆順は空", () => {
    expect(datesInRange("2026-09-29", "2026-10-01").dates).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
    expect(datesInRange("2026-10-01", "2026-09-01").dates).toEqual([]);
    expect(datesInRange("", "2026-09-01").dates).toEqual([]);
  });

  // 終了日の年に 5 桁を打たれても、全部作ってから切らない (固まらない)
  it("上限で打ち切りながら作る", () => {
    expect(datesInRange("2026-01-01", "20266-12-31")).toEqual({ dates: [], truncated: false });
    const t0 = Date.now();
    const r = datesInRange("1900-01-01", "9999-12-31", 400);
    expect(Date.now() - t0).toBeLessThan(200);
    expect(r.truncated).toBe(true);
    expect(r.dates).toHaveLength(400);
    expect(r.dates[399]).toBe("1901-02-04");
  });
});

describe("describeEntryNotes", () => {
  it("代行元・依頼中・振替元・表示期間外を並べる (画面は日付を縮める)", () => {
    const e = {
      originalTeacher: "奥村",
      unconfirmed: true,
      rescheduledFrom: "2026-10-05",
      outsideDisplay: true,
    };
    expect(describeEntryNotes(e)).toEqual([
      "奥村 の代行",
      "依頼中 (未確定)",
      "2026-10-05 (月) から振替",
      "表示期間外の日",
    ]);
    expect(describeEntryNotes(e, { short: true })[2]).toBe("10/5 (月) から振替");
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
