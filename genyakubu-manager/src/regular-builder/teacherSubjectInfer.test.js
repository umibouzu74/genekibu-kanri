import { describe, it, expect } from "vitest";
import {
  applyInferredSubjects,
  inferTeacherSubjects,
  resolveSubjectLabel,
} from "./teacherSubjectInfer";

// 親アプリの教科マスタ (data.js の既定と同じ形)
const MASTER = [
  { id: 1, name: "英語", aliases: ["英"] },
  { id: 2, name: "国語", aliases: ["現代文", "国"] },
  { id: 3, name: "社会", aliases: ["日本史"] },
  { id: 4, name: "数学", aliases: ["数"] },
  { id: 5, name: "理科", aliases: ["物理"] },
];

const project = {
  subjects: ["英語", "数学", "国語", "社会"],
  teachers: [
    { name: "堀上" },
    { name: "河野" },
    { name: "井上", subjects: ["社会"] },
    { name: "西岡" },
  ],
  tabs: [
    {
      id: 1,
      schedule: {
        a: { subj: "英語", teacher: "堀上" },
        // 「英/数」は科目マスタと完全一致しないが、親アプリの別名で英語になる
        b: { subj: "英/数", teacher: "堀上·河野" },
        c: { subj: "中3数学", teacher: "河野" },
        // 科目マスタのどれにも当たらない科目は担当科目にしない
        d: { subj: "確認テスト", teacher: "西岡" },
      },
    },
  ],
};

describe("resolveSubjectLabel", () => {
  const master = project.subjects;

  it("完全一致 → 部分一致 → 親アプリの別名 の順に読み替える", () => {
    expect(resolveSubjectLabel("英語", master, MASTER)).toBe("英語");
    expect(resolveSubjectLabel("中3数学", master, MASTER)).toBe("数学");
    expect(resolveSubjectLabel("英/数", master, MASTER)).toBe("英語");
  });

  it("どれにも当たらない科目は null", () => {
    expect(resolveSubjectLabel("確認テスト", master, MASTER)).toBeNull();
    expect(resolveSubjectLabel("", master, MASTER)).toBeNull();
  });

  it("読み替え先が科目マスタに無ければ採用しない", () => {
    // 科目マスタに「理科」が無いので、「物理」→ 理科 は使えない
    expect(resolveSubjectLabel("物理", master, MASTER)).toBeNull();
  });
});

describe("inferTeacherSubjects", () => {
  it("割当から講師ごとの担当科目を集める (複数講師のコマは全員)", () => {
    const got = inferTeacherSubjects(project, MASTER);
    expect(got.get("堀上")).toEqual(["英語"]);
    expect(got.get("河野")).toEqual(["英語", "数学"]);
    expect(got.has("西岡")).toBe(false);
  });

  it("並びは科目マスタ順", () => {
    const p = {
      ...project,
      tabs: [
        {
          id: 1,
          schedule: {
            a: { subj: "国語", teacher: "松川" },
            b: { subj: "英語", teacher: "松川" },
          },
        },
      ],
    };
    expect(inferTeacherSubjects(p, MASTER).get("松川")).toEqual([
      "英語",
      "国語",
    ]);
  });
});

describe("applyInferredSubjects", () => {
  it("既存の担当科目は残したままマージする", () => {
    const { teachers, filled, added } = applyInferredSubjects(project, MASTER);
    expect(teachers.find((t) => t.name === "堀上").subjects).toEqual(["英語"]);
    expect(teachers.find((t) => t.name === "河野").subjects).toEqual([
      "英語",
      "数学",
    ]);
    // 井上は割当が無いので手入力の「社会」がそのまま残る
    expect(teachers.find((t) => t.name === "井上").subjects).toEqual(["社会"]);
    expect(teachers.find((t) => t.name === "西岡").subjects).toBeUndefined();
    expect(filled).toBe(2);
    expect(added).toBe(3);
  });

  it("推定できるものが無ければ講師マスタを触らない", () => {
    const p = { ...project, tabs: [] };
    const { teachers, filled } = applyInferredSubjects(p, MASTER);
    expect(filled).toBe(0);
    expect(teachers).toEqual(project.teachers);
  });
});
