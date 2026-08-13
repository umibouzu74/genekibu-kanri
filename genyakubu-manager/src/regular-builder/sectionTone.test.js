import { describe, expect, it } from "vitest";
import { sectionDeptRank, sectionTone } from "./sectionTone";

const tab = (grade, name = grade) => ({ grade, name });

describe("sectionTone", () => {
  it("全学年が中学系なら中学部の色", () => {
    expect(sectionTone([tab("中1"), tab("中3"), tab("附中")]).accent).toBe("#4a9a4a");
  });

  it("全学年が高校系なら高校部の色", () => {
    expect(sectionTone([tab("高1"), tab("高3")]).accent).toBe("#c08a2a");
  });

  it("混在は中立色", () => {
    expect(sectionTone([tab("中3"), tab("高1")]).accent).toBe("#607080");
  });

  it("grade 未設定のタブは name で判定する", () => {
    expect(sectionTone([{ name: "高卒" }]).accent).toBe("#c08a2a");
  });
});

describe("sectionDeptRank", () => {
  it("中学部 → 混在 → 高校部 の順", () => {
    expect(sectionDeptRank([tab("中1")])).toBe(0);
    expect(sectionDeptRank([tab("中1"), tab("高1")])).toBe(1);
    expect(sectionDeptRank([tab("高1")])).toBe(2);
  });
});
