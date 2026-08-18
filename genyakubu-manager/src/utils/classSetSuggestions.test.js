import { describe, expect, it } from "vitest";
import {
  buildDaySplitSuggestions,
  buildSuggestions,
  pairDaysIntoCourses,
} from "../utils/classSetSuggestions";

// テスト用のスロット生成ヘルパ。授業セット提案ロジックの単体テスト用。
function makeSlot(id, grade, day, cls, time = "19:00-20:00") {
  return {
    id,
    grade,
    day,
    cls,
    time,
    room: cls || "601",
    subj: "数学",
    teacher: "T",
    note: "",
  };
}

// allUnits は (grade, day) でユニット化したもの。
function buildUnits(slots) {
  const m = new Map();
  for (const s of slots) {
    const k = `${s.grade}|${s.day}`;
    if (!m.has(k)) m.set(k, { key: k, grade: s.grade, day: s.day, slots: [] });
    m.get(k).slots.push(s);
  }
  return [...m.values()];
}

describe("buildSuggestions", () => {
  it("中3 SS/S/A/B が火木、中3 C が水金 → 2 提案 (火木 / 水金)", () => {
    const slots = [
      // SS: 火木
      makeSlot(1, "中3", "火", "SS"),
      makeSlot(2, "中3", "木", "SS"),
      // S: 火木
      makeSlot(3, "中3", "火", "S"),
      makeSlot(4, "中3", "木", "S"),
      // A: 火木
      makeSlot(5, "中3", "火", "A"),
      makeSlot(6, "中3", "木", "A"),
      // B: 火木
      makeSlot(7, "中3", "火", "B"),
      makeSlot(8, "中3", "木", "B"),
      // C: 水金
      makeSlot(9, "中3", "水", "C"),
      makeSlot(10, "中3", "金", "C"),
    ];
    const allUnits = buildUnits(slots);
    const suggestions = buildSuggestions(allUnits, [], slots);

    expect(suggestions).toHaveLength(2);
    const labels = suggestions.map((s) => s.label);
    expect(labels).toContain("中3 (火・木)");
    expect(labels).toContain("中3 (水・金)");

    const tueThu = suggestions.find((s) => s.label === "中3 (火・木)");
    // 中3 火 + 中3 木 の 2 ユニット (cohort 横断で 8 コマ含む)
    expect(tueThu.units).toHaveLength(2);
    expect(tueThu.slotCount).toBe(8);
  });

  it("全 cohort が同じ曜日パターン → 1 提案にまとまる", () => {
    const slots = [
      makeSlot(1, "中1", "火", "S"),
      makeSlot(2, "中1", "金", "S"),
      makeSlot(3, "中1", "火", "AB"),
      makeSlot(4, "中1", "金", "AB"),
    ];
    const allUnits = buildUnits(slots);
    const suggestions = buildSuggestions(allUnits, [], slots);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].label).toBe("中1 (火・金)");
    expect(suggestions[0].slotCount).toBe(4);
  });

  it("単一日にしか出現しない cohort (合同コマ等) は提案外", () => {
    const slots = [
      // S: 月木
      makeSlot(1, "中2", "月", "S"),
      makeSlot(2, "中2", "木", "S"),
      // 合同 SABC: 月のみ → 単日なので独自提案にはならない
      makeSlot(3, "中2", "月", "S/AB/C"),
    ];
    const allUnits = buildUnits(slots);
    const suggestions = buildSuggestions(allUnits, [], slots);

    // 提案は中2 (月・木) のみ。合同 SABC 単独提案は出ない。
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].label).toBe("中2 (月・木)");
    // ユニット内には月の合同コマも含まれている (cohort 横断ユニット)
    expect(suggestions[0].slotCount).toBe(3);
  });

  it("既存セットに含まれるスロットを持つユニットは提案対象から除外", () => {
    const slots = [
      makeSlot(1, "中1", "火", "S"),
      makeSlot(2, "中1", "金", "S"),
      makeSlot(3, "中2", "月", "S"),
      makeSlot(4, "中2", "木", "S"),
    ];
    const allUnits = buildUnits(slots);
    // 中1 火スロット (id=1) を既存セットに登録済みとして扱う
    const classSets = [{ id: 999, label: "既存", slotIds: [1] }];
    const suggestions = buildSuggestions(allUnits, classSets, slots);

    // 中1 (火・金) は提案外 (火ユニットが既存セット汚染で free でない)
    // 中2 (月・木) のみ提案
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].label).toBe("中2 (月・木)");
  });

  it("カバレッジが大きい提案を先頭に並べる", () => {
    const slots = [
      // 中1 火金: 4 コマ
      makeSlot(1, "中1", "火", "S"),
      makeSlot(2, "中1", "金", "S"),
      makeSlot(3, "中1", "火", "AB"),
      makeSlot(4, "中1", "金", "AB"),
      // 中2 月木: 2 コマ
      makeSlot(5, "中2", "月", "S"),
      makeSlot(6, "中2", "木", "S"),
    ];
    const allUnits = buildUnits(slots);
    const suggestions = buildSuggestions(allUnits, [], slots);

    expect(suggestions).toHaveLength(2);
    // カバレッジ順: 中1 (4 コマ) → 中2 (2 コマ)
    expect(suggestions[0].label).toBe("中1 (火・金)");
    expect(suggestions[0].slotCount).toBe(4);
    expect(suggestions[1].label).toBe("中2 (月・木)");
    expect(suggestions[1].slotCount).toBe(2);
  });

  it("複数学年が独立した曜日パターンを持つ → それぞれ提案", () => {
    const slots = [
      makeSlot(1, "中1", "火", "S"),
      makeSlot(2, "中1", "金", "S"),
      makeSlot(3, "中2", "月", "S"),
      makeSlot(4, "中2", "木", "S"),
      makeSlot(5, "中3", "火", "S"),
      makeSlot(6, "中3", "木", "S"),
    ];
    const allUnits = buildUnits(slots);
    const suggestions = buildSuggestions(allUnits, [], slots);

    const labels = suggestions.map((s) => s.label);
    expect(labels).toContain("中1 (火・金)");
    expect(labels).toContain("中2 (月・木)");
    expect(labels).toContain("中3 (火・木)");
    expect(labels).toHaveLength(3);
  });
});

