// 期間内の授業時間 (分) の集計 (utils/teachingMinutes)。
import { describe, expect, it } from "vitest";
import {
  computeTeachingMinutes,
  formatMinutes,
  lessonMinutes,
  minutesToHours,
  monthPeriod,
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
    const { rows, days } = run({
      slots: [mk(1), mk(2, { day: "木", time: "18:00-18:45" })],
    });
    expect(days).toBe(7);
    const r = rows.get("奥村");
    expect(r.total).toBe(80 + 45);
    expect(r.count).toBe(2);
    expect(r.days.size).toBe(2);
    expect(r.byKind.own).toBe(125);
  });

  it("複数講師のコマは全員に分が付く", () => {
    const { rows } = run({ slots: [mk(1, { teacher: "香川·福江・川井" })] });
    expect(rows.get("香川").total).toBe(80);
    expect(rows.get("福江").total).toBe(80);
    expect(rows.get("川井").total).toBe(80);
  });

  it("休講 (isOffForGrade) の日は数えない", () => {
    const { rows } = run({
      slots: [mk(1)],
      isOffForGrade: (d) => d === "2026-09-07",
    });
    expect(rows.get("奥村")).toBeUndefined();
  });

  it("代行は代行者に付き、元講師からは外れる。代行者が空の欠勤は誰にも付かない", () => {
    const slots = [mk(1), mk(2, { day: "火", teacher: "西岡" })];
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "奥村", substitute: "福江", status: "confirmed" },
      { id: 2, date: "2026-09-08", slotId: 2, originalTeacher: "西岡", substitute: "", status: "requested" },
    ];
    const { rows } = run({ slots, subs });
    expect(rows.get("奥村")).toBeUndefined();
    expect(rows.get("西岡")).toBeUndefined();
    const f = rows.get("福江");
    expect(f.byKind.sub).toBe(80);
    expect(f.unconfirmed).toBe(0);
    expect(f.entries[0].originalTeacher).toBe("奥村");
  });

  it("未確定の代行も代行者で数え、件数を残す", () => {
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "奥村", substitute: "福江", status: "requested" },
    ];
    const { rows } = run({ slots: [mk(1)], subs });
    expect(rows.get("福江").unconfirmed).toBe(1);
  });

  it("コマ移動・特別時程の実効時刻で数える", () => {
    const adjustments = [{ id: 1, type: "move", date: "2026-09-07", slotId: 1, targetTime: "19:00-19:50" }];
    const { rows } = run({ slots: [mk(1)], adjustments });
    expect(rows.get("奥村").total).toBe(50);
  });

  it("コマ休講は数えない", () => {
    const adjustments = [{ id: 1, type: "cancel", date: "2026-09-07", slotId: 1 }];
    const { rows } = run({ slots: [mk(1)], adjustments });
    expect(rows.get("奥村")).toBeUndefined();
  });

  it("振替は振替先の日に数える (targetTeacher があればその人)", () => {
    const adjustments = [
      { id: 1, type: "reschedule", date: "2026-09-07", slotId: 1, targetDate: "2026-09-11", targetTime: "17:00-18:00" },
      { id: 2, type: "reschedule", date: "2026-09-07", slotId: 2, targetDate: "2026-09-12", targetTeacher: "河野" },
    ];
    const { rows } = run({ slots: [mk(1), mk(2, { teacher: "堀上" })], adjustments });
    const o = rows.get("奥村");
    expect(o.total).toBe(60);
    expect(o.entries[0].date).toBe("2026-09-11");
    expect(o.entries[0].rescheduledFrom).toBe("2026-09-07");
    expect(rows.get("堀上")).toBeUndefined();
    expect(rows.get("河野").total).toBe(80);
  });

  it("合同で吸収された側の講師には付かない", () => {
    const adjustments = [{ id: 1, type: "combine", date: "2026-09-07", slotId: 1, combineSlotIds: [2] }];
    const { rows } = run({ slots: [mk(1), mk(2, { cls: "B", teacher: "堀上" })], adjustments });
    expect(rows.get("奥村").total).toBe(80);
    expect(rows.get("堀上")).toBeUndefined();
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
    const { rows } = run({ slots, timetables });
    expect(rows.get("奥村").total).toBe(45);
  });

  it("追加授業と講習は種別を分けて数える (講習の external は数えない)", () => {
    const extraLessons = [
      { id: 1, date: "2026-09-13", time: "10:00-11:30", grade: "中3", subj: "数学", teacher: "奥村" },
    ];
    const koshuLessons = [
      { kind: "koshu", date: "2026-09-12", time: "13:00-13:45", teacher: "奥村", grade: "中3", cls: "S", subj: "数学" },
      { kind: "external", date: "2026-09-12", time: "15:00-16:00", teacher: "奥村", subj: "予備校" },
    ];
    const { rows } = run({ slots: [], extraLessons, koshuLessons });
    const r = rows.get("奥村");
    expect(r.byKind.extra).toBe(90);
    expect(r.byKind.koshu).toBe(45);
    expect(r.total).toBe(135);
  });

  it("終了時刻の読めないコマは分を足さずに件数を残す", () => {
    const { rows } = run({ slots: [mk(1, { time: "19:00" })] });
    const r = rows.get("奥村");
    expect(r.total).toBe(0);
    expect(r.count).toBe(1);
    expect(r.noTime).toBe(1);
  });

  it("隔週コマは担当週の講師に付く", () => {
    // アンカー無し = 毎週 A 週 (主担当)
    const { rows } = run({ slots: [mk(1, { teacher: "堀上", note: "隔週(河野)" })] });
    expect(rows.get("堀上").total).toBe(80);
    expect(rows.get("河野")).toBeUndefined();
  });

  it("CSV の行を作る", () => {
    const { rows } = run({ slots: [mk(1)] });
    const s = teachingMinutesSummaryRows(rows, ["奥村", "居ない人"]);
    expect(s.body).toEqual([["奥村", 80, 1.33, 80, 0, 0, 0, 1, 1, 0]]);
    const d = teachingMinutesDetailRows(rows, ["奥村"]);
    expect(d.body[0]).toEqual(["奥村", "2026-09-07", "月", "19:00-20:20", 80, "通常授業", "中2A 数学", ""]);
  });
});

describe("monthPeriod", () => {
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
});
