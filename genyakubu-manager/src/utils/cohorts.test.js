import { describe, it, expect } from "vitest";
import {
  firstSubjToken,
  isEnglishOrMathSubject,
  partitionDaysIntoCourses,
  deriveCohortsFromSlots,
  findCohortCutoff,
  buildSlotCohortIndex,
} from "./cohorts";
import { INIT_SLOTS } from "../data";

const slot = (over) => ({
  id: 1,
  day: "火",
  time: "19:00-20:20",
  grade: "高1",
  cls: "",
  room: "401",
  subj: "高松西 数学",
  teacher: "杉原",
  note: "",
  ...over,
});

describe("firstSubjToken", () => {
  it("returns the school/course prefix before a space", () => {
    expect(firstSubjToken("高松西 数学")).toBe("高松西");
    expect(firstSubjToken("東大京大医進 英語")).toBe("東大京大医進");
  });
  it("handles full-width spaces", () => {
    expect(firstSubjToken("高松一　英語")).toBe("高松一");
  });
  it("returns the whole string when there is no space", () => {
    expect(firstSubjToken("古文漢文")).toBe("古文漢文");
    expect(firstSubjToken("Speaking/Listening")).toBe("Speaking/Listening");
  });
  it("returns empty string for empty/nullish", () => {
    expect(firstSubjToken("")).toBe("");
    expect(firstSubjToken(undefined)).toBe("");
  });
});

describe("isEnglishOrMathSubject", () => {
  it("is true for 英語 / 数学 (incl. 文系/理系数学, 英語選抜)", () => {
    expect(isEnglishOrMathSubject("高松西 英語")).toBe(true);
    expect(isEnglishOrMathSubject("高松一 文系数学")).toBe(true);
    expect(isEnglishOrMathSubject("高松桜井 理系数学")).toBe(true);
    expect(isEnglishOrMathSubject("高松一 英語選抜")).toBe(true);
  });
  it("is false for non-英数 subjects", () => {
    expect(isEnglishOrMathSubject("高松一 物理")).toBe(false);
    expect(isEnglishOrMathSubject("高松高 化学")).toBe(false);
    expect(isEnglishOrMathSubject("古文漢文")).toBe(false); // 学校トークンのみ
  });
});

describe("partitionDaysIntoCourses", () => {
  const part = (days) => partitionDaysIntoCourses(new Set(days));

  it("groups all weekdays of a grade into one course", () => {
    expect(part(["火", "金"])).toEqual([["火", "金"]]); // 中1
    expect(part(["月", "木"])).toEqual([["月", "木"]]); // 中2
    expect(part(["水"])).toEqual([["水"]]); // 附中
    expect(part(["火", "水", "木", "金"])).toEqual([["火", "水", "木", "金"]]); // 中3
  });

  it("treats 土 as its own course, separate from weekdays", () => {
    expect(part(["火", "水", "木", "金", "土"])).toEqual([
      ["火", "水", "木", "金"],
      ["土"],
    ]);
    expect(part(["土"])).toEqual([["土"]]);
  });

  it("orders days within a group week-wise regardless of insertion order", () => {
    expect(part(["金", "火"])).toEqual([["火", "金"]]);
  });
});

