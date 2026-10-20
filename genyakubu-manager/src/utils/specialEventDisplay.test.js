import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPECIAL_EVENT_DISPLAY,
  bandSpecialEventsInRange,
  isBandSpecialEvent,
  isTypeShownInTeacherMonth,
  normalizeSpecialEventDisplay,
  specialEventSpanDays,
} from "./specialEventDisplay";
import { isSpecialEventVisibleInTeacherView } from "../components/EventVisibilityToggles";
import { EVENT_KIND } from "../constants/eventKinds";

describe("normalizeSpecialEventDisplay", () => {
  it("既定値: 学校の予定・入試は出さない、他は出す", () => {
    expect(DEFAULT_SPECIAL_EVENT_DISPLAY.monthTypes).toEqual({
      school: false,
      jukuTest: true,
      entrance: false,
      course: true,
      parents: true,
      staff: true,
      other: true,
    });
  });

  it("RTDB が消した空・欠けた種別を既定値で埋める (全種別の真偽値を必ず持つ)", () => {
    expect(normalizeSpecialEventDisplay(null)).toEqual(DEFAULT_SPECIAL_EVENT_DISPLAY);
    expect(normalizeSpecialEventDisplay({})).toEqual(DEFAULT_SPECIAL_EVENT_DISPLAY);
    const out = normalizeSpecialEventDisplay({ monthTypes: { school: true, course: false, bogus: true } });
    expect(out.monthTypes).toEqual({ ...DEFAULT_SPECIAL_EVENT_DISPLAY.monthTypes, school: true, course: false });
    expect(Object.values(out.monthTypes).every((v) => typeof v === "boolean")).toBe(true);
  });
});

describe("isTypeShownInTeacherMonth / isSpecialEventVisibleInTeacherView", () => {
  const display = normalizeSpecialEventDisplay({ monthTypes: { jukuTest: false } });
  const on = { [EVENT_KIND.SPECIAL]: true };

  it("設定の真偽値。設定が無ければ既定値", () => {
    expect(isTypeShownInTeacherMonth(display, "jukuTest")).toBe(false);
    expect(isTypeShownInTeacherMonth(display, "course")).toBe(true);
    expect(isTypeShownInTeacherMonth(undefined, "school")).toBe(false);
    expect(isTypeShownInTeacherMonth(undefined, "staff")).toBe(true);
  });

  it("種別で絞ったうえで、表示トグル・タグの絞り込みを掛ける", () => {
    const ev = (eventType, tags = []) => ({ id: 1, eventType, tags });
    expect(isSpecialEventVisibleInTeacherView(ev("course"), on, display)).toBe(true);
    expect(isSpecialEventVisibleInTeacherView(ev("jukuTest"), on, display)).toBe(false);
    expect(isSpecialEventVisibleInTeacherView(ev("school"), on, display)).toBe(false);
    // 特別イベントのトグルが OFF なら出さない
    expect(isSpecialEventVisibleInTeacherView(ev("course"), {}, display)).toBe(false);
    // タグの絞り込み
    const offChu = { ...on, tagFilters: { 中学: false } };
    expect(isSpecialEventVisibleInTeacherView(ev("course", ["中学"]), offChu, display)).toBe(false);
  });
});

describe("長い期間の帯", () => {
  const ev = (id, startDate, endDate) => ({ id, startDate, endDate });

  it("日数は両端を含む", () => {
    expect(specialEventSpanDays(ev(1, "2026-12-25", "2026-12-25"))).toBe(1);
    expect(specialEventSpanDays(ev(1, "2026-12-25", "2026-12-28"))).toBe(4);
    expect(specialEventSpanDays(ev(1, "2027-01-12", "2027-03-04"))).toBe(52);
    expect(specialEventSpanDays(ev(1, "2026-11-28", "2026-12-06"))).toBe(9);
  });

  it("8 日以上が帯 (7 日以下はセル)", () => {
    expect(isBandSpecialEvent(ev(1, "2026-12-01", "2026-12-07"))).toBe(false);
    expect(isBandSpecialEvent(ev(1, "2026-12-01", "2026-12-08"))).toBe(true);
  });

  it("月と重なる長いものだけ、開始日順", () => {
    const events = [
      ev(1, "2027-01-12", "2027-03-04"), // 直前ポイント
      ev(2, "2027-01-09", "2027-03-06"), // 弱点補強
      ev(3, "2027-01-04", "2027-01-07"), // 冬期講習 (後半) = セル
      ev(4, "2026-11-28", "2026-12-06"), // 保護者会 (12 月にもかかる)
    ];
    expect(bandSpecialEventsInRange(events, "2027-02-01", "2027-02-31").map((e) => e.id)).toEqual([2, 1]);
    expect(bandSpecialEventsInRange(events, "2026-12-01", "2026-12-31").map((e) => e.id)).toEqual([4]);
    expect(bandSpecialEventsInRange(events, "2027-04-01", "2027-04-31")).toEqual([]);
  });
});
