import { describe, expect, it } from "vitest";
import { makeEventHelpers } from "./dashboardHelpers";

// テスト期間の「例外的に授業を行う日」(classExceptions) が
// 授業停止判定と表示用ヘルパの両方に効いているか。
const EXAM = {
  id: 1,
  name: "2学期中間テスト期間",
  startDate: "2026-09-14",
  endDate: "2026-09-25",
  targetGrades: ["中1", "中2", "中3"],
  stopsClasses: true,
  classExceptions: [{ date: "2026-09-19", grades: ["中3"], memo: "土曜のみ実施" }],
};

describe("makeEventHelpers — テスト期間の授業停止判定", () => {
  const { isInExamPeriodForGrade, isOffForGrade, examClassExceptionsFor, examPeriodsFor } =
    makeEventHelpers([], [EXAM], []);

  it("期間中は対象学年の授業を停止する", () => {
    expect(isInExamPeriodForGrade("2026-09-18", "中3")).toBe(true);
    expect(isOffForGrade("2026-09-18", "中3", "数学")).toBe(true);
  });

  it("例外日の該当学年は停止しない", () => {
    expect(isInExamPeriodForGrade("2026-09-19", "中3")).toBe(false);
    expect(isOffForGrade("2026-09-19", "中3", "数学")).toBe(false);
  });

  it("例外日でも grades 外の学年は停止したまま", () => {
    expect(isInExamPeriodForGrade("2026-09-19", "中1")).toBe(true);
  });

  it("例外日でもテスト期間そのものは表示に残る", () => {
    expect(examPeriodsFor("2026-09-19").map((ep) => ep.name)).toEqual([
      "2学期中間テスト期間",
    ]);
  });

  it("examClassExceptionsFor が表示用の学年リストを返す", () => {
    const got = examClassExceptionsFor("2026-09-19");
    expect(got).toHaveLength(1);
    expect(got[0].grades).toEqual(["中3"]);
    expect(got[0].exception.memo).toBe("土曜のみ実施");
    expect(examClassExceptionsFor("2026-09-18")).toEqual([]);
  });

  it("休講 (holiday) は例外日でも休講のまま", () => {
    const { isOffForGrade: off } = makeEventHelpers(
      [{ id: 1, date: "2026-09-19", scope: ["全部"] }],
      [EXAM],
      []
    );
    expect(off("2026-09-19", "中3", "数学")).toBe(true);
  });
});
