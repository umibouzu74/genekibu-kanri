import { describe, expect, it } from "vitest";
import {
  EXAM_PERIOD_TSV_HEADER,
  buildImportedExamPeriods,
  examPeriodSources,
  parseExamDateList,
  parseExamPeriodImport,
  parseStopsClasses,
} from "./examPeriodImport";
import { isExamPeriod } from "./schema";
import { SCHOOL_EXAM_TSV } from "./testdata/schoolSchedule2026";

const HEAD = EXAM_PERIOD_TSV_HEADER.join("\t");

describe("付録 B (2026 年度の桜井・第一) をそのまま貼る", () => {
  const { rows, header } = parseExamPeriodImport(SCHOOL_EXAM_TSV, { fiscalYear: 2026 });

  it("12 行すべて OK", () => {
    expect(header).toBe(true);
    expect(rows.map((r) => r.status)).toEqual(Array(12).fill("ok"));
  });

  it("開始日 = 発表日、終了日 = 最後の考査日、タグ = 学校、授業は止めない", () => {
    const kimatsu = rows.find((r) => r.event.name === "桜井2学期期末").event;
    expect(kimatsu).toEqual({
      name: "桜井2学期期末",
      startDate: "2026-11-19",
      endDate: "2026-12-02",
      targetGrades: ["高1", "高2", "高3"],
      stopsClasses: false,
      tags: ["桜井"],
      examDates: ["2026-11-26", "2026-11-27", "2026-11-30", "2026-12-01", "2026-12-02"],
      source: "2026桜井年間行事計画",
    });
    // 発表日が学年で違う 2 行は別のテスト期間 (重複にしない)
    const ki = rows.filter((r) => r.event.name === "桜井1学期期末").map((r) => r.event);
    expect(ki.map((e) => [e.startDate, e.targetGrades.join("・")])).toEqual([
      ["2026-06-22", "高2"],
      ["2026-06-25", "高1・高3"],
    ]);
  });

  it("id を振るとバックアップの検証を通る形", () => {
    const list = buildImportedExamPeriods(rows, { startId: 10 });
    expect(list.map((e) => e.id)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    expect(list.every(isExamPeriod)).toBe(true);
  });

  it("同じ学校・名称・発表日は重複 (登録済み・表の中の 2 回目)", () => {
    const existing = buildImportedExamPeriods(rows, { startId: 1 }).slice(0, 1);
    const again = parseExamPeriodImport(SCHOOL_EXAM_TSV, { fiscalYear: 2026, existing });
    expect(again.rows.filter((r) => r.status === "duplicate").map((r) => r.line)).toEqual([2]);
  });
});

describe("1 行の読み方", () => {
  const one = (line, opts = { fiscalYear: 2026 }) => parseExamPeriodImport(`${HEAD}\n${line}`, opts).rows[0];

  it("年の無い日付は年度から補い、終了日を書けばそれを使う。授業を止める「する」", () => {
    const r = one("西\t西高 学年末\t2/12\t2/19、2/22\t2/26\t高1・高2\tする");
    expect(r.status).toBe("ok");
    expect(r.event).toMatchObject({
      startDate: "2027-02-12",
      endDate: "2027-02-26",
      examDates: ["2027-02-19", "2027-02-22"],
      stopsClasses: true,
      tags: ["西"],
    });
  });

  it("発表日が空なら最初の考査日から。考査日も空なら終了日は開始日", () => {
    expect(one("桜井\t卒業考査\t\t1/12,1/13\t\t高3\t").event).toMatchObject({
      startDate: "2027-01-12",
      endDate: "2027-01-13",
    });
    const noDates = one("桜井\t考査\t10/6\t\t10/16\t\t");
    expect(noDates.event).toMatchObject({ startDate: "2026-10-06", endDate: "2026-10-16" });
    expect(noDates.event).not.toHaveProperty("examDates");
  });

  it("読めないものはエラーの理由を出す", () => {
    expect(one("桜井\t\t10/6\t10/13\t\t\t").error).toBe("名称が空です");
    expect(one("桜井\tx\t10/6\t10/13,10/40\t\t\t").error).toBe("考査日「10/40」が読めません");
    expect(one("桜井\tx\t\t\t\t\t").error).toBe("発表日か考査日を入れてください");
    expect(one("桜井\tx\t10/14\t10/13\t\t\t").error).toBe("考査日が発表日より前です");
    expect(one("桜井\tx\t10/6\t10/13,10/16\t10/15\t\t").error).toBe("終了日が最後の考査日より前です");
    expect(one("桜井\tx\t10/6\t10/13\t\t高9\t").error).toBe("学年「高9」が読めません");
    expect(one("桜井\tx\t10/6\t10/13\t\t\t多分").error).toBe("授業を止める「多分」が読めません (する / しない)");
  });

  it("出典の欄が空なら、ダイアログで入れた出典を付ける", () => {
    expect(one("桜井\tx\t10/6\t10/13\t\t\t", { fiscalYear: 2026, source: "2026桜井" }).event.source).toBe("2026桜井");
  });
});

describe("部品", () => {
  it("授業を止める: 空 = しない", () => {
    expect(parseStopsClasses("")).toBe(false);
    expect(parseStopsClasses("しない")).toBe(false);
    expect(parseStopsClasses("する")).toBe(true);
    expect(parseStopsClasses("〇")).toBe(true);
    expect(parseStopsClasses("?")).toBeNull();
  });

  it("考査日の並びを整える", () => {
    expect(parseExamDateList("2026-05-20,2026-05-19、5/19", 2026)).toEqual({
      dates: ["2026-05-19", "2026-05-20"],
    });
  });

  it("出典ごとの件数", () => {
    expect(
      examPeriodSources([{ source: "b" }, { source: "a" }, { source: "b" }, {}])
    ).toEqual([
      { source: "a", count: 1 },
      { source: "b", count: 2 },
    ]);
  });
});
