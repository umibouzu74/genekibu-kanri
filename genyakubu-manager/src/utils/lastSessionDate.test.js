import { describe, expect, it } from "vitest";
import { findLastSessionOnOrBefore } from "./lastSessionDate";

// 2026-07-14 は火曜, 07-17 は金曜, 07-18 は土曜
const DISPLAY_CUTOFF = {
  groups: [{ label: "中1", grades: ["中1"], startDate: "2026-04-07", date: "2026-07-18" }],
  cohorts: [],
};

const makeSlot = (id, day, time, extras = {}) => ({
  id,
  day,
  time,
  grade: "中1",
  cls: "",
  room: "602",
  subj: "数学",
  teacher: "T",
  note: "",
  ...extras,
});

const tue = makeSlot(1, "火", "18:55-19:40");
const fri = makeSlot(2, "金", "18:55-19:40");

const baseCtx = {
  classSets: [],
  allSlots: [tue, fri],
  displayCutoff: DISPLAY_CUTOFF,
  timetables: [],
  isOffForGrade: () => false,
  biweeklyAnchors: [],
  holidays: [],
  examPeriods: [],
  sessionOverrides: [],
  daySchedules: [],
};

describe("findLastSessionOnOrBefore", () => {
  it("終了日 (土) の手前で、実際の最終授業日 (金) と第N回を返す", () => {
    const r = findLastSessionOnOrBefore([tue, fri], "2026-07-18", baseCtx);
    expect(r.date).toBe("2026-07-17");
    expect(r.sessionNo).toBeGreaterThan(0);
  });

  it("最終授業日が休講ならさらに遡る (火曜へ)", () => {
    const ctx = {
      ...baseCtx,
      isOffForGrade: (dateStr) => dateStr === "2026-07-17",
    };
    const r = findLastSessionOnOrBefore([tue, fri], "2026-07-18", ctx);
    expect(r.date).toBe("2026-07-14");
  });

  it("開始日未設定でも日付は返す (第N回は 0)", () => {
    const dc = { groups: [{ label: "中1", grades: ["中1"], startDate: null, date: "2026-07-18" }] };
    const r = findLastSessionOnOrBefore([tue, fri], "2026-07-18", {
      ...baseCtx,
      displayCutoff: dc,
    });
    expect(r.date).toBe("2026-07-17");
    expect(r.sessionNo).toBe(0);
  });

  it("遡り範囲に授業が無ければ null", () => {
    const r = findLastSessionOnOrBefore([tue, fri], "2026-07-18", baseCtx, {
      maxLookbackDays: 0,
    });
    expect(r).toBeNull();
  });

  it("終了日・コマ・ctx が無ければ null", () => {
    expect(findLastSessionOnOrBefore([], "2026-07-18", baseCtx)).toBeNull();
    expect(findLastSessionOnOrBefore([tue], "", baseCtx)).toBeNull();
    expect(findLastSessionOnOrBefore([tue], "2026-07-18", null)).toBeNull();
  });
});
