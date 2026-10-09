import { describe, expect, it } from "vitest";
import { cellText, isGrayFill, isRedFill, isYellowFill, makeGrid } from "./sheetGrid";
import { parseHighSchoolSheet } from "./highSchoolSheet";
import { smallH12Sheet } from "./testUtils";

describe("塗りの色の判定", () => {
  it("休講の灰色: 旧パレットの灰色と、Excel 2007 以降の「白 + 黒 15〜50%」。ごく薄い灰色は含めない", () => {
    for (const c of ["#969696", "#c0c0c0", "#808080", "#7f7f7f", "#a6a6a6", "#bfbfbf", "#d9d9d9"]) {
      expect(isGrayFill(c), c).toBe(true);
    }
    for (const c of ["#f2f2f2", "#e7e6e6", "#ffffff", "#000000", "#595959", "#c0c0ff", null]) {
      expect(isGrayFill(c), c).toBe(false);
    }
  });

  it("休校の赤: 赤・薄い赤 (ffcccc)。橙は含めない", () => {
    for (const c of ["#ff8080", "#ff7c80", "#ffcccc", "#ff0000"]) expect(isRedFill(c), c).toBe(true);
    for (const c of ["#ff9900", "#ff6600", "#ed7d31", "#ffcc99", "#ffff00", "#ff99cc"]) {
      expect(isRedFill(c), c).toBe(false);
    }
  });

  it("変更の黄色", () => {
    expect(isYellowFill("#ffff00")).toBe(true);
    expect(isYellowFill("#ffcc00")).toBe(true);
    expect(isYellowFill("#ffff99")).toBe(false);
  });
});

describe("makeGrid", () => {
  it("結合は左上のセルで代表し、壊れた結合 (逆向き) は捨てる", () => {
    const g = makeGrid({
      rows: [[{ t: "s", v: "休校", fill: "#ff8080" }, { t: "z", v: null, fill: null }], [null, { t: "s", v: "x" }]],
      merges: [
        { r0: 0, c0: 0, r1: 0, c1: 1 },
        { r0: 1, c0: 5, r1: 0, c1: 1 },
      ],
    });
    expect(g.text(0, 1)).toBe("休校");
    expect(g.fill(0, 1)).toBe("#ff8080");
    expect(g.isAnchor(0, 1)).toBe(false);
    expect(g.text(1, 1)).toBe("x");
    expect(g.cells().map(([r, c]) => `${r},${c}`)).toEqual(["0,0", "0,1", "1,1"]);
  });

  it("曜日だけの書式のセルは曜日の文字として読む", () => {
    expect(cellText({ t: "n", v: 46304, wd: "金" })).toBe("金");
  });

  it("遠いセル・シート全体を覆う結合があっても固まらない (升目をなめない)", () => {
    const sheet = smallH12Sheet();
    (sheet.rows[1048575] ||= [])[16383] = { t: "z", v: null, fill: "#969696" };
    sheet.merges.push({ r0: 30, c0: 40, r1: 1048575, c1: 16383 });
    const t = Date.now();
    const parsed = parseHighSchoolSheet(sheet);
    expect(Date.now() - t).toBeLessThan(3000);
    // 表の外の遠いセル・結合は、予定表の読み取りに影響しない
    expect(parsed.range).toEqual({ start: "2026-10-01", end: "2026-11-30" });
    expect([...parsed.courses.keys()]).toEqual(["高1|高松西高校", "高2|古文・漢文"]);
  });
});
