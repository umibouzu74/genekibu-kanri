import { describe, expect, it } from "vitest";
import {
  computeMergeLayout,
  computeRowCells,
  mergeFallback,
  splitSpan,
  visibleClassesForDay,
} from "./mergedColumns";
import { makeCellKey } from "./model";

// 中3 の取込結果を模したフィクスチャ: 通常 5 クラス + 合同 3 列
const cls = (id, label, room = "") => ({ id, label, room });
const baseTab = (over = {}) => ({
  id: 1,
  classes: [
    cls(1, "SS", "505"),
    cls(2, "S", "501"),
    cls(3, "A", "502"),
    cls(4, "B", "503"),
    cls(5, "C", "504"),
    cls(6, "SS〜C", "501"),
    cls(7, "SS〜C", "503"),
    cls(8, "S〜B", "502"),
  ],
  days: ["水"],
  periodIds: [1, 2],
  schedule: {},
  ...over,
});
const periods = [{ id: 1 }, { id: 2 }];

describe("computeMergeLayout", () => {
  it("範囲ラベルの列を表示列から外し、スパン添字を計算する", () => {
    const layout = computeMergeLayout(baseTab());
    expect(layout.visible.map((c) => c.label)).toEqual(["SS", "S", "A", "B", "C"]);
    const spans = layout.ranges.map((r) => [r.cls.label, r.startIdx, r.endIdx]);
    expect(spans).toEqual([
      ["SS〜C", 0, 4],
      ["SS〜C", 0, 4],
      ["S〜B", 1, 3],
    ]);
  });

  it("全角チルダ・半角チルダも区切りとして解釈する", () => {
    const tab = baseTab({ classes: [cls(1, "S"), cls(2, "B"), cls(3, "S～B"), cls(4, "S~B")] });
    const layout = computeMergeLayout(tab);
    expect(layout.ranges).toHaveLength(2);
  });

  it("端点が見つからない・逆順のラベルは通常の列として残す", () => {
    const tab = baseTab({
      classes: [cls(1, "S"), cls(2, "B"), cls(3, "X〜Y"), cls(4, "B〜S")],
    });
    const layout = computeMergeLayout(tab);
    expect(layout.visible.map((c) => c.label)).toEqual(["S", "B", "X〜Y", "B〜S"]);
    expect(layout.ranges).toHaveLength(0);
  });

  it("スラッシュ列挙 (S/AB) も合同列として結合する — 合同列が先頭にあってもよい", () => {
    // 中1 の取込結果: S/AB 列が先頭に来る
    const tab = baseTab({
      classes: [cls(1, "S/AB", "601"), cls(2, "S", "602"), cls(3, "AB", "601")],
    });
    const layout = computeMergeLayout(tab);
    expect(layout.visible.map((c) => c.label)).toEqual(["S", "AB"]);
    expect(layout.ranges.map((r) => [r.cls.label, r.startIdx, r.endIdx])).toEqual([
      ["S/AB", 0, 1],
    ]);
  });

  it("3 クラスの列挙 (S/AB/C) も結合する", () => {
    const tab = baseTab({
      classes: [cls(1, "S"), cls(2, "AB"), cls(3, "C"), cls(4, "S/AB/C"), cls(5, "AB/C")],
    });
    const layout = computeMergeLayout(tab);
    expect(layout.visible.map((c) => c.label)).toEqual(["S", "AB", "C"]);
    expect(layout.ranges.map((r) => [r.cls.label, r.startIdx, r.endIdx])).toEqual([
      ["S/AB/C", 0, 2],
      ["AB/C", 1, 2],
    ]);
  });

  it("隙間を挟む列挙 (S/C) や未知クラスの列挙は通常の列のまま", () => {
    const tab = baseTab({
      classes: [cls(1, "S"), cls(2, "A"), cls(3, "C"), cls(4, "S/C"), cls(5, "S/X")],
    });
    const layout = computeMergeLayout(tab);
    // S/C は間に A を挟む (colSpan が A も合同に見えるため結合しない)
    expect(layout.visible.map((c) => c.label)).toEqual(["S", "A", "C", "S/C", "S/X"]);
    expect(layout.ranges).toHaveLength(0);
  });
});