describe("deriveCohortsFromSlots", () => {
  const slots = [
    // 高1・2: 英数のみセット化。英数以外 (物理・古文漢文) は除外。
    slot({ id: 1, grade: "高1", subj: "高松西 数学", day: "火" }),
    slot({ id: 2, grade: "高1", subj: "高松西 英語", day: "木" }),
    slot({ id: 3, grade: "高1", subj: "高松一 数学", day: "火" }),
    slot({ id: 11, grade: "高1", subj: "高松西 物理", day: "金" }),
    slot({ id: 12, grade: "高2", subj: "古文漢文", day: "木" }),
    // 高3: 科目別 (英数フィルタなし)
    slot({ id: 13, grade: "高3", subj: "共テ物理", day: "水" }),
    // 中1 は火・金のみ (= 同じ生徒が週2回通う1コース)
    slot({ id: 4, grade: "中1", subj: "数学", day: "火" }),
    slot({ id: 5, grade: "中1", subj: "国語", day: "金" }),
    // 中3 は平日を1コースに束ね、土は別コース
    slot({ id: 6, grade: "中3", subj: "数学", day: "火" }),
    slot({ id: 7, grade: "中3", subj: "国語", day: "木" }),
    slot({ id: 8, grade: "中3", subj: "数学", day: "水" }),
    slot({ id: 9, grade: "中3", subj: "英語", day: "金" }),
    slot({ id: 10, grade: "中3", subj: "理科A", day: "土" }),
  ];
  const derive = () =>
    Object.fromEntries(deriveCohortsFromSlots(slots).map((c) => [c.id, c]));

  it("groups a single twice-weekly middle-school course into ONE cohort", () => {
    const byId = derive();
    expect(byId["M|中1|火金"].label).toBe("中1 火金");
    expect(byId["M|中1|火金"].days).toEqual(["火", "金"]);
    expect(byId["M|中1|火金"].slotIds).toEqual([4, 5]);
    expect(byId["M|中1|火木"]).toBeUndefined();
    expect(byId["M|中1|水金"]).toBeUndefined();
  });

  it("groups 中3 weekdays into ONE course, keeping 土 separate", () => {
    const byId = derive();
    expect(byId["M|中3|火水木金"].slotCount).toBe(4);
    expect(byId["M|中3|火水木金"].label).toBe("中3 火水木金");
    expect(byId["M|中3|土"].slotCount).toBe(1);
    expect(byId["M|中3|火木"]).toBeUndefined();
    expect(byId["M|中3|水金"]).toBeUndefined();
  });

  it("bundles only 英数 per school for 高1・2, excluding other subjects", () => {
    const cohorts = deriveCohortsFromSlots(slots);
    const byId = Object.fromEntries(cohorts.map((c) => [c.id, c]));
    expect(byId["H|高1|高松西|英数"].slotCount).toBe(2);
    expect(byId["H|高1|高松西|英数"].slotIds).toEqual([1, 2]);
    expect(byId["H|高1|高松西|英数"].label).toBe("高1 高松西 英数");
    expect(byId["H|高1|高松一|英数"].slotCount).toBe(1);
    // 物理(11) と 古文漢文(12) はどのコホートにも属さない。
    const owned = new Set(cohorts.flatMap((c) => c.slotIds));
    expect(owned.has(11)).toBe(false);
    expect(owned.has(12)).toBe(false);
  });

  it("keys 高3 cohorts by subject token (no 英数 filter)", () => {
    const byId = derive();
    expect(byId["H|高3|共テ物理"].slotCount).toBe(1);
    expect(byId["H|高3|共テ物理"].label).toBe("高3 共テ物理");
  });

  it("orders middle school before high school", () => {
    const cohorts = deriveCohortsFromSlots(slots);
    const firstHighIdx = cohorts.findIndex((c) => c.dept === "高校部");
    const lastMidIdx =
      cohorts.length -
      1 -
      [...cohorts].reverse().findIndex((c) => c.dept === "中学部");
    expect(lastMidIdx).toBeLessThan(firstHighIdx);
  });

  it("returns [] for non-array input", () => {
    expect(deriveCohortsFromSlots(null)).toEqual([]);
  });
});

