import { describe, expect, it } from "vitest";
import { formatBiweeklyTeacher, getWeekType, isBiweekly } from "./biweekly";

describe("formatBiweeklyTeacher", () => {
  it("returns the teacher alone when no biweekly note is present", () => {
    expect(formatBiweeklyTeacher("堀上", "")).toBe("堀上");
    expect(formatBiweeklyTeacher("堀上", undefined)).toBe("堀上");
    expect(formatBiweeklyTeacher("堀上", "合同")).toBe("堀上");
  });

  it("appends the biweekly partner extracted from the note", () => {
    expect(formatBiweeklyTeacher("堀上", "隔週(河野)")).toBe("堀上 / 河野");
  });

  it("handles biweekly markers surrounded by other note text", () => {
    expect(formatBiweeklyTeacher("山田", "補習, 隔週(佐藤), 要調整")).toBe(
      "山田 / 佐藤"
    );
  });
});

describe("getWeekType", () => {
  it("returns A for the base date itself", () => {
    expect(getWeekType("2026-04-06", "2026-04-06")).toBe("A");
  });

  it("returns A for dates within the same week as the base", () => {
    // base=Monday 2026-04-06, same week
    expect(getWeekType("2026-04-08", "2026-04-06")).toBe("A");
    expect(getWeekType("2026-04-12", "2026-04-06")).toBe("A");
  });

  it("returns B for the week after the base", () => {
    expect(getWeekType("2026-04-13", "2026-04-06")).toBe("B");
    expect(getWeekType("2026-04-15", "2026-04-06")).toBe("B");
  });

  it("returns A two weeks after the base", () => {
    expect(getWeekType("2026-04-20", "2026-04-06")).toBe("A");
  });

  it("handles dates before the base (negative direction)", () => {
    expect(getWeekType("2026-03-30", "2026-04-06")).toBe("B");
    expect(getWeekType("2026-03-23", "2026-04-06")).toBe("A");
  });

  it("returns null for empty or invalid inputs", () => {
    expect(getWeekType("", "2026-04-06")).toBeNull();
    expect(getWeekType("2026-04-06", "")).toBeNull();
    expect(getWeekType(null, "2026-04-06")).toBeNull();
  });
});

describe("isBiweekly", () => {
  it("detects notes containing 隔週", () => {
    expect(isBiweekly("隔週(河野)")).toBe(true);
    expect(isBiweekly("合同, 隔週")).toBe(true);
  });

  it("returns false for non-biweekly notes", () => {
    expect(isBiweekly("合同")).toBe(false);
    expect(isBiweekly("")).toBe(false);
    expect(isBiweekly(null)).toBe(false);
    expect(isBiweekly(undefined)).toBe(false);
  });
});
