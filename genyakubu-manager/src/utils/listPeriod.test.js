import { describe, expect, it } from "vitest";
import { filterByListPeriod, monthStartOf } from "./listPeriod";

const single = (d) => ({ date: d });
const range = (s, e) => ({ startDate: s, endDate: e });
const byDate = (x) => [x.date, x.date];
const byRange = (x) => [x.startDate, x.endDate];

describe("filterByListPeriod", () => {
  const today = "2026-09-12";
  it("今月以降: 今月の 1 日以降に終わるものを残す (今月の過ぎた日も残す)", () => {
    const items = [single("2026-08-31"), single("2026-09-01"), single("2026-09-05"), single("2027-01-01")];
    expect(filterByListPeriod(items, { mode: "current", todayStr: today }, byDate).map((x) => x.date)).toEqual([
      "2026-09-01",
      "2026-09-05",
      "2027-01-01",
    ]);
    expect(monthStartOf(today)).toBe("2026-09-01");
  });

  it("期間を持つ項目は終了日で判定する (今月にかかっていれば残す)", () => {
    const items = [range("2026-08-20", "2026-09-02"), range("2026-07-01", "2026-07-10")];
    expect(filterByListPeriod(items, { mode: "current", todayStr: today }, byRange)).toEqual([items[0]]);
  });

  it("月を指定: その月に重なるものだけ", () => {
    const items = [range("2026-08-28", "2026-09-02"), single("2026-09-30"), single("2026-10-01")];
    const r = filterByListPeriod(items, { mode: "month", month: "2026-09", todayStr: today }, (x) =>
      x.date ? [x.date, x.date] : [x.startDate, x.endDate]
    );
    expect(r).toEqual([items[0], items[1]]);
  });

  it("月が不正なら絞らない / すべて は素通し / 日付の無い項目は残す", () => {
    const items = [single("2000-01-01"), { date: "" }];
    expect(filterByListPeriod(items, { mode: "month", month: "bad", todayStr: today }, byDate)).toEqual(items);
    expect(filterByListPeriod(items, { mode: "all", todayStr: today }, byDate)).toEqual(items);
    expect(filterByListPeriod(items, { mode: "current", todayStr: today }, byDate)).toEqual([items[1]]);
  });
});
