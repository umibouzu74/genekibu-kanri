import { describe, expect, it } from "vitest";
import {
  analyzeWorkbook,
  defaultSheetSelection,
  fiscalYearRange,
  overlappingSelections,
  selectedInMergeOrder,
} from "./sheetSelection";
import { makeSheet, smallH12Sheet } from "./testUtils";

const calendar = makeSheet("年間カレンダー", (s) => s.set(0, 0, "2026年度 年間カレンダー"));
const middle = makeSheet("中3", (s) => s.set(0, 0, "2026年度 中3 予定表"));

describe("analyzeWorkbook", () => {
  it("高校部のシートだけ読み、他は種類だけ返す", () => {
    const sheets = analyzeWorkbook({ sheets: [calendar, smallH12Sheet(), middle] });
    expect(sheets.map((s) => [s.index, s.kind])).toEqual([
      [0, "calendar"],
      [1, "high"],
      [2, "middle"],
    ]);
    expect(sheets[1].parsed.range).toEqual({ start: "2026-10-01", end: "2026-11-30" });
    expect(sheets[0].parsed).toBeNull();
  });
});

describe("fiscalYearRange", () => {
  it("4 月始まりの年度", () => {
    expect(fiscalYearRange("2026-10-09")).toEqual({ start: "2026-04-01", end: "2027-03-31" });
    expect(fiscalYearRange("2027-03-31")).toEqual({ start: "2026-04-01", end: "2027-03-31" });
  });
});

describe("defaultSheetSelection", () => {
  const book = (names) =>
    analyzeWorkbook({
      sheets: names.map((n) => (typeof n === "string" ? smallH12Sheet({ name: n }) : smallH12Sheet(n))),
    });

  it("今年度のシートだけ選ぶ (前の年度のシートは選ばない)", () => {
    const sheets = book([{ name: "2025 H1H2【10-11月】教員用", year: 2025 }, "2026 H1H2【10-11月】教員用"]);
    expect([...defaultSheetSelection(sheets, "2026-10-09")]).toEqual([1]);
  });

  it("同じ学年の組で期間が重なれば 1 枚だけ: 教員用 → 改訂 → 左の順", () => {
    expect([...defaultSheetSelection(book(["H1H2 生徒用", "H1H2 教員用"]), "2026-10-09")]).toEqual([1]);
    expect([...defaultSheetSelection(book(["H1H2 教員用", "H1H2 改訂 教員用"]), "2026-10-09")]).toEqual([1]);
    expect([...defaultSheetSelection(book(["H1H2 (1)", "H1H2 (2)"]), "2026-10-09")]).toEqual([0]);
  });
});

describe("selectedInMergeOrder / overlappingSelections", () => {
  it("両方選ぶと教員用を先に使い、重なりとして知らせる", () => {
    const sheets = analyzeWorkbook({
      sheets: [smallH12Sheet({ name: "H1H2 生徒用" }), smallH12Sheet({ name: "H1H2 教員用" })],
    });
    const selected = new Set([0, 1]);
    expect(selectedInMergeOrder(sheets, selected).map((s) => s.name)).toEqual(["H1H2 教員用", "H1H2 生徒用"]);
    const overlaps = overlappingSelections(sheets, selected);
    expect(overlaps.map((o) => [o.first.name, o.second.name])).toEqual([["H1H2 教員用", "H1H2 生徒用"]]);
    expect(overlappingSelections(sheets, new Set([0]))).toEqual([]);
  });
});
