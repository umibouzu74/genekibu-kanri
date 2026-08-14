import { describe, it, expect } from "vitest";
import {
  groupTeachersBySubject,
  normalizeKana,
  sortTeacherNamesByKana,
  sortTeachersByKana,
  ungroupedLabel,
} from "./teacherOrder";

describe("normalizeKana", () => {
  it("カタカナ・半角カナ・空白を吸収する", () => {
    expect(normalizeKana("ホリカミ")).toBe("ほりかみ");
    expect(normalizeKana("ﾎﾘｶﾐ")).toBe("ほりかみ");
    expect(normalizeKana(" こう の ")).toBe("こうの");
    expect(normalizeKana("コウノ")).toBe(normalizeKana("こうの"));
  });

  it("未入力は空文字", () => {
    expect(normalizeKana("")).toBe("");
    expect(normalizeKana(undefined)).toBe("");
  });
});

describe("sortTeachersByKana", () => {
  it("よみのアイウエオ順に並べる", () => {
    const teachers = [
      { name: "堀上", kana: "ほりかみ" },
      { name: "井上", kana: "いのうえ" },
      { name: "河野", kana: "こうの" },
    ];
    expect(sortTeachersByKana(teachers).map((t) => t.name)).toEqual([
      "井上",
      "河野",
      "堀上",
    ]);
  });

  it("よみが無い講師はマスタ順のまま末尾に残す", () => {
    const teachers = [
      { name: "西岡" },
      { name: "堀上", kana: "ほりかみ" },
      { name: "半田" },
      { name: "井上", kana: "いのうえ" },
    ];
    expect(sortTeachersByKana(teachers).map((t) => t.name)).toEqual([
      "井上",
      "堀上",
      "西岡",
      "半田",
    ]);
  });

  it("元の配列を変更しない", () => {
    const teachers = [
      { name: "堀上", kana: "ほりかみ" },
      { name: "井上", kana: "いのうえ" },
    ];
    sortTeachersByKana(teachers);
    expect(teachers.map((t) => t.name)).toEqual(["堀上", "井上"]);
  });
});

describe("sortTeacherNamesByKana", () => {
  it("マスタで読める名前が先、読めない名前は後ろ", () => {
    const teachers = [
      { name: "堀上", kana: "ほりかみ" },
      { name: "井上", kana: "いのうえ" },
    ];
    // 「香川」はマスタに無い (セルにだけ現れる講師)
    expect(
      sortTeacherNamesByKana(["香川", "堀上", "井上"], teachers)
    ).toEqual(["井上", "堀上", "香川"]);
  });
});

describe("groupTeachersBySubject", () => {
  const teachers = [
    { name: "堀上", kana: "ほりかみ", subjects: ["英語", "数学"] },
    { name: "井上", kana: "いのうえ", subjects: ["社会"] },
    { name: "香川", kana: "かがわ", subjects: ["数学"] },
    { name: "西岡", kana: "にしおか" },
  ];
  const master = ["英語", "数学", "国語", "社会"];

  it("科目マスタ順のグループ + グループ内はアイウエオ順", () => {
    const groups = groupTeachersBySubject(teachers, master);
    expect(
      groups.map((g) => [g.subject, g.teachers.map((t) => t.name)])
    ).toEqual([
      ["英語", ["堀上"]],
      ["数学", ["香川", "堀上"]],
      ["社会", ["井上"]],
      ["", ["西岡"]],
    ]);
  });

  it("誰も担当科目を持たなければグループは 1 つ (見出し無し)", () => {
    const groups = groupTeachersBySubject(
      [
        { name: "堀上", kana: "ほりかみ" },
        { name: "井上", kana: "いのうえ" },
      ],
      master
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].subject).toBe("");
    expect(groups[0].teachers.map((t) => t.name)).toEqual(["井上", "堀上"]);
  });

  it("科目マスタに無い担当科目はマスタ順の後ろに置く", () => {
    const groups = groupTeachersBySubject(
      [{ name: "奥村", kana: "おくむら", subjects: ["理科"] }, ...teachers],
      master
    );
    expect(groups.map((g) => g.subject)).toEqual([
      "英語",
      "数学",
      "社会",
      "理科",
      "",
    ]);
  });

  it("講師が 0 人なら空配列", () => {
    expect(groupTeachersBySubject([], master)).toEqual([]);
  });
});

describe("ungroupedLabel", () => {
  it("科目マスタに「その他」があるときだけ見出しを言い換える", () => {
    expect(ungroupedLabel(["英語", "数学"])).toBe("その他");
    expect(ungroupedLabel(["英語", "その他"])).toBe("未設定");
    expect(ungroupedLabel(undefined)).toBe("その他");
  });
});

describe("groupTeachersBySubject - 重複した科目マスタ", () => {
  it("科目マスタに同じ科目が 2 度あっても見出しは 1 つ", () => {
    const groups = groupTeachersBySubject(
      [{ name: "堀上", kana: "ほりかみ", subjects: ["数学"] }],
      ["数学", "英語", "数学"]
    );
    expect(groups.map((g) => g.subject)).toEqual(["数学"]);
  });
});
