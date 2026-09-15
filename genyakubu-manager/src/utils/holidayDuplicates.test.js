import { describe, expect, it } from "vitest";
import { findSameDayHolidays, holidayScopeKey } from "./holidayDuplicates";

const H = (over) => ({ id: 1, date: "2026-12-25", label: "休講", scope: ["全部"], targetGrades: [], subjKeywords: [], ...over });

describe("holidayScopeKey", () => {
  it("scope 未指定は「全部」扱い、配列の順序は問わない", () => {
    expect(holidayScopeKey({})).toBe(holidayScopeKey({ scope: ["全部"] }));
    expect(holidayScopeKey({ scope: ["中学部", "高校部"] })).toBe(
      holidayScopeKey({ scope: ["高校部", "中学部"] })
    );
    expect(holidayScopeKey({ scope: ["中学部"], targetGrades: ["中3"] })).not.toBe(
      holidayScopeKey({ scope: ["中学部"] })
    );
  });
});

describe("findSameDayHolidays", () => {
  const holidays = [
    H({ id: 1, date: "2026-12-25" }),
    H({ id: 2, date: "2026-12-25", scope: ["中学部"], targetGrades: ["中3"] }),
    H({ id: 3, date: "2026-12-26" }),
  ];
  it("同じ日・同じ対象は exact、同じ日で対象が違えば others", () => {
    const r = findSameDayHolidays(holidays, ["2026-12-25"], { scope: ["全部"], targetGrades: [], subjKeywords: [] });
    expect(r.exact.map((x) => x.holiday.id)).toEqual([1]);
    expect(r.others.map((x) => x.holiday.id)).toEqual([2]);
  });
  it("複数日をまとめて見る。日付順・id 順に並ぶ", () => {
    const r = findSameDayHolidays(holidays, ["2026-12-26", "2026-12-25"], { scope: ["全部"] });
    expect(r.exact.map((x) => `${x.date}:${x.holiday.id}`)).toEqual(["2026-12-25:1", "2026-12-26:3"]);
  });
  it("編集中の自分自身は相手にしない", () => {
    const r = findSameDayHolidays(holidays, ["2026-12-25"], { scope: ["全部"] }, { excludeId: 1 });
    expect(r.exact).toEqual([]);
  });
  it("該当日が無ければ空", () => {
    expect(findSameDayHolidays(holidays, ["2027-01-01"], { scope: ["全部"] })).toEqual({ exact: [], others: [] });
  });
});
