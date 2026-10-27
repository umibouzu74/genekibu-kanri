import { describe, expect, it } from "vitest";
import {
  AFFILIATION_CATEGORIES,
  DEFAULT_CATEGORY,
  LEAVE_CATEGORY,
  PART_TIME_CATEGORY,
  RETIRED_CATEGORY,
  categoryMeta,
  changesFromPreviousYear,
  fiscalYearOf,
  fiscalYearRange,
  groupByAffiliation,
  indexAffiliationChanges,
  leaveTrackedNames,
  migrateTeacherAffiliations,
  resetAffiliation,
  resolveAffiliation,
  retiredNamesForYear,
  setAffiliation,
  teacherNamesForYear,
} from "./teacherAffiliations";

const PT = new Set(["福江", "河野"]);
const resolve = (changes, name, year) =>
  resolveAffiliation(indexAffiliationChanges(changes), name, year, PT);

describe("年度", () => {
  it("4 月始まりで数える", () => {
    expect(fiscalYearOf("2026-04-01")).toBe(2026);
    expect(fiscalYearOf("2027-03-31")).toBe(2026);
    expect(fiscalYearOf("2026-12-31")).toBe(2026);
    expect(fiscalYearOf("")).toBeNull();
    expect(fiscalYearRange(2026)).toEqual({ start: "2026-04-01", end: "2027-03-31" });
  });
});

describe("migrateTeacherAffiliations", () => {
  it("形にならないものを落とし、同じ講師・年度は後勝ちにする", () => {
    const out = migrateTeacherAffiliations([
      { name: "石原", fromYear: 2026, category: "yobiko" },
      { name: "石原", fromYear: 2026, category: LEAVE_CATEGORY },
      { name: "", fromYear: 2026, category: "yobiko" },
      { name: "堀上", fromYear: "x", category: "yobiko" },
      { name: "松川", fromYear: 2026 },
      null,
    ]);
    expect(out).toEqual([{ name: "石原", fromYear: 2026, category: LEAVE_CATEGORY }]);
  });

  it("RTDB がオブジェクトで返したものも読む / 知らない区分も残す", () => {
    const out = migrateTeacherAffiliations({
      0: { name: "石原", fromYear: 2026, category: "yobiko-fulltime" },
    });
    expect(out).toEqual([{ name: "石原", fromYear: 2026, category: "yobiko-fulltime" }]);
    expect(categoryMeta("yobiko-fulltime").label).toMatch(/その他/);
  });
});

describe("resolveAffiliation", () => {
  it("登録なしは予備校部、バイトは現役部 非常勤", () => {
    expect(resolve([], "西岡", 2026)).toEqual({
      category: DEFAULT_CATEGORY,
      source: "default",
      fromYear: null,
    });
    expect(resolve([], "福江", 2026)).toMatchObject({
      category: PART_TIME_CATEGORY,
      source: "part-time",
    });
  });

  it("変えた年度から後に効き、前の年度は変わらない", () => {
    const changes = setAffiliation([], ["石原"], 2026, LEAVE_CATEGORY, PT);
    expect(resolve(changes, "石原", 2025).category).toBe(DEFAULT_CATEGORY);
    expect(resolve(changes, "石原", 2026)).toMatchObject({
      category: LEAVE_CATEGORY,
      source: "this-year",
      fromYear: 2026,
    });
    // 何もしなければ次の年度へ引き継がれる
    expect(resolve(changes, "石原", 2028)).toMatchObject({
      category: LEAVE_CATEGORY,
      source: "inherited",
      fromYear: 2026,
    });
  });
});

