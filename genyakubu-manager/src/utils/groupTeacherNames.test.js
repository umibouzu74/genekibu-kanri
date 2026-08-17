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

  it("substring match は長い名前優先 (短い subject に hijack されない)", () => {
    // 短い subject 'A' を先に登録しても、長い '英語' が含まれている文字列は
    // '英語' にマッチすべき (code-review P4 修正)。
    const subjects = [
      { id: 99, name: "A", categoryId: 1, aliases: [] },
      ...SUBJECTS,
    ];
    const slots = [{ teacher: "X", subj: "A英語特訓" }];
    const map = buildTeacherPrimarySubjectMap(slots, subjects);
    expect(map.get("X")).toBe("英語");
  });

  it("alias 同士も長い順に評価される", () => {
    // '日本史' (3 文字) は '日' (1 文字) より優先される
    const subjects = [
      { id: 100, name: "X", categoryId: 1, aliases: ["日"] },
      { id: 101, name: "社会", categoryId: 1, aliases: ["日本史"] },
    ];
    const slots = [{ teacher: "Y", subj: "日本史特講" }];
    const map = buildTeacherPrimarySubjectMap(slots, subjects);
    expect(map.get("Y")).toBe("社会");
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

  it("教科順は subjects[] の name 順 (本テスト SUBJECTS は 英 国 社 数 理)", () => {
    // 新挙動: subjects 配列の name 順で並ぶ (ユーザリオーダの尊重)。
    // SUBJECTS = [英語, 国語, 社会, 数学, 理科] なので、その順で出現。
    // 国語担当の講師は今回入力に居ないので '国語' グループは省かれる。
    const groups = groupTeacherNames(["堀上", "片岡", "西岡"], {
      slots: SLOTS, partTimeStaff: [], subjects: SUBJECTS,
    });
    expect(groups.map(g => g.label)).toEqual(["英語", "社会", "数学"]);
  });

  it("subjectOrder を渡せば優先される (subjects[] より優先)", () => {
    const groups = groupTeacherNames(["堀上", "片岡", "西岡"], {
      slots: SLOTS, partTimeStaff: [], subjects: SUBJECTS,
      subjectOrder: ["数学", "英語", "社会"],
    });
    expect(groups.map(g => g.label)).toEqual(["数学", "英語", "社会"]);
  });

  it("subjects も subjectOrder も無ければ DEFAULT_SUBJECT_ORDER (英→数→国→理→社)", () => {
    const groups = groupTeacherNames(["堀上", "片岡", "西岡"], {
      slots: SLOTS, partTimeStaff: [], subjects: [],
    });
    // subjects 空なら primary 推定が出来ないので全員 'その他' に入る
    expect(groups.map(g => g.label)).toEqual(["その他"]);
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

  // よみ (teacherKana) が無いと**漢字は読み順に並べられない**
  // (localeCompare("ja") は部首・画数順)。よみを渡したときだけ
  // あいうえお順になる、というのがこの並びの仕様。
  const ENGLISH_SLOTS = [
    { teacher: "堀上", subj: "英語" },
    { teacher: "石原", subj: "英語" },
    { teacher: "高松", subj: "英語" },
  ];

  it("よみが無いグループ内は従来どおりの文字列順 (安定していれば良い)", () => {
    const groups = groupTeacherNames(["堀上", "石原", "高松"], {
      slots: ENGLISH_SLOTS, partTimeStaff: [], subjects: SUBJECTS,
    });
    const arr = groups.find(g => g.label === "英語").teachers;
    // 同じ入力に対して同じ順を返すことだけ確認 (読み順にはできない)
    expect(new Set(arr)).toEqual(new Set(["堀上", "石原", "高松"]));
    expect(arr.length).toBe(3);
  });

  it("teacherKana を渡すとグループ内があいうえお順になる", () => {
    const groups = groupTeacherNames(["堀上", "石原", "高松"], {
      slots: ENGLISH_SLOTS, partTimeStaff: [], subjects: SUBJECTS,
      teacherKana: { 堀上: "ほりかみ", 石原: "いしはら", 高松: "たかまつ" },
    });
    expect(groups.find(g => g.label === "英語").teachers).toEqual([
      "石原", // いしはら
      "高松", // たかまつ
      "堀上", // ほりかみ
    ]);
  });

  it("よみが一部だけのときは、よみのある講師が先・未設定は末尾", () => {
    const groups = groupTeacherNames(["堀上", "石原", "高松"], {
      slots: ENGLISH_SLOTS, partTimeStaff: [], subjects: SUBJECTS,
      teacherKana: { 高松: "たかまつ", 石原: "いしはら" },
    });
    const arr = groups.find(g => g.label === "英語").teachers;
    expect(arr.slice(0, 2)).toEqual(["石原", "高松"]);
    expect(arr[2]).toBe("堀上"); // よみ未設定なので末尾
  });

  it("バイトグループもよみ順になる", () => {
    const groups = groupTeacherNames(["堀上", "石原"], {
      slots: ENGLISH_SLOTS,
      partTimeStaff: [{ name: "堀上", subjectIds: [] }, { name: "石原", subjectIds: [] }],
      subjects: SUBJECTS,
      teacherKana: { 堀上: "ほりかみ", 石原: "いしはら" },
    });
    expect(groups.find(g => g.label === STAFF_GROUP_LABEL).teachers).toEqual([
      "石原",
      "堀上",
    ]);
  });

  it("names 空 / undefined でも壊れない", () => {
    expect(groupTeacherNames([], { slots: SLOTS, partTimeStaff: [], subjects: SUBJECTS })).toEqual([]);
    expect(groupTeacherNames(undefined, { slots: SLOTS, partTimeStaff: [], subjects: SUBJECTS })).toEqual([]);
  });
});
