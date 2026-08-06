import { describe, expect, it } from "vitest";
import { computeClassSubjectLoad } from "./classLoad";
import { makeCellKey } from "./model";
import { makeProject } from "./testUtils";

// makeProject: 中3 タブ (月・火, 1限/2限, S/A)。
// schedule: 月1限 S=数学/半田, 月2限 A=英語/堀上

describe("computeClassSubjectLoad", () => {
  it("学年ごとに クラス × 科目 の週コマ数と計を数える", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { subj: "数学" };
    p.tabs[0].schedule[makeCellKey("火", 2, 1)] = { subj: "英語" };
    const { tabs } = computeClassSubjectLoad(p);
    expect(tabs).toHaveLength(1);
    const t = tabs[0];
    expect(t.tabName).toBe("中3");
    // 科目列はマスタ順 (英語 → 数学)
    expect(t.subjects).toEqual(["英語", "数学"]);
    // 行は classes の定義順 (S, A)
    expect(t.rows.map((r) => r.label)).toEqual(["S", "A"]);
    expect(t.rows[0].bySubj).toEqual({ 数学: 2, 英語: 1 });
    expect(t.rows[0].total).toBe(3);
    expect(t.rows[1].bySubj).toEqual({ 英語: 1 });
    expect(t.subjTotals).toEqual({ 数学: 2, 英語: 2 });
    expect(t.total).toBe(4);
  });

  it("教科なしのセル (講師だけのメモ) と残骸セルは数えない", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { teacher: "半田" }; // 教科なし
    p.tabs[0].schedule[makeCellKey("水", 1, 1)] = { subj: "数学" }; // 使わない曜日
    const { tabs } = computeClassSubjectLoad(p);
    expect(tabs[0].total).toBe(2); // fixture の 2 セルのみ
  });

  it("マスタ外の科目 (直接入力) は名前順で末尾に載る", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { subj: "課題" };
    const { tabs } = computeClassSubjectLoad(p);
    expect(tabs[0].subjects).toEqual(["英語", "数学", "課題"]);
  });

  it("教科の入ったセルが無い学年は載せない・コマゼロのクラス行は残す", () => {
    const p = makeProject();
    p.tabs.push({
      id: 2,
      name: "中1",
      grade: "中1",
      classes: [{ id: 1, label: "B", room: "301" }],
      days: ["月"],
      periodIds: [1],
      schedule: {},
    });
    const { tabs } = computeClassSubjectLoad(p);
    expect(tabs.map((t) => t.tabName)).toEqual(["中3"]);
    // fixture では A クラスにもセルがあるため、空クラスのケースを別で作る
    const q = makeProject();
    delete q.tabs[0].schedule[makeCellKey("月", 2, 2)]; // A のセルを消す
    const res = computeClassSubjectLoad(q);
    expect(res.tabs[0].rows.map((r) => [r.label, r.total])).toEqual([
      ["S", 1],
      ["A", 0],
    ]);
  });

  it("クラス名の無い列 (取込した講座列など) は教室名で載る", () => {
    const p = makeProject();
    p.tabs[0].classes[0] = { id: 1, label: "", room: "501" };
    const { tabs } = computeClassSubjectLoad(p);
    expect(tabs[0].rows[0].label).toBe("501");
  });
});