describe("mergeFallback", () => {
  it("範囲セルだけの行は結合表示できる (フォールバックしない)", () => {
    const tab = baseTab({
      schedule: { [makeCellKey("水", 2, 8)]: { subj: "確認テスト", teacher: "藤田" } },
    });
    const layout = computeMergeLayout(tab);
    expect(mergeFallback(tab, "水", periods, layout)).toBe(false);
  });

  it("同じ行にスパン内の個別セルがあるとフォールバック", () => {
    const tab = baseTab({
      schedule: {
        [makeCellKey("水", 2, 8)]: { subj: "確認テスト" },
        [makeCellKey("水", 2, 3)]: { subj: "国語" }, // A は S〜B の構成クラス
      },
    });
    const layout = computeMergeLayout(tab);
    expect(mergeFallback(tab, "水", periods, layout)).toBe(true);
  });

  it("スパン外の個別セルは同じ行でも結合表示できる", () => {
    const tab = baseTab({
      schedule: {
        [makeCellKey("水", 2, 8)]: { subj: "確認テスト" }, // S〜B
        [makeCellKey("水", 2, 5)]: { subj: "数学" }, // C はスパン外
      },
    });
    const layout = computeMergeLayout(tab);
    expect(mergeFallback(tab, "水", periods, layout)).toBe(false);
  });

  it("異なるスパンが同じ行で交差するとフォールバック", () => {
    const tab = baseTab({
      schedule: {
        [makeCellKey("水", 1, 6)]: { subj: "英語" }, // SS〜C
        [makeCellKey("水", 1, 8)]: { subj: "数学" }, // S〜B (交差)
      },
    });
    const layout = computeMergeLayout(tab);
    expect(mergeFallback(tab, "水", periods, layout)).toBe(true);
  });

  it("同一スパンの並列 (監督 2 人) はフォールバックしない", () => {
    const tab = baseTab({
      schedule: {
        [makeCellKey("水", 1, 6)]: { subj: "確認テスト", teacher: "藤田" },
        [makeCellKey("水", 1, 7)]: { subj: "確認テスト", teacher: "大屋敷" },
      },
    });
    const layout = computeMergeLayout(tab);
    expect(mergeFallback(tab, "水", periods, layout)).toBe(false);
  });

  it("並列数がスパン幅を超えるとフォールバック (幅 0 セルの無言非表示を防ぐ)", () => {
    // S〜B (幅 3) に 4 並列を詰めたデータ
    const tab = baseTab({
      classes: [
        cls(1, "S"),
        cls(2, "A"),
        cls(3, "B"),
        cls(11, "S〜B"),
        cls(12, "S〜B"),
        cls(13, "S〜B"),
        cls(14, "S〜B"),
      ],
      schedule: {
        [makeCellKey("水", 1, 11)]: { subj: "確認テスト" },
        [makeCellKey("水", 1, 12)]: { subj: "確認テスト" },
        [makeCellKey("水", 1, 13)]: { subj: "確認テスト" },
        [makeCellKey("水", 1, 14)]: { subj: "確認テスト" },
      },
    });
    const layout = computeMergeLayout(tab);
    expect(mergeFallback(tab, "水", periods, layout)).toBe(true);
  });

  it("表示されない時限 (タブが使わない行) は判定に含めない", () => {
    const tab = baseTab({
      periodIds: [1],
      schedule: {
        [makeCellKey("水", 2, 8)]: { subj: "確認テスト" },
        [makeCellKey("水", 2, 3)]: { subj: "国語" },
      },
    });
    const layout = computeMergeLayout(tab);
    expect(mergeFallback(tab, "水", periods, layout)).toBe(false);
  });
});

describe("splitSpan", () => {
  it("スパン幅を均等分割し、余りは先頭に足す", () => {
    expect(splitSpan(5, 2)).toEqual([3, 2]);
    expect(splitSpan(3, 1)).toEqual([3]);
    expect(splitSpan(4, 4)).toEqual([1, 1, 1, 1]);
    expect(splitSpan(2, 3)).toEqual([1, 1, 0]); // 列数超過は 0 幅 (呼び出し側で除外)
  });
});

