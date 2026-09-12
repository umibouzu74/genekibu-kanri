import { describe, expect, it } from "vitest";
import {
  hasSubstitute,
  isUnresolved,
  matchesSubStateFilter,
  needsSubstitute,
  SUB_STATE_FILTERS,
  subState,
  subStateMeta,
  subTargetLabel,
  summarizeOpenSubs,
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

describe("未処理 (isUnresolved / summarizeOpenSubs)", () => {
  it("未処理は代行未定と依頼中だけ。代行なしで確定は対応済み", () => {
    expect(isUnresolved(mk("", "requested"))).toBe(true);
    expect(isUnresolved(mk("杉原", "requested"))).toBe(true);
    expect(isUnresolved(mk("", "confirmed"))).toBe(false);
    expect(isUnresolved(mk("杉原", "confirmed"))).toBe(false);
    expect(isUnresolved(null)).toBe(false);
  });

  it("今日以降と過去に分け、今日以降は未定 / 依頼中の内訳を数える", () => {
    const subs = [
      { ...mk("", "requested"), id: 1, date: "2026-09-01" }, // 過去の未定
      { ...mk("杉原", "requested"), id: 2, date: "2026-09-12" }, // 今日の依頼中
      { ...mk("", "requested"), id: 3, date: "2026-09-20" }, // 未来の未定
      { ...mk("", "confirmed"), id: 4, date: "2026-09-20" }, // 代行なし (数えない)
      { ...mk("杉原", "confirmed"), id: 5, date: "2026-09-01" }, // 確定 (数えない)
    ];
    const r = summarizeOpenSubs(subs, "2026-09-12");
    expect(r.upcoming.map((s) => s.id)).toEqual([2, 3]);
    expect(r.past.map((s) => s.id)).toEqual([1]);
    expect(r.upcomingPending).toBe(1);
    expect(r.upcomingRequested).toBe(1);
  });

  it("subs が空でも壊れない", () => {
    expect(summarizeOpenSubs([], "2026-09-12").upcoming).toEqual([]);
    expect(summarizeOpenSubs(undefined, "2026-09-12").past).toEqual([]);
  });
});

describe("代行一覧の状態フィルタ (matchesSubStateFilter)", () => {
  it("空キーは全部通す", () => {
    expect(matchesSubStateFilter(mk("", "confirmed"), "")).toBe(true);
  });

  it("open は未処理だけ、状態キーはその状態だけ", () => {
    expect(matchesSubStateFilter(mk("", "requested"), "open")).toBe(true);
    expect(matchesSubStateFilter(mk("", "confirmed"), "open")).toBe(false);
    expect(matchesSubStateFilter(mk("", "requested"), "pending")).toBe(true);
    expect(matchesSubStateFilter(mk("杉原", "requested"), "pending")).toBe(false);
    // 旧 2 値のキー (requested / confirmed) もそのまま当たる
    expect(matchesSubStateFilter(mk("杉原", "requested"), "requested")).toBe(true);
    expect(matchesSubStateFilter(mk("杉原", "confirmed"), "confirmed")).toBe(true);
    expect(matchesSubStateFilter(mk("", "confirmed"), "confirmed")).toBe(false);
    expect(matchesSubStateFilter(mk("", "confirmed"), "nosub")).toBe(true);
  });

  it("フィルタ一覧は未処理 + 4 状態", () => {
    expect(SUB_STATE_FILTERS.map((f) => f.key)).toEqual([
      "open",
      "pending",
      "requested",
      "confirmed",
      "nosub",
    ]);
  });
});
