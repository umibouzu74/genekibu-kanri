import { describe, expect, it } from "vitest";
import { parseDateQuery } from "./parseDateQuery";

const TODAY = "2026-09-12";

describe("parseDateQuery", () => {
  it("年付き / 年なし / 4 桁を日付に読む", () => {
    expect(parseDateQuery("2026-09-24", TODAY)).toBe("2026-09-24");
    expect(parseDateQuery("2026/9/24", TODAY)).toBe("2026-09-24");
    expect(parseDateQuery("9/24", TODAY)).toBe("2026-09-24");
    expect(parseDateQuery("9-24", TODAY)).toBe("2026-09-24");
    expect(parseDateQuery("0924", TODAY)).toBe("2026-09-24");
  });

  it("年なしで 3 か月より前になる日付は来年に読む", () => {
    expect(parseDateQuery("1/10", TODAY)).toBe("2027-01-10");
    expect(parseDateQuery("3/5", "2026-01-15")).toBe("2026-03-05");
    // 3 か月以内の過去は今年のまま
    expect(parseDateQuery("8/1", TODAY)).toBe("2026-08-01");
  });

  it("日付でない文字列 / 存在しない日は null", () => {
    expect(parseDateQuery("香川", TODAY)).toBe(null);
    expect(parseDateQuery("13/1", TODAY)).toBe(null);
    expect(parseDateQuery("2/30", TODAY)).toBe(null);
    expect(parseDateQuery("", TODAY)).toBe(null);
    expect(parseDateQuery("12", TODAY)).toBe(null);
  });
});
