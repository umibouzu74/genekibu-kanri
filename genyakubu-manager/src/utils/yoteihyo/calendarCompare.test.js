import { describe, expect, it } from "vitest";
import {
  CALENDAR_HOLIDAY_LABEL,
  calendarDayLabel,
  collectMovesFromSheets,
  compareCalendar,
  isNoClassDay,
} from "./calendarCompare";
import { parseAnnualCalendarSheet } from "./annualCalendarSheet";
import { parseMiddleSchoolSheet } from "./middleSchoolSheet";
import { smallCalendarSheet, smallT1T2Sheet } from "./testUtils";
import { makeEventHelpers } from "../../components/views/dashboardHelpers";
import { buildCancelIndex } from "../slotCancel";

const calendar = parseAnnualCalendarSheet(smallCalendarSheet().sheet);

// 月曜・土曜・火曜のコマ (10/12 月 スポーツの日・10/17 土 塾の休み・11/3 火 文化の日・
// 11/23 月 勤労感謝の日 = 授業可能)
const SLOTS = [
  { id: 1, day: "月", time: "19:40-20:40", grade: "中2", subj: "数学", teacher: "A" },
  { id: 2, day: "土", time: "15:00-16:00", grade: "中1-3", subj: "プレップ", teacher: "B" },
  { id: 3, day: "火", time: "19:40-20:40", grade: "高1", subj: "高松西 英語", teacher: "C" },
];
// compare.test.js の makeSys と同じ組み立て (休講日の判定は ctx.isOffForGrade)
function sysWith({ holidays = [], adjustments = [] } = {}) {
  const helpers = makeEventHelpers(holidays, [], []);
  const ctx = {
    classSets: [],
    allSlots: SLOTS,
    displayCutoff: null,
    timetables: [],
    isOffForGrade: helpers.isOffForGrade,
    biweeklyAnchors: [],
    holidays,
    examPeriods: [],
    sessionOverrides: [],
    daySchedules: [],
    adjustments,
    _cancelIndex: buildCancelIndex(adjustments),
    orientationOnFirstDay: true,
  };
  return { ctx, adjustments, holidays, examPeriods: [], displayCutoff: null, timetables: [] };
}

describe("isNoClassDay / calendarDayLabel", () => {
  it("塾の休みと、授業可能の印の無い祝日", () => {
    expect(isNoClassDay(calendar.days.get("2026-10-17"))).toBe(true);
    expect(isNoClassDay(calendar.days.get("2026-10-12"))).toBe(true);
    expect(isNoClassDay(calendar.days.get("2026-11-23"))).toBe(false);
    expect(isNoClassDay(calendar.days.get("2026-12-01"))).toBe(false); // 教員半休
    expect(calendarDayLabel(calendar.days.get("2026-11-23"))).toBe("授業可能の祝日 勤労感謝の日");
    expect(calendarDayLabel(calendar.days.get("2026-10-17"))).toBe("塾の休み");
  });
});

describe("compareCalendar", () => {
  it("授業の無い日にシステムの授業があれば全日休講の案", () => {
    const items = compareCalendar({ calendar, slots: SLOTS, sys: sysWith() });
    const byDate = new Map(items.map((x) => [x.date, x]));
    expect(byDate.get("2026-10-12")).toMatchObject({ type: "classes", label: "祝日 スポーツの日" });
    expect(byDate.get("2026-10-12").held.map((s) => s.id)).toEqual([1]);
    expect(byDate.get("2026-10-12").fix.holidays).toEqual([
      { date: "2026-10-12", label: "スポーツの日", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ]);
    expect(byDate.get("2026-10-17").fix.holidays[0].label).toBe(CALENDAR_HOLIDAY_LABEL);
    expect(byDate.get("2026-11-03").held.map((s) => s.id)).toEqual([3]);
    // 授業可能の祝日・普通の日は出ない
    expect(byDate.has("2026-11-23")).toBe(false);
    expect(byDate.has("2026-10-13")).toBe(false);
  });

  it("全日休講が登録済みなら出ない。授業可能の日の全日休講・印の無い日の全日休講は知らせる", () => {
    const holidays = [
      { id: 1, date: "2026-10-12", label: "スポーツの日", scope: ["全部"] },
      { id: 2, date: "2026-11-23", label: "勤労感謝の日", scope: ["全部"] },
      { id: 3, date: "2026-10-14", label: "臨時休講", scope: ["全部"] },
      // 日曜・部門だけの休講日は知らせない
      { id: 4, date: "2026-10-18", label: "日曜", scope: ["全部"] },
      { id: 5, date: "2026-10-15", label: "高校部だけ", scope: ["高校部"] },
    ];
    const items = compareCalendar({ calendar, slots: SLOTS, sys: sysWith({ holidays }) });
    const byDate = new Map(items.map((x) => [x.date, x]));
    expect(byDate.has("2026-10-12")).toBe(false);
    expect(byDate.get("2026-11-23")).toMatchObject({ type: "openButClosed" });
    expect(byDate.get("2026-10-14")).toMatchObject({ type: "systemOnly" });
    expect(byDate.has("2026-10-18")).toBe(false);
    expect(byDate.has("2026-10-15")).toBe(false);
  });

  it("予定表の注記で他の日へ振り替えている日は休講日にせず振替先を返す", () => {
    const moves = new Map([["2026-10-12", new Set(["2026-10-09"])]]);
    const items = compareCalendar({ calendar, slots: SLOTS, sys: sysWith(), moves });
    const it12 = items.find((x) => x.date === "2026-10-12");
    expect(it12.moveTargets).toEqual(["2026-10-09"]);
    expect(it12.fix.holidays).toEqual([]);
  });

  it("代行・合同のあるコマは注意に出す", () => {
    const sys = sysWith({ adjustments: [{ id: 1, type: "move", date: "2026-10-12", slotId: 1 }] });
    const it12 = compareCalendar({ calendar, slots: SLOTS, sys }).find((x) => x.date === "2026-10-12");
    expect(it12.cautions).toEqual([{ slot: SLOTS[0], reason: "adjustment" }]);
  });
});

describe("collectMovesFromSheets", () => {
  it("中学部の予定表の備考「11/9(月)の授業を11/6(金)に振替」から振替元 → 振替先", () => {
    const moves = collectMovesFromSheets([parseMiddleSchoolSheet(smallT1T2Sheet())]);
    expect([...moves.get("2026-11-09")]).toEqual(["2026-11-06"]);
  });
});
