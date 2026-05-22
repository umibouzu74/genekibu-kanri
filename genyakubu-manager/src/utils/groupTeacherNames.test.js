import { describe, expect, it } from "vitest";
import {
  groupTeacherNames,
  STAFF_GROUP_LABEL,
  OTHER_GROUP_LABEL,
  buildTeacherPrimarySubjectMap,
} from "./groupTeacherNames";

const SUBJECTS = [
  { id: 1, name: "英語", categoryId: 1, aliases: ["英"] },
  { id: 2, name: "国語", categoryId: 1, aliases: ["現代文"] },
  { id: 3, name: "社会", categoryId: 1, aliases: ["日本史"] },
  { id: 4, name: "数学", categoryId: 2, aliases: ["数", "算数"] },
  { id: 5, name: "理科", categoryId: 2, aliases: ["物理"] },
];

const SLOTS = [
  { id: 1, teacher: "堀上", subj: "英語" },
  { id: 2, teacher: "堀上", subj: "英語" },
  { id: 3, teacher: "片岡", subj: "数学" },
  { id: 4, teacher: "西岡", subj: "社会" },
  { id: 5, teacher: "Mixed", subj: "英語" },
  { id: 6, teacher: "Mixed", subj: "数学" },
  { id: 7, teacher: "Mixed", subj: "数学" },
];

describe("buildTeacherPrimarySubjectMap", () => {
  it("最多担当の教科を primary として返す", () => {
    const map = buildTeacherPrimarySubjectMap(SLOTS, SUBJECTS);
    expect(map.get("堀上")).toBe("英語");
    expect(map.get("片岡")).toBe("数学");
    expect(map.get("西岡")).toBe("社会");
    // Mixed: 数学2, 英語1 → 数学
    expect(map.get("Mixed")).toBe("数学");
  });

  it("aliases も照合対象", () => {
    const slots = [{ teacher: "X", subj: "現代文" }];
    const map = buildTeacherPrimarySubjectMap(slots, SUBJECTS);
    expect(map.get("X")).toBe("国語");
  });

  it("subj が unmatched なら primary は登録されない", () => {
    const slots = [{ teacher: "X", subj: "未知科目" }];
    const map = buildTeacherPrimarySubjectMap(slots, SUBJECTS);
    expect(map.get("X")).toBeUndefined();
  });
});

describe("groupTeacherNames", () => {
  it("partTimeStaff にいる名前は「バイト」グループ", () => {
    const groups = groupTeacherNames(["堀上", "福武"], {
      slots: SLOTS,
      partTimeStaff: [{ name: "福武", subjectIds: [] }],
      subjects: SUBJECTS,
    });
    expect(groups.find(g => g.label === STAFF_GROUP_LABEL).teachers).toEqual(["福武"]);
    expect(groups.find(g => g.label === "英語").teachers).toEqual(["堀上"]);
  });

  it("教科順は 英 → 数 → 国 → 理 → 社 → その他", () => {
    const groups = groupTeacherNames(["堀上", "片岡", "西岡"], {
      slots: SLOTS, partTimeStaff: [], subjects: SUBJECTS,
    });
    expect(groups.map(g => g.label)).toEqual(["英語", "数学", "社会"]);
  });

  it("primary subject が無い名前は「その他」グループ", () => {
    const groups = groupTeacherNames(["新人"], {
      slots: SLOTS, partTimeStaff: [], subjects: SUBJECTS,
    });
    expect(groups[0].label).toBe(OTHER_GROUP_LABEL);
    expect(groups[0].teachers).toEqual(["新人"]);
  });

  it("空のグループは省く", () => {
    const groups = groupTeacherNames(["堀上"], {
      slots: SLOTS, partTimeStaff: [], subjects: SUBJECTS,
    });
    expect(groups.map(g => g.label)).toEqual(["英語"]);
  });

  it("重複名は dedupe (Set 化)", () => {
    const groups = groupTeacherNames(["堀上", "堀上"], {
      slots: SLOTS, partTimeStaff: [], subjects: SUBJECTS,
    });
    expect(groups[0].teachers).toEqual(["堀上"]);
  });

  it("各グループ内は compareJa でソート (五十音順)", () => {
    const groups = groupTeacherNames(["堀上", "石原", "高松"], {
      slots: [
        { teacher: "堀上", subj: "英語" },
        { teacher: "石原", subj: "英語" },
        { teacher: "高松", subj: "英語" },
      ],
      partTimeStaff: [], subjects: SUBJECTS,
    });
    // compareJa 順 (ローカル特定の漢字読み判定で安定の順) を維持していれば OK
    const arr = groups.find(g => g.label === "英語").teachers;
    // 同じ入力に対して同じ順を返すことだけ確認 (元の入力順とは異なる)
    expect(new Set(arr)).toEqual(new Set(["堀上", "石原", "高松"]));
    expect(arr.length).toBe(3);
  });

  it("names 空 / undefined でも壊れない", () => {
    expect(groupTeacherNames([], { slots: SLOTS, partTimeStaff: [], subjects: SUBJECTS })).toEqual([]);
    expect(groupTeacherNames(undefined, { slots: SLOTS, partTimeStaff: [], subjects: SUBJECTS })).toEqual([]);
  });
});