describe("findCohortCutoff", () => {
  const cohortCutoffs = [
    { id: "H|高1|高松西|英数", label: "高1 高松西 英数", grade: "高1", date: "2026-07-10" },
    { id: "M|中3|火水木金", label: "中3 火水木金", grade: "中3", date: "2026-07-17" },
    { id: "M|中1|火金", label: "中1 火金", grade: "中1", date: "2026-07-15" },
    { id: "H|高3|共テ物理", label: "高3 共テ物理", grade: "高3", date: "2026-07-05" },
  ];

  it("matches a 高1・2 英数 slot by grade + school", () => {
    expect(
      findCohortCutoff(slot({ grade: "高1", subj: "高松西 数学" }), cohortCutoffs)
        .date
    ).toBe("2026-07-10");
  });

  it("does NOT match a non-英数 slot to the 英数 cohort", () => {
    // 高1 高松西 物理 は英数スコープのコホートには属さない。
    expect(
      findCohortCutoff(slot({ grade: "高1", subj: "高松西 物理" }), cohortCutoffs)
    ).toBeNull();
  });

  it("matches a 高3 subject-token cohort regardless of subject kind", () => {
    expect(
      findCohortCutoff(slot({ grade: "高3", subj: "共テ物理" }), cohortCutoffs).date
    ).toBe("2026-07-05");
  });

  it("matches a middle-school slot when its day is in the cohort's day list", () => {
    expect(
      findCohortCutoff(slot({ grade: "中3", day: "水", subj: "数学" }), cohortCutoffs)
        .date
    ).toBe("2026-07-17");
    expect(
      findCohortCutoff(slot({ grade: "中1", day: "金", subj: "国語" }), cohortCutoffs)
        .date
    ).toBe("2026-07-15");
  });

  it("does not match a slot whose day is outside the cohort's day list", () => {
    // 中3 土 は平日コホート (火水木金) には属さない。
    expect(
      findCohortCutoff(slot({ grade: "中3", day: "土", subj: "理科A" }), cohortCutoffs)
    ).toBeNull();
  });

  it("returns null when no cohort entry matches", () => {
    expect(
      findCohortCutoff(slot({ grade: "高1", subj: "高松一 数学" }), cohortCutoffs)
    ).toBeNull();
    expect(findCohortCutoff(slot(), [])).toBeNull();
  });

  it("round-trips INIT_SLOTS: owned slots resolve to their cohort, excluded ones to none", () => {
    const cohorts = deriveCohortsFromSlots(INIT_SLOTS);
    const cutoffs = cohorts.map((c) => ({
      id: c.id,
      label: c.label,
      grade: c.grade,
      date: "2026-07-20",
    }));
    const mismatches = [];
    for (const s of INIT_SLOTS) {
      const owner = cohorts.find((c) => c.slotIds.includes(s.id));
      const match = findCohortCutoff(s, cutoffs);
      if (owner) {
        if (!match || match.id !== owner.id) {
          mismatches.push(`slot ${s.id} (${s.grade}/${s.subj}) owner=${owner.id} match=${match?.id}`);
        }
      } else if (match) {
        mismatches.push(`slot ${s.id} (${s.grade}/${s.subj}) excluded but matched ${match.id}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("buildSlotCohortIndex maps each slot to its cohort's slotIds (≥2 only)", () => {
    const idx = buildSlotCohortIndex([
      slot({ id: 1, grade: "高1", subj: "高松西 数学", day: "月" }),
      slot({ id: 2, grade: "高1", subj: "高松西 英語", day: "木" }),
      slot({ id: 3, grade: "高1", subj: "高松西 物理", day: "金" }), // 英数外 → 除外
      slot({ id: 4, grade: "中1", subj: "数学", day: "火" }), // 単体コホート → 除外
    ]);
    expect(idx.get(1)).toEqual([1, 2]); // 高1 高松西 英数
    expect(idx.get(2)).toEqual([1, 2]);
    expect(idx.has(3)).toBe(false); // 物理はコホート対象外
    expect(idx.has(4)).toBe(false); // 1 コマだけのコホートは索引しない
  });

  it("excludes exactly the non-英数 高1・2 subjects from cohorts (INIT_SLOTS)", () => {
    const cohorts = deriveCohortsFromSlots(INIT_SLOTS);
    const owned = new Set(cohorts.flatMap((c) => c.slotIds));
    const excluded = INIT_SLOTS.filter((s) => !owned.has(s.id)).map(
      (s) => `${s.grade} ${s.subj}`
    );
    expect(excluded.sort()).toEqual(
      [
        "高1 古文漢文",
        "高2 古文漢文",
        "高2 高松一 物理",
        "高2 高松一 化学",
        "高2 高松高 物理",
        "高2 高松高 化学",
      ].sort()
    );
  });
});
