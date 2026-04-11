import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  isHoliday,
  isSlot,
  isSub,
  migrateExportBundle,
  nextNumericId,
  validateExportBundle,
} from "./schema";

const goodSlot = {
  id: 1,
  day: "月",
  time: "19:00-20:20",
  grade: "中1",
  cls: "S",
  room: "601",
  subj: "英語",
  teacher: "山田",
  note: "",
};

const goodHoliday = { date: "2026-01-01", label: "元日", scope: ["全部"] };

const goodSub = {
  id: 1,
  date: "2026-04-10",
  slotId: 1,
  originalTeacher: "山田",
  substitute: "鈴木",
  status: "confirmed",
  memo: "",
};

describe("type guards", () => {
  it("isSlot accepts a valid slot", () => {
    expect(isSlot(goodSlot)).toBe(true);
  });

  it("isSlot rejects a slot without id", () => {
    expect(isSlot({ ...goodSlot, id: undefined })).toBe(false);
  });

  it("isSlot rejects non-objects", () => {
    expect(isSlot(null)).toBe(false);
    expect(isSlot("nope")).toBe(false);
    expect(isSlot([])).toBe(false);
  });

  it("isHoliday requires a date string", () => {
    expect(isHoliday(goodHoliday)).toBe(true);
    expect(isHoliday({ label: "x" })).toBe(false);
  });

  it("isSub accepts numeric and string slotId", () => {
    expect(isSub(goodSub)).toBe(true);
    expect(isSub({ ...goodSub, slotId: "abc" })).toBe(true);
    expect(isSub({ ...goodSub, slotId: null })).toBe(false);
  });
});

describe("validateExportBundle", () => {
  it("returns ok for an empty object", () => {
    expect(validateExportBundle({})).toEqual({ ok: true, data: {} });
  });

  it("accepts a well-formed bundle", () => {
    const bundle = {
      schemaVersion: 1,
      slots: [goodSlot],
      holidays: [goodHoliday],
      substitutions: [goodSub],
      partTimeStaff: ["田中"],
      biweeklyBase: "2026-04-01",
    };
    const r = validateExportBundle(bundle);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual(bundle);
  });

  it("rejects non-objects", () => {
    expect(validateExportBundle(null).ok).toBe(false);
    expect(validateExportBundle([]).ok).toBe(false);
    expect(validateExportBundle("foo").ok).toBe(false);
  });

  it("reports the bad index for an invalid slot", () => {
    const r = validateExportBundle({
      slots: [goodSlot, { ...goodSlot, teacher: 42 }],
    });
    expect(r.ok).toBe(false);
    expect(r.path).toBe("slots[1]");
  });

  it("reports the bad index for an invalid holiday", () => {
    const r = validateExportBundle({ holidays: [goodHoliday, {}] });
    expect(r.ok).toBe(false);
    expect(r.path).toBe("holidays[1]");
  });

  it("rejects non-array slots", () => {
    const r = validateExportBundle({ slots: "nope" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/slots/);
  });

  it("rejects non-string biweeklyBase", () => {
    const r = validateExportBundle({ biweeklyBase: 123 });
    expect(r.ok).toBe(false);
  });
});

describe("migrateExportBundle", () => {
  it("adds schemaVersion on unversioned payloads", () => {
    const out = migrateExportBundle({ slots: [] }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("fills in default scope for holidays without one", () => {
    const out = migrateExportBundle({
      holidays: [{ date: "2026-05-04", label: "みどりの日" }],
    }) as Record<string, unknown>;
    const holidays = out.holidays as Array<Record<string, unknown>>;
    expect(holidays[0].scope).toEqual(["全部"]);
  });

  it("leaves existing scope untouched", () => {
    const out = migrateExportBundle({
      schemaVersion: 1,
      holidays: [{ date: "2026-05-04", label: "x", scope: ["中学部"] }],
    }) as Record<string, unknown>;
    const holidays = out.holidays as Array<Record<string, unknown>>;
    expect(holidays[0].scope).toEqual(["中学部"]);
  });

  it("passes through non-object inputs unchanged", () => {
    expect(migrateExportBundle(null)).toBe(null);
    expect(migrateExportBundle("x")).toBe("x");
  });
});

describe("nextNumericId", () => {
  it("returns 1 for an empty list", () => {
    expect(nextNumericId([])).toBe(1);
  });

  it("returns max+1 for a simple list", () => {
    expect(nextNumericId([{ id: 3 }, { id: 5 }, { id: 1 }])).toBe(6);
  });

  it("ignores NaN / non-numeric ids", () => {
    expect(nextNumericId([{ id: 2 }, { id: "abc" }, { id: 7 }])).toBe(8);
  });

  it("accepts a custom key", () => {
    expect(nextNumericId([{ pk: 10 }, { pk: 2 }], "pk")).toBe(11);
  });
});
