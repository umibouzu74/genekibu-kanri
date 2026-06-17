import { describe, it, expect } from "vitest";
import {
  firstSubjToken,
  dayPairLabel,
  daysForPairLabel,
  slotCohortId,
  deriveCohortsFromSlots,
  findCohortCutoff,
} from "./cohorts";

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

describe("dayPairLabel / daysForPairLabel", () => {
  it("pairs 火木 and 水金", () => {
    expect(dayPairLabel("火")).toBe("火木");
    expect(dayPairLabel("木")).toBe("火木");
    expect(dayPairLabel("水")).toBe("水金");
    expect(dayPairLabel("金")).toBe("水金");
  });
  it("leaves other days standalone", () => {
    expect(dayPairLabel("月")).toBe("月");
    expect(dayPairLabel("土")).toBe("土");
  });
  it("expands pair labels back to days", () => {
    expect(daysForPairLabel("火木")).toEqual(["火", "木"]);
    expect(daysForPairLabel("水金")).toEqual(["水", "金"]);
    expect(daysForPairLabel("月")).toEqual(["月"]);
  });
});

describe("slotCohortId", () => {
  it("keys high-school slots by grade + school (subj prefix)", () => {
    expect(slotCohortId(slot({ grade: "高1", subj: "高松西 数学" }))).toBe(
      "H|高1|高松西"
    );
    // same school, different subject → same cohort
    expect(slotCohortId(slot({ grade: "高1", subj: "高松西 英語" }))).toBe(
      "H|高1|高松西"
    );
    // different school → different cohort
    expect(slotCohortId(slot({ grade: "高1", subj: "高松一 数学" }))).toBe(
      "H|高1|高松一"
    );
  });
  it("keys middle-school slots by grade + day pair", () => {
    expect(slotCohortId(slot({ grade: "中3", day: "火", subj: "数学" }))).toBe(
      "M|中3|火木"
    );
    expect(slotCohortId(slot({ grade: "中3", day: "木", subj: "理科" }))).toBe(
      "M|中3|火木"
    );
    expect(slotCohortId(slot({ grade: "中3", day: "水", subj: "数学" }))).toBe(
      "M|中3|水金"
    );
    expect(slotCohortId(slot({ grade: "中3", day: "金", subj: "国語" }))).toBe(
      "M|中3|水金"
    );
  });
  it("treats 附中 as middle school", () => {
    expect(slotCohortId(slot({ grade: "附中3", day: "火", subj: "数学" }))).toBe(
      "M|附中3|火木"
    );
  });
});

describe("deriveCohortsFromSlots", () => {
  const slots = [
    slot({ id: 1, grade: "高1", subj: "高松西 数学", day: "火" }),
    slot({ id: 2, grade: "高1", subj: "高松西 英語", day: "木" }),
    slot({ id: 3, grade: "高1", subj: "高松一 数学", day: "火" }),
    slot({ id: 4, grade: "中3", subj: "数学", day: "火" }),
    slot({ id: 5, grade: "中3", subj: "国語", day: "木" }),
    slot({ id: 6, grade: "中3", subj: "数学", day: "水" }),
  ];

  it("dedupes by cohort and counts member slots", () => {
    const cohorts = deriveCohortsFromSlots(slots);
    const byId = Object.fromEntries(cohorts.map((c) => [c.id, c]));
    expect(byId["H|高1|高松西"].slotCount).toBe(2);
    expect(byId["H|高1|高松西"].slotIds).toEqual([1, 2]);
    expect(byId["H|高1|高松一"].slotCount).toBe(1);
    expect(byId["M|中3|火木"].slotCount).toBe(2);
    expect(byId["M|中3|水金"].slotCount).toBe(1);
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

  it("builds readable labels", () => {
    const cohorts = deriveCohortsFromSlots(slots);
    const labels = cohorts.map((c) => c.label);
    expect(labels).toContain("高1 高松西");
    expect(labels).toContain("中3 火木");
    expect(labels).toContain("中3 水金");
  });

  it("returns [] for non-array input", () => {
    expect(deriveCohortsFromSlots(null)).toEqual([]);
  });
});

describe("findCohortCutoff", () => {
  const cohortCutoffs = [
    { id: "H|高1|高松西", label: "高1 高松西", grade: "高1", date: "2026-07-10" },
    { id: "M|中3|水金", label: "中3 水金", grade: "中3", date: "2026-07-17" },
  ];

  it("matches a slot to its cohort cutoff by id", () => {
    expect(
      findCohortCutoff(slot({ grade: "高1", subj: "高松西 数学" }), cohortCutoffs)
        .date
    ).toBe("2026-07-10");
    expect(
      findCohortCutoff(
        slot({ grade: "中3", day: "金", subj: "数学" }),
        cohortCutoffs
      ).date
    ).toBe("2026-07-17");
  });

  it("returns null when no cohort entry matches", () => {
    expect(
      findCohortCutoff(slot({ grade: "高1", subj: "高松一 数学" }), cohortCutoffs)
    ).toBeNull();
    expect(findCohortCutoff(slot(), [])).toBeNull();
  });
});
