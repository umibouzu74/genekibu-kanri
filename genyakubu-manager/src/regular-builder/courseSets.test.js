import { describe, expect, it } from "vitest";
import { makeCellKey } from "./model";
import { computeCourseSets } from "./courseSets";
import { makeProject } from "./testUtils";

// 中3: S/A が火木、B/C が水金 の 2 セット構成
function twoSetProject(over = {}) {
  return makeProject({
    tabs: [
      {
        id: 1,
        name: "中3",
        grade: "中3",
        classes: [
          { id: 1, label: "S", room: "501" },
          { id: 2, label: "A", room: "502" },
          { id: 3, label: "B", room: "503" },
          { id: 4, label: "C", room: "504" },
        ],
        days: ["火", "水", "木", "金"],
        periodIds: [1, 2],
        schedule: {
          [makeCellKey("火", 1, 1)]: { subj: "数学" },
          [makeCellKey("木", 2, 1)]: { subj: "英語" },
          [makeCellKey("火", 1, 2)]: { subj: "英語" },
          [makeCellKey("木", 2, 2)]: { subj: "数学" },
          [makeCellKey("水", 1, 3)]: { subj: "数学" },
          [makeCellKey("金", 2, 3)]: { subj: "英語" },
          [makeCellKey("水", 1, 4)]: { subj: "英語" },
          [makeCellKey("金", 2, 4)]: { subj: "数学" },
        },
      },
    ],
    ...over,
  });
}

describe("computeCourseSets", () => {
  it("同じ曜日の組を使うクラス列が 1 つのセットにまとまる", () => {
    const sets = computeCourseSets(twoSetProject());
    expect(sets.map((s) => s.label)).toEqual(["中3（火・木）", "中3（水・金）"]);
    expect(sets[0].classIds).toEqual([1, 2]);
    expect(sets[1].classIds).toEqual([3, 4]);
  });

  it("曜日の組が違うクラスは別セットになる (部分集合でも併合しない)", () => {
    // C の金セルを消すと C は水のみ — 水金の B とは別の組
    const p = twoSetProject();
    delete p.tabs[0].schedule[makeCellKey("金", 2, 4)];
    const sets = computeCourseSets(p);
    const byLabel = Object.fromEntries(sets.map((s) => [s.label, s]));
    expect(byLabel["中3（水・金）"].classIds).toEqual([3]);
    expect(byLabel["中3（水）"].classIds).toEqual([4]);
  });

  it("セルの無いクラス列は学年の全曜日のセットに入る", () => {
    // makeProject: days ["月","火"]、S/A とも月のみセルあり。空の B を足す
    const p = makeProject();
    p.tabs[0].classes.push({ id: 3, label: "B", room: "503" });
    const sets = computeCourseSets(p);
    const byLabel = Object.fromEntries(sets.map((s) => [s.label, s]));
    expect(byLabel["中3（月）"].classIds).toEqual([1, 2]);
    expect(byLabel["中3（月・火）"].classIds).toEqual([3]);
  });

  it("tab.days / periodIds の範囲外の残骸セルは曜日判定に数えない", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("土", 1, 1)] = { subj: "残骸" };
    p.tabs[0].schedule[makeCellKey("火", 99, 1)] = { subj: "残骸" };
    const sets = computeCourseSets(p);
    expect(sets.find((s) => s.classIds.includes(1)).days).toEqual(["月"]);
  });

  it("合同列のセルの曜日は構成クラスの曜日に数え、合同列も同じセットに合流する", () => {
    const p = makeProject({
      tabs: [
        {
          id: 1,
          name: "中1",
          grade: "中1",
          classes: [
            { id: 1, label: "S", room: "501" },
            { id: 2, label: "A", room: "502" },
            { id: 3, label: "S〜A", room: "" },
          ],
          days: ["火", "木", "土"],
          periodIds: [1, 2],
          schedule: {
            [makeCellKey("火", 1, 1)]: { subj: "数学" },
            [makeCellKey("木", 1, 1)]: { subj: "英語" },
            [makeCellKey("火", 1, 2)]: { subj: "英語" },
            [makeCellKey("木", 1, 2)]: { subj: "数学" },
            // 合同 (S〜A) は土曜のみ
            [makeCellKey("土", 2, 3)]: { subj: "テスト" },
          },
        },
      ],
    });
    const sets = computeCourseSets(p);
    expect(sets).toHaveLength(1);
    expect(sets[0].label).toBe("中1（火・木・土）");
    expect(sets[0].classIds).toEqual([1, 2, 3]);
    expect(sets[0].cellCount).toBe(5);
  });

  it("曜日・時限・クラスが未設定のタブは対象外", () => {
    const p = makeProject();
    p.tabs.push({
      id: 2,
      name: "新規",
      grade: "",
      classes: [],
      days: ["月"],
      periodIds: [1],
      schedule: {},
    });
    expect(computeCourseSets(p).every((s) => s.tabId === 1)).toBe(true);
  });

  it("セットはタブ定義順 → 先頭曜日順に並ぶ", () => {
    const p = twoSetProject();
    p.tabs.push({
      id: 2,
      name: "中1",
      grade: "中1",
      classes: [{ id: 1, label: "A", room: "301" }],
      days: ["月", "木"],
      periodIds: [1],
      schedule: { [makeCellKey("月", 1, 1)]: { subj: "数学" } },
    });
    const labels = computeCourseSets(p).map((s) => s.label);
    expect(labels.indexOf("中3（火・木）")).toBeLessThan(labels.indexOf("中3（水・金）"));
    expect(labels.at(-1)).toBe("中1（月）");
  });
});