describe("pairDaysIntoCourses", () => {
  it("火水木金 → 火木 / 水金 (間隔 2 日ずつ)", () => {
    expect(pairDaysIntoCourses(["火", "水", "木", "金"])).toEqual([
      ["火", "木"],
      ["水", "金"],
    ]);
  });
  it("月火木金 → 月木 / 火金 (間隔 3 日ずつ)", () => {
    expect(pairDaysIntoCourses(["月", "火", "木", "金"])).toEqual([
      ["月", "木"],
      ["火", "金"],
    ]);
  });
  it("2 日だけなら分割候補にしない (既に 1 コース)", () => {
    expect(pairDaysIntoCourses(["火", "木"])).toBe(null);
  });
  it("奇数日は分けきれないので null", () => {
    expect(pairDaysIntoCourses(["月", "火", "水"])).toBe(null);
  });
  it("月火水木 は 月水 / 火木 (隣接日どうしは組ませない)", () => {
    expect(pairDaysIntoCourses(["月", "火", "水", "木"])).toEqual([
      ["月", "水"],
      ["火", "木"],
    ]);
  });
  it("土曜を含む並びは対象外 (特訓・プレップは別コース)", () => {
    expect(pairDaysIntoCourses(["火", "水", "木", "土"])).toBe(null);
  });
});

describe("buildDaySplitSuggestions", () => {
  it("中3 が週 4 日 (火水木金) なら 火木 / 水金 の分割を提案する", () => {
    const slots = [
      makeSlot(1, "中3", "火", "S"),
      makeSlot(2, "中3", "水", "S"),
      makeSlot(3, "中3", "木", "S"),
      makeSlot(4, "中3", "金", "S"),
    ];
    const sugs = buildDaySplitSuggestions(buildUnits(slots), [], slots);
    expect(sugs).toHaveLength(1);
    expect(sugs[0].groups.map((g) => g.label)).toEqual([
      "中3 (火・木)",
      "中3 (水・金)",
    ]);
    expect(sugs[0].slotCount).toBe(4);
  });

  it("週 2 日の学年は提案しない (既定の 1 コースで正しい)", () => {
    const slots = [makeSlot(1, "中1", "火", "S"), makeSlot(2, "中1", "金", "S")];
    expect(buildDaySplitSuggestions(buildUnits(slots), [], slots)).toEqual([]);
  });

  it("土曜のコマは分割の対象日に含めない", () => {
    const slots = [
      makeSlot(1, "中3", "火", "S"),
      makeSlot(2, "中3", "水", "S"),
      makeSlot(3, "中3", "木", "S"),
      makeSlot(4, "中3", "金", "S"),
      makeSlot(5, "中3", "土", "特訓"),
    ];
    const sugs = buildDaySplitSuggestions(buildUnits(slots), [], slots);
    expect(sugs).toHaveLength(1);
    expect(sugs[0].slotCount).toBe(4); // 土曜の 1 コマは入らない
  });

  it("既にセット登録済みの学年は提案しない (units 形式のセットも見る)", () => {
    const slots = [
      makeSlot(1, "中3", "火", "S"),
      makeSlot(2, "中3", "水", "S"),
      makeSlot(3, "中3", "木", "S"),
      makeSlot(4, "中3", "金", "S"),
    ];
    const classSets = [
      {
        id: 1,
        label: "中3 (火・木)",
        units: [
          { grade: "中3", day: "火" },
          { grade: "中3", day: "木" },
        ],
      },
    ];
    expect(buildDaySplitSuggestions(buildUnits(slots), classSets, slots)).toEqual([]);
  });
});
