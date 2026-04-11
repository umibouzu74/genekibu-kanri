import { describe, expect, it } from "vitest";
import { formatBiweeklyTeacher } from "./biweekly";

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
