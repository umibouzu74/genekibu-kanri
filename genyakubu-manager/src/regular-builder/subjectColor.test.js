import { describe, expect, it } from "vitest";
import { makeSubjectColorResolver } from "./subjectColor";
import { getSubjectColor } from "../timetable-builder/utils/constants";

// 教科マスタ (親アプリ INIT_SUBJECTS と同形)
const SUBJECTS = [
  { id: 1, name: "英語", categoryId: 1, aliases: ["英"] },
  { id: 2, name: "国語", categoryId: 1, aliases: ["現代文", "古文", "漢文", "国"] },
  { id: 3, name: "社会", categoryId: 1, aliases: ["日本史", "世界史", "地理"] },
  { id: 4, name: "数学", categoryId: 2, aliases: ["数", "算数"] },
  { id: 5, name: "理科", categoryId: 2, aliases: ["物理", "化学", "生物", "地学"] },
];

describe("makeSubjectColorResolver", () => {
  it("クラス記号違いを同じ色にする (理科A / 理科B)", () => {
    const color = makeSubjectColorResolver(SUBJECTS);
    expect(color("理科A")).toBe(color("理科B"));
    expect(color("理科A")).toBe(getSubjectColor("理科"));
    // 修正前の挙動 (素の文字列でハッシュ) では別色だったことも固定する
    expect(getSubjectColor("理科A")).not.toBe(getSubjectColor("理科B"));
  });

  it("冠や表記ゆれがあっても教科の色に寄せる", () => {
    const color = makeSubjectColorResolver(SUBJECTS);
    expect(color("マークテスト 国語")).toBe(getSubjectColor("国語"));
    expect(color("高松西 文系数学")).toBe(getSubjectColor("数学"));
    // 別名経由 (数 → 数学 / 地理 → 社会)
    expect(color("共テ数IA")).toBe(getSubjectColor("数学"));
    expect(color("地理B")).toBe(getSubjectColor("社会"));
  });

  it("教科ごとに違う色であること (色分けの意味が残る)", () => {
    const color = makeSubjectColorResolver(SUBJECTS);
    const colors = ["英語A", "国語A", "社会A", "数学A", "理科A"].map(color);
    expect(new Set(colors).size).toBe(5);
  });

  it("マスタに当たらない科目は文字列ごとに安定した色を返す", () => {
    const color = makeSubjectColorResolver(SUBJECTS);
    expect(color("確認テスト")).toBe(getSubjectColor("確認テスト"));
    expect(color("確認テスト")).toBe(color("確認テスト"));
    expect(color("")).toBeNull();
    expect(color(null)).toBeNull();
  });

  it("教科マスタが空/未指定でも落ちず、素の挙動に戻る", () => {
    expect(makeSubjectColorResolver(undefined)("理科A")).toBe(
      getSubjectColor("理科A")
    );
    expect(makeSubjectColorResolver([])("理科A")).toBe(getSubjectColor("理科A"));
  });
});
