import { describe, expect, it } from "vitest";
import {
  GENYAKU_FULLTIME_GROUP_KEY,
  GENYAKU_PARTTIME_GROUP_KEY,
  buildTeacherGroups,
} from "./useTeacherGroups";

const subjects = [
  { id: 1, name: "英語", categoryId: 1, aliases: [] },
  { id: 2, name: "数学", categoryId: 2, aliases: [] },
];
const slots = [
  { id: 1, subj: "英語", teacher: "堀上", note: "" },
  { id: 2, subj: "英語", teacher: "西岡", note: "" },
  { id: 3, subj: "数学", teacher: "片岡", note: "" },
  { id: 4, subj: "数学", teacher: "香川", note: "" },
  { id: 5, subj: "数学", teacher: "半田", note: "" },
];
const partTimeStaff = [{ name: "香川", subjectIds: [] }];
// 並びはよみ順 (utils/teacherKana)
const teacherKana = {
  堀上: "ほりかみ",
  西岡: "にしおか",
  片岡: "かたおか",
  半田: "はんだ",
  香川: "かがわ",
  室長: "しつちょう",
};
const base = { slots, partTimeStaff, subjects, teacherKana };

describe("buildTeacherGroups", () => {
  it("所属を誰も分けていなければ従来どおり (バイト → 教科別)", () => {
    const groups = buildTeacherGroups(base);
    expect(groups.map((g) => [g.label, g.teachers])).toEqual([
      ["バイト", ["香川"]],
      ["英語", ["西岡", "堀上"]],
      ["数学", ["片岡", "半田"]],
    ]);
    expect(groups.every((g) => g.section === undefined)).toBe(true);
  });

  it("所属で分けていれば 現役部 常勤 → 現役部 非常勤 → バイト → 予備校部 (教科別)", () => {
    const groups = buildTeacherGroups({
      ...base,
      year: 2026,
      affiliations: [
        { name: "堀上", fromYear: 2026, category: "genyaku-fulltime" },
        { name: "片岡", fromYear: 2026, category: "genyaku-fulltime" },
        { name: "半田", fromYear: 2026, category: "genyaku-parttime" },
        // コマを持たない常勤も並べる
        { name: "室長", fromYear: 2025, category: "genyaku-fulltime" },
      ],
    });
    expect(groups.map((g) => [g.key, g.teachers, g.section])).toEqual([
      [GENYAKU_FULLTIME_GROUP_KEY, ["片岡", "室長", "堀上"], "genyaku"],
      [GENYAKU_PARTTIME_GROUP_KEY, ["半田"], "genyaku"],
      ["__staff__", ["香川"], "genyaku"],
      ["英語", ["西岡"], "yobiko"],
    ]);
  });

  it("所属は年度で引く (前の年度の区分にはならない)", () => {
    const groups = buildTeacherGroups({
      ...base,
      year: 2025,
      affiliations: [{ name: "堀上", fromYear: 2026, category: "genyaku-fulltime" }],
    });
    expect(groups.find((g) => g.key === GENYAKU_FULLTIME_GROUP_KEY)).toBeUndefined();
  });

  it("退職・非表示の人はコマが残っていなければ出さない。退職だけでは区分の見た目にしない", () => {
    const groups = buildTeacherGroups({
      ...base,
      partTimeStaff: [...partTimeStaff, { name: "辞めたバイト", subjectIds: [] }],
      year: 2026,
      affiliations: [
        { name: "辞めたバイト", fromYear: 2026, category: "retired" },
        // コマが残っている退職者は教科別に出す
        { name: "西岡", fromYear: 2026, category: "retired" },
      ],
    });
    expect(groups.map((g) => [g.label, g.teachers])).toEqual([
      ["バイト", ["香川"]],
      ["英語", ["西岡", "堀上"]],
      ["数学", ["片岡", "半田"]],
    ]);
    expect(groups.every((g) => g.section === undefined)).toBe(true);
  });
});