describe("setAffiliation / resetAffiliation", () => {
  it("複数人をまとめて動かせる", () => {
    const changes = setAffiliation([], ["石原", "堀上"], 2026, LEAVE_CATEGORY, PT);
    expect(changes).toHaveLength(2);
    expect(resolve(changes, "堀上", 2026).category).toBe(LEAVE_CATEGORY);
  });

  it("引き継いだ区分と同じなら登録しない (保存は変更だけ)", () => {
    expect(setAffiliation([], ["西岡"], 2026, DEFAULT_CATEGORY, PT)).toEqual([]);
    expect(setAffiliation([], ["福江"], 2026, PART_TIME_CATEGORY, PT)).toEqual([]);
    const c1 = setAffiliation([], ["石原"], 2025, LEAVE_CATEGORY, PT);
    expect(setAffiliation(c1, ["石原"], 2026, LEAVE_CATEGORY, PT)).toEqual(c1);
  });

  it("後の年度の別の変更はそのまま残る", () => {
    let c = setAffiliation([], ["片岡"], 2027, DEFAULT_CATEGORY, PT); // 何も起きない
    c = setAffiliation(c, ["片岡"], 2026, LEAVE_CATEGORY, PT);
    c = setAffiliation(c, ["片岡"], 2028, DEFAULT_CATEGORY, PT); // 2028 から予備校部へ戻る
    expect(resolve(c, "片岡", 2027).category).toBe(LEAVE_CATEGORY);
    expect(resolve(c, "片岡", 2028).category).toBe(DEFAULT_CATEGORY);
    // 2026 を直しても 2028 の変更は残る
    c = setAffiliation(c, ["片岡"], 2026, PART_TIME_CATEGORY, PT);
    expect(resolve(c, "片岡", 2027).category).toBe(PART_TIME_CATEGORY);
    expect(resolve(c, "片岡", 2028).category).toBe(DEFAULT_CATEGORY);
  });

  it("取り消すと前の年度の区分に戻り、要らなくなった後の変更も落ちる", () => {
    let c = setAffiliation([], ["松川"], 2026, LEAVE_CATEGORY, PT);
    c = setAffiliation(c, ["松川"], 2027, DEFAULT_CATEGORY, PT);
    // 2026 を取り消すと 2027 の「予備校部へ」は登録なしと同じなので要らない
    c = resetAffiliation(c, ["松川"], 2026, PT);
    expect(c).toEqual([]);
    expect(resolve(c, "松川", 2027).category).toBe(DEFAULT_CATEGORY);
  });
});

describe("一覧", () => {
  const changes = setAffiliation([], ["石原", "松川"], 2026, LEAVE_CATEGORY, PT);
  const idx = indexAffiliationChanges(changes);

  it("区分ごとに分け、空の区分も移動先として返す", () => {
    const groups = groupByAffiliation(["石原", "松川", "福江", "西岡"], idx, 2026, PT);
    expect(groups.map((g) => g.category.key)).toEqual(AFFILIATION_CATEGORIES.map((c) => c.key));
    expect(groups.map((g) => g.names)).toEqual([["石原", "松川"], ["福江"], ["西岡"], []]);
    const empty = groupByAffiliation([], idx, 2026, PT);
    expect(empty).toHaveLength(AFFILIATION_CATEGORIES.length);
  });

  it("有給を記録する人は現役部 常勤だけ", () => {
    expect(leaveTrackedNames(["西岡", "石原", "福江", "松川"], idx, 2026, PT)).toEqual([
      "石原",
      "松川",
    ]);
    expect(leaveTrackedNames(["石原"], idx, 2025, PT)).toEqual([]);
  });

  it("前の年度から変わった人を出す", () => {
    expect(changesFromPreviousYear(["石原", "西岡"], idx, 2026, PT)).toEqual([
      { name: "石原", from: DEFAULT_CATEGORY, to: LEAVE_CATEGORY },
    ]);
    expect(changesFromPreviousYear(["石原"], idx, 2027, PT)).toEqual([]);
  });
});

describe("teacherNamesForYear", () => {
  const timetables = [
    { id: 1, name: "2025", startDate: "2025-04-01", endDate: "2026-03-31" },
    { id: 2, name: "2026", startDate: "2026-04-01" },
  ];
  const slots = [
    { id: 1, timetableId: 1, teacher: "旧講師", note: "" },
    { id: 2, timetableId: 2, teacher: "堀上·河野", note: "" },
    { id: 3, timetableId: 2, teacher: "半田", note: "隔週（香川）" },
  ];

  it("年度にかかる時間割のコマの講師 (隔週の相手を含む) だけ", () => {
    expect([...teacherNamesForYear(slots, timetables, 2026)].sort()).toEqual(
      ["半田", "堀上", "河野", "香川"].sort()
    );
    expect([...teacherNamesForYear(slots, timetables, 2025)]).toEqual(["旧講師"]);
  });
});

describe("retiredNamesForYear", () => {
  it("退職にした年度から後だけ退職。戻した年度からは退職ではない", () => {
    let changes = setAffiliation([], ["高松", "福江"], 2026, RETIRED_CATEGORY, PT);
    changes = setAffiliation(changes, ["石原"], 2026, LEAVE_CATEGORY, PT);
    changes = setAffiliation(changes, ["福江"], 2028, PART_TIME_CATEGORY, PT);
    expect([...retiredNamesForYear(changes, 2025)]).toEqual([]);
    expect([...retiredNamesForYear(changes, 2026)].sort()).toEqual(["福江", "高松"].sort());
    expect([...retiredNamesForYear(changes, 2027)].sort()).toEqual(["福江", "高松"].sort());
    expect([...retiredNamesForYear(changes, 2028)]).toEqual(["高松"]);
    expect([...retiredNamesForYear(changes, null)]).toEqual([]);
  });

  it("退職の区分は有給を記録しない", () => {
    expect(categoryMeta(RETIRED_CATEGORY).tracksLeave).toBe(false);
    expect(categoryMeta(RETIRED_CATEGORY).label).toBe("退職・非表示");
  });
});
