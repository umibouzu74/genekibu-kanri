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

describe("getWeekType with multi-anchor", () => {
  const anchors = [
    { date: "2026-04-06", weekType: "A" },
    { date: "2026-06-08", weekType: "A" },
  ];

  it("returns A for an anchor date itself", () => {
    expect(getWeekType("2026-04-06", anchors)).toBe("A");
    expect(getWeekType("2026-06-08", anchors)).toBe("A");
  });

  it("returns B for one week after an anchor", () => {
    expect(getWeekType("2026-04-13", anchors)).toBe("B");
    expect(getWeekType("2026-06-15", anchors)).toBe("B");
  });

  it("uses the most recent anchor on or before the target date", () => {
    // 2026-06-10 (Wed) is in the same week as anchor 2026-06-08 → A
    expect(getWeekType("2026-06-10", anchors)).toBe("A");
    // 2026-06-22 is 2 weeks after anchor 2026-06-08 → A
    expect(getWeekType("2026-06-22", anchors)).toBe("A");
  });

  it("uses the first anchor for dates between anchor 1 and anchor 2", () => {
    // 2026-05-04 uses anchor 2026-04-06: 4 weeks diff → A
    expect(getWeekType("2026-05-04", anchors)).toBe("A");
    // 2026-05-11 uses anchor 2026-04-06: 5 weeks diff → B
    expect(getWeekType("2026-05-11", anchors)).toBe("B");
  });

  it("handles dates before all anchors (uses earliest anchor backward)", () => {
    // 2026-03-30 is 1 week before 2026-04-06 → B
    expect(getWeekType("2026-03-30", anchors)).toBe("B");
    // 2026-03-23 is 2 weeks before 2026-04-06 → A
    expect(getWeekType("2026-03-23", anchors)).toBe("A");
  });

  it("single anchor matches old single-base behavior", () => {
    const single = [{ date: "2026-04-06", weekType: "A" }];
    expect(getWeekType("2026-04-06", single)).toBe("A");
    expect(getWeekType("2026-04-08", single)).toBe("A");
    expect(getWeekType("2026-04-13", single)).toBe("B");
    expect(getWeekType("2026-04-20", single)).toBe("A");
    expect(getWeekType("2026-03-30", single)).toBe("B");
  });

  it("returns null for empty anchors array", () => {
    expect(getWeekType("2026-04-06", [])).toBeNull();
  });

  it("returns null for null/undefined anchors", () => {
    expect(getWeekType("2026-04-06", null)).toBeNull();
    expect(getWeekType("2026-04-06", undefined)).toBeNull();
  });

  it("backward compat: accepts a string as second argument", () => {
    expect(getWeekType("2026-04-06", "2026-04-06")).toBe("A");
    expect(getWeekType("2026-04-13", "2026-04-06")).toBe("B");
    expect(getWeekType("2026-04-06", "")).toBeNull();
  });

  it("handles Golden Week correction scenario", () => {
    // Without correction: single base 2026-04-06
    // 2026-06-15 is 10 weeks from base → A (even)
    expect(getWeekType("2026-06-15", "2026-04-06")).toBe("A");

    // With correction anchor at 2026-06-08:
    // 2026-06-15 is 1 week from anchor 2026-06-08 → B
    expect(getWeekType("2026-06-15", anchors)).toBe("B");
    // This demonstrates that the second anchor can shift the A/B assignment
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
