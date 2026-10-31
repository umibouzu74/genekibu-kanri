import { describe, expect, it } from "vitest";
import { examPrepToTsv, formatPeriodNos, parseExamPrepTsv, parsePeriodNos } from "./examPrepTsv";

const EP = { id: 1, startDate: "2026-11-17", endDate: "2026-11-26" };
const P4 = [
  { no: 1, start: "18:00", end: "18:50" },
  { no: 2, start: "19:00", end: "19:50" },
  { no: 3, start: "20:00", end: "20:50" },
  { no: 4, start: "21:00", end: "21:50" },
];
const SCHEDULE = {
  examPeriodId: 1,
  days: [
    { date: "2026-11-19", periods: P4, assignments: { 石原: [1, 2, 3], 半田: [1, 2] }, staffTimes: { 半田: { from: "18:30", to: "19:30" } } },
    { date: "2026-11-20", periods: P4, assignments: { 野口: [1, 2, 3] } },
  ],
};
const NAMES = ["石原", "半田", "野口", "堀上"];

describe("特訓シフトの表 (C2)", () => {
  it("校時の並びを縮めて書き、読み戻す", () => {
    expect(formatPeriodNos([1, 2, 3, 4])).toBe("1-4");
    expect(formatPeriodNos([1, 2, 5])).toBe("1,2,5");
    expect(parsePeriodNos("1-4")).toEqual([1, 2, 3, 4]);
    expect(parsePeriodNos("1・2・5")).toEqual([1, 2, 5]);
    expect(parsePeriodNos("２〜５")).toEqual([2, 3, 4, 5]);
    expect(parsePeriodNos("x")).toBe(null);
  });

  it("書き出した表を貼り戻すと同じ内容になる (変わりません)", () => {
    const tsv = examPrepToTsv(SCHEDULE);
    expect(tsv).toContain("11/19 (木)\t半田\t1,2\t18:30\t19:30");
    const r = parseExamPrepTsv(tsv, { examPeriod: EP, schedule: SCHEDULE, candidateNames: NAMES });
    expect(r.errorCount).toBe(0);
    expect(r.days).toEqual(SCHEDULE.days);
    expect(r.summary.map((s) => s.change)).toEqual(["変わりません", "変わりません"]);
  });

  it("出勤の表だけ貼った日は出勤だけ置き換え、候補にいない名前・無い校時・時刻の逆転はエラー", () => {
    const text = [
      "日付\t講師\t校時\t来る\t帰る",
      "11/20\t野口\t1-3\t\t20:40",
      "11/20\t堀上\t1-4",
      "11/20\t誰か\t1",
      "11/20\t石原\t5",
      "11/19\t半田\t1\t19:30\t19:00",
      "12/1\t石原\t1",
    ].join("\n");
    const r = parseExamPrepTsv(text, { examPeriod: EP, schedule: SCHEDULE, candidateNames: NAMES });
    expect(r.rows.filter((x) => x.status === "error").map((x) => x.line)).toEqual([4, 5, 6, 7]);
    const d20 = r.days.find((d) => d.date === "2026-11-20");
    expect(d20.assignments).toEqual({ 野口: [1, 2, 3], 堀上: [1, 2, 3, 4] });
    expect(d20.staffTimes).toEqual({ 野口: { to: "20:40" } });
    expect(d20.periods).toBe(P4);
    // エラーの行しか無い日は置き換えない
    expect(r.days.map((d) => d.date)).toEqual(["2026-11-20"]);
  });

  it("校時の表で新しい日を作り、校時の決まっていない日の出勤はエラー", () => {
    const text = [
      "日付\t校時\t開始\t終了",
      "11/21\t1\t16:15\t17:15",
      "11/21\t2\t17:30\t18:30",
      "",
      "日付\t講師\t校時\t来る\t帰る",
      "11/21\t井上\t2\t17:40",
      "11/24\t井上\t1",
    ].join("\n");
    const r = parseExamPrepTsv(text, { examPeriod: EP, schedule: SCHEDULE, candidateNames: ["井上"] });
    const d21 = r.days.find((d) => d.date === "2026-11-21");
    expect(d21.periods).toHaveLength(2);
    expect(d21.staffTimes).toEqual({ 井上: { from: "17:40" } });
    expect(r.rows.find((x) => x.line === 7).status).toBe("error");
  });
});
