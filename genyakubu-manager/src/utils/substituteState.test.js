import { describe, expect, it } from "vitest";
import {
  hasSubstitute,
  needsSubstitute,
  subState,
  subStateMeta,
  subTargetLabel,
} from "./substituteState";

const mk = (substitute, status) => ({
  id: 1,
  date: "2026-09-05",
  slotId: 1,
  originalTeacher: "香川",
  substitute,
  status,
});

describe("subState", () => {
  it("代行者なし × 依頼中 = 代行を探し中", () => {
    expect(subState(mk("", "requested"))).toBe("pending");
  });

  it("代行者なし × 確定 = 代行なしで確定 (他の担当者で回す)", () => {
    expect(subState(mk("", "confirmed"))).toBe("nosub");
  });

  it("代行者あり × 依頼中 / 確定", () => {
    expect(subState(mk("杉原", "requested"))).toBe("requested");
    expect(subState(mk("杉原", "confirmed"))).toBe("confirmed");
  });

  it("レコードが無ければ null", () => {
    expect(subState(null)).toBe(null);
    expect(subState(undefined)).toBe(null);
  });

  it("status 未設定は依頼中側に倒す (従来データの互換)", () => {
    expect(subState({ substitute: "" })).toBe("pending");
    expect(subState({ substitute: "杉原" })).toBe("requested");
  });
});

describe("hasSubstitute / needsSubstitute", () => {
  it("「代行された」は substitute の有無だけで決まる", () => {
    // 代行なしで確定は confirmed だが代行はされていない
    expect(hasSubstitute(mk("", "confirmed"))).toBe(false);
    expect(hasSubstitute(mk("杉原", "requested"))).toBe(true);
  });

  it("代行を探しているのは pending だけ", () => {
    expect(needsSubstitute(mk("", "requested"))).toBe(true);
    // 代行なしで確定は探していない (玉突き代行の候補に出さない)
    expect(needsSubstitute(mk("", "confirmed"))).toBe(false);
    expect(needsSubstitute(mk("杉原", "requested"))).toBe(false);
    expect(needsSubstitute(null)).toBe(false);
  });
});

describe("表示メタ", () => {
  it("状態ごとのバッジとラベル", () => {
    expect(subStateMeta(mk("", "requested")).badge).toBe("未定");
    expect(subStateMeta(mk("", "confirmed")).badge).toBe("代行なし");
    expect(subStateMeta(mk("杉原", "confirmed")).badge).toBe("代行");
    expect(subStateMeta(null)).toBe(null);
  });

  it("代行者側に出す文字列は名前 or 状態ラベル", () => {
    expect(subTargetLabel(mk("杉原", "confirmed"))).toBe("杉原");
    expect(subTargetLabel(mk("", "requested"))).toBe("代行未定");
    expect(subTargetLabel(mk("", "confirmed"))).toBe("代行なし");
    expect(subTargetLabel(null)).toBe("");
  });
});