describe("visibleClassesForDay (空列を隠す)", () => {
  it("その曜日にセルの無いクラス列を落とし、ある列だけ残す", () => {
    const tab = baseTab({
      classes: [cls(1, "SS", "505"), cls(2, "S", "501"), cls(3, "A", "502")],
      schedule: {
        [makeCellKey("水", 1, 1)]: { subj: "英語" },
        [makeCellKey("水", 2, 3)]: { subj: "数学" },
        [makeCellKey("木", 1, 2)]: { subj: "国語" }, // 他曜日のセルでは残さない
      },
    });
    expect(visibleClassesForDay(tab, "水").map((c) => c.label)).toEqual(["SS", "A"]);
  });

  it("中身のある合同列は、スパンの構成クラスが空でも下敷きとして残す", () => {
    const tab = baseTab({
      schedule: {
        [makeCellKey("水", 1, 8)]: { subj: "確認テスト" }, // S〜B (S・A・B を覆う)
      },
    });
    // SS・C はどのセルにも使われないので消えるが、S・A・B は S〜B の
    // 結合表示に必要なので残る。中身の無い合同列 (SS〜C ×2) は消える
    expect(visibleClassesForDay(tab, "水").map((c) => c.label)).toEqual([
      "S",
      "A",
      "B",
      "S〜B",
    ]);
  });

  it("タブが使わない時限の残骸セルでは列を残さない", () => {
    const tab = baseTab({
      periodIds: [1],
      schedule: {
        [makeCellKey("水", 2, 1)]: { subj: "英語" }, // 時限 2 は periodIds 外
      },
    });
    expect(visibleClassesForDay(tab, "水")).toEqual([]);
  });
});

describe("computeRowCells (画面と Excel で共有する行の配置)", () => {
  const layoutOf = (tab) => computeMergeLayout(tab);
  const shape = (cells) =>
    cells.map((c) => [c.cls.label, c.colSpan, c.isRange, c.first]);

  it("合同セルの無い行は表示列がそのまま 1 列ずつ並ぶ", () => {
    const tab = baseTab({
      schedule: { [makeCellKey("水", 1, 1)]: { subj: "英語" } },
    });
    expect(shape(computeRowCells(tab, "水", 1, layoutOf(tab)))).toEqual([
      ["SS", 1, false, true],
      ["S", 1, false, false],
      ["A", 1, false, false],
      ["B", 1, false, false],
      ["C", 1, false, false],
    ]);
  });

  it("中身のある合同セルを構成クラスの上に colSpan で被せる", () => {
    const tab = baseTab({
      schedule: { [makeCellKey("水", 1, 8)]: { subj: "確認テスト" } }, // S〜B
    });
    expect(shape(computeRowCells(tab, "水", 1, layoutOf(tab)))).toEqual([
      ["SS", 1, false, true],
      ["S〜B", 3, true, false],
      ["C", 1, false, false],
    ]);
  });

  it("同一スパンの並列合同はスパンを分け合う (5 列を 2 セルなら 3+2)", () => {
    const tab = baseTab({
      schedule: {
        [makeCellKey("水", 1, 6)]: { subj: "確認テスト", teacher: "藤田" },
        [makeCellKey("水", 1, 7)]: { subj: "確認テスト", teacher: "大屋敷" },
      },
    });
    expect(shape(computeRowCells(tab, "水", 1, layoutOf(tab)))).toEqual([
      ["SS〜C", 3, true, true],
      ["SS〜C", 2, true, false],
    ]);
  });

  it("行が違えば配置も変わる (時限ごとに解決する)", () => {
    const tab = baseTab({
      schedule: { [makeCellKey("水", 1, 8)]: { subj: "確認テスト" } },
    });
    // 時限 2 には合同セルが無いので通常の 5 列
    expect(computeRowCells(tab, "水", 2, layoutOf(tab))).toHaveLength(5);
  });

  it("未入力の合同枠は starters として先頭の構成クラスに付く", () => {
    const tab = baseTab({ classes: [cls(1, "S"), cls(2, "B"), cls(3, "S〜B")] });
    const cells = computeRowCells(tab, "水", 1, layoutOf(tab));
    expect(cells.map((c) => c.starters.map((s) => s.label))).toEqual([
      ["S〜B"],
      [],
    ]);
  });

  it("スパン内に個別コマがある行には starters を出さない", () => {
    const tab = baseTab({
      classes: [cls(1, "S"), cls(2, "B"), cls(3, "S〜B")],
      schedule: { [makeCellKey("水", 1, 2)]: { subj: "英語" } },
    });
    const cells = computeRowCells(tab, "水", 1, layoutOf(tab));
    expect(cells.flatMap((c) => c.starters)).toEqual([]);
  });

  it("中身が無くても isExtraPresent (編集中セル) は結合表示に含める", () => {
    const tab = baseTab();
    const cells = computeRowCells(
      tab,
      "水",
      1,
      layoutOf(tab),
      (c) => c.label === "S〜B"
    );
    expect(shape(cells)).toEqual([
      ["SS", 1, false, true],
      ["S〜B", 3, true, false],
      ["C", 1, false, false],
    ]);
  });
});
