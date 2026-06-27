import { describe, it, expect } from "vitest";
import {
  firstSubjToken,
  partitionDaysIntoCourses,
  deriveCohortsFromSlots,
  findCohortCutoff,
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

describe("partitionDaysIntoCourses", () => {
  const part = (days) => partitionDaysIntoCourses(new Set(days));

  it("keeps a single twice-weekly course as one group (中1=火金, 中2=月木)", () => {
    expect(part(["火", "金"])).toEqual([["火", "金"]]);
    expect(part(["月", "木"])).toEqual([["月", "木"]]);
  });

  it("keeps a once-weekly course as one group (附中=水)", () => {
    expect(part(["水"])).toEqual([["水"]]);
  });

  it("splits into 火木 / 水金 only when both pairs are present (中3)", () => {
    expect(part(["火", "水", "木", "金"])).toEqual([
      ["火", "木"],
      ["水", "金"],
    ]);
  });

  it("treats 土 as its own course, separate from weekdays", () => {
    expect(part(["火", "木", "水", "金", "土"])).toEqual([
      ["火", "木"],
      ["水", "金"],
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
    slot({ id: 1, grade: "高1", subj: "高松西 数学", day: "火" }),
    slot({ id: 2, grade: "高1", subj: "高松西 英語", day: "木" }),
    slot({ id: 3, grade: "高1", subj: "高松一 数学", day: "火" }),
    // 中1 は火・金のみ (= 同じ生徒が週2回通う1コース)
    slot({ id: 4, grade: "中1", subj: "数学", day: "火" }),
    slot({ id: 5, grade: "中1", subj: "国語", day: "金" }),
    // 中3 は火木と水金で生徒が分かれる2コース + 土曜特訓
    slot({ id: 6, grade: "中3", subj: "数学", day: "火" }),
    slot({ id: 7, grade: "中3", subj: "国語", day: "木" }),
    slot({ id: 8, grade: "中3", subj: "数学", day: "水" }),
    slot({ id: 9, grade: "中3", subj: "英語", day: "金" }),
    slot({ id: 10, grade: "中3", subj: "理科A", day: "土" }),
  ];

  it("groups a single twice-weekly middle-school course into ONE cohort", () => {
    const byId = Object.fromEntries(
      deriveCohortsFromSlots(slots).map((c) => [c.id, c])
    );
    expect(byId["M|中1|火金"]).toBeTruthy();
    expect(byId["M|中1|火金"].label).toBe("中1 火金");
    expect(byId["M|中1|火金"].days).toEqual(["火", "金"]);
    expect(byId["M|中1|火金"].slotCount).toBe(2);
    expect(byId["M|中1|火金"].slotIds).toEqual([4, 5]);
    // 旧モデルの偽ペア ID は生成されない。
    expect(byId["M|中1|火木"]).toBeUndefined();
    expect(byId["M|中1|水金"]).toBeUndefined();
  });

  it("splits 中3 into 火木 / 水金 / 土 cohorts", () => {
    const byId = Object.fromEntries(
      deriveCohortsFromSlots(slots).map((c) => [c.id, c])
    );
    expect(byId["M|中3|火木"].slotCount).toBe(2);
    expect(byId["M|中3|水金"].slotCount).toBe(2);
    expect(byId["M|中3|土"].slotCount).toBe(1);
    expect(byId["M|中3|火木"].label).toBe("中3 火木");
  });

  it("keys high-school cohorts by grade + school (subj prefix)", () => {
    const byId = Object.fromEntries(
      deriveCohortsFromSlots(slots).map((c) => [c.id, c])
    );
    expect(byId["H|高1|高松西"].slotCount).toBe(2);
    expect(byId["H|高1|高松西"].slotIds).toEqual([1, 2]);
    expect(byId["H|高1|高松一"].slotCount).toBe(1);
    expect(byId["H|高1|高松西"].label).toBe("高1 高松西");
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
    { id: "H|高1|高松西", label: "高1 高松西", grade: "高1", date: "2026-07-10" },
    { id: "M|中3|水金", label: "中3 水金", grade: "中3", date: "2026-07-17" },
    { id: "M|中1|火金", label: "中1 火金", grade: "中1", date: "2026-07-15" },
  ];

  it("matches a high-school slot by grade + school", () => {
    expect(
      findCohortCutoff(slot({ grade: "高1", subj: "高松西 数学" }), cohortCutoffs)
        .date
    ).toBe("2026-07-10");
  });

  it("matches a middle-school slot when its day is in the cohort's day list", () => {
    // 中3 水金 コホートは水・金どちらの slot にも一致する。
    expect(
      findCohortCutoff(slot({ grade: "中3", day: "水", subj: "数学" }), cohortCutoffs)
        .date
    ).toBe("2026-07-17");
    expect(
      findCohortCutoff(slot({ grade: "中3", day: "金", subj: "国語" }), cohortCutoffs)
        .date
    ).toBe("2026-07-17");
  });

  it("matches both days of a merged twice-weekly course (中1 火金)", () => {
    expect(
      findCohortCutoff(slot({ grade: "中1", day: "火", subj: "数学" }), cohortCutoffs)
        .date
    ).toBe("2026-07-15");
    expect(
      findCohortCutoff(slot({ grade: "中1", day: "金", subj: "国語" }), cohortCutoffs)
        .date
    ).toBe("2026-07-15");
  });

  it("does not match a slot whose day is outside the cohort's day list", () => {
    // 中3 木 は 水金 コホートには属さない (火木側)。
    expect(
      findCohortCutoff(slot({ grade: "中3", day: "木", subj: "国語" }), cohortCutoffs)
    ).toBeNull();
  });

  it("returns null when no cohort entry matches", () => {
    expect(
      findCohortCutoff(slot({ grade: "高1", subj: "高松一 数学" }), cohortCutoffs)
    ).toBeNull();
    expect(findCohortCutoff(slot(), [])).toBeNull();
  });

  it("round-trips INIT_SLOTS: each slot resolves to the cohort that owns it", () => {
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
      if (!owner || !match || match.id !== owner.id) {
        mismatches.push(
          `slot ${s.id} (${s.grade}/${s.day}) owner=${owner?.id} match=${match?.id}`
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
