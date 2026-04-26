import { describe, expect, it } from "vitest";
import {
  dateToDay,
  fmtDate,
  fmtDateWeekday,
  formatDateRange,
  overlapsRange,
  parseLocalDate,
  timeToMin,
} from "./dateHelpers";

describe("parseLocalDate", () => {
  it("returns null for falsy or invalid input", () => {
    expect(parseLocalDate(null)).toBeNull();
    expect(parseLocalDate(undefined)).toBeNull();
    expect(parseLocalDate("")).toBeNull();
    expect(parseLocalDate("not a date")).toBeNull();
  });

  it("parses YYYY-MM-DD as local-time midnight", () => {
    const d = parseLocalDate("2026-04-19");
    expect(d).not.toBeNull();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April = 3
    expect(d.getDate()).toBe(19);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("round-trips with fmtDate", () => {
    const orig = "2027-01-01";
    expect(fmtDate(parseLocalDate(orig))).toBe(orig);
  });

  it("is ordering-safe for string comparison before/after", () => {
    const a = parseLocalDate("2026-04-19");
    const b = parseLocalDate("2026-04-20");
    expect(a < b).toBe(true);
    expect(b > a).toBe(true);
  });
});

describe("timeToMin", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(timeToMin("00:00")).toBe(0);
    expect(timeToMin("09:30")).toBe(570);
    expect(timeToMin("19:50")).toBe(1190);
  });
});

describe("fmtDate", () => {
  it("formats a Date to YYYY-MM-DD with zero padding", () => {
    expect(fmtDate(new Date(2026, 0, 3))).toBe("2026-01-03");
    expect(fmtDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("fmtDateWeekday", () => {
  it("returns '' when input is falsy", () => {
    expect(fmtDateWeekday("")).toBe("");
    expect(fmtDateWeekday(null)).toBe("");
  });

  it("appends (weekday) to the date", () => {
    // 2026-04-19 is a Sunday
    expect(fmtDateWeekday("2026-04-19")).toBe("2026-04-19 (日)");
  });
});

describe("overlapsRange", () => {
  it("returns true when ranges share any day (inclusive)", () => {
    expect(overlapsRange("2026-05-01", "2026-05-05", "2026-05-03", "2026-05-10")).toBe(true);
    expect(overlapsRange("2026-05-10", "2026-05-12", "2026-05-01", "2026-05-10")).toBe(true);
    // Single-day overlaps
    expect(overlapsRange("2026-05-05", "2026-05-05", "2026-05-05", "2026-05-05")).toBe(true);
  });

  it("returns false when ranges are disjoint", () => {
    expect(overlapsRange("2026-05-01", "2026-05-03", "2026-05-04", "2026-05-10")).toBe(false);
    expect(overlapsRange("2026-05-11", "2026-05-15", "2026-05-01", "2026-05-10")).toBe(false);
  });
});

describe("formatDateRange", () => {
  it("returns empty string for falsy start", () => {
    expect(formatDateRange("", "2026-05-05")).toBe("");
    expect(formatDateRange(null, "2026-05-05")).toBe("");
  });

  it("returns just the start date when end is missing or equal", () => {
    expect(formatDateRange("2026-05-05")).toBe("2026-05-05");
    expect(formatDateRange("2026-05-05", "")).toBe("2026-05-05");
    expect(formatDateRange("2026-05-05", "2026-05-05")).toBe("2026-05-05");
  });

  it("returns 'start 〜 end' for multi-day ranges", () => {
    expect(formatDateRange("2026-05-01", "2026-05-05")).toBe("2026-05-01 〜 2026-05-05");
  });
});

describe("dateToDay", () => {
  it("returns the weekday when it falls within DAYS", () => {
    // 2026-04-20 is a Monday
    expect(dateToDay("2026-04-20")).toBe("月");
  });

  it("returns null for Sundays (not in DAYS)", () => {
    // DAYS typically excludes 日
    expect(dateToDay("2026-04-19")).toBeNull();
  });
});
