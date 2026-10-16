import { describe, expect, it } from "vitest";
import {
  calendarForLeave,
  findCalendarSheets,
  legendKindOf,
  parseAnnualCalendarSheet,
  patternKeyOf,
  summarizeCalendar,
} from "./annualCalendarSheet";
import { makeSheet, smallCalendarSheet, smallT1T2Sheet } from "./testUtils";

describe("legendKindOf / patternKeyOf", () => {
  it("凡例の文字の意味", () => {
    expect(legendKindOf("予備校授業なし→現役生も休み")).toBe("closed");
    expect(legendKindOf("予備校授業あり→現役生も授業可能")).toBe("open");
    expect(legendKindOf("教員半休")).toBe("half");
    expect(legendKindOf("公立中学校定期テスト")).toBeNull();
  });

  it("休みの型の見出し → key", () => {
    expect(patternKeyOf("土日 休み")).toBe("土日");
    expect(patternKeyOf("日月　休み")).toBe("日月");
    expect(patternKeyOf("水日休")).toBe("水日");
  });
});

describe("parseAnnualCalendarSheet", () => {
  const { sheet, counts } = smallCalendarSheet();
  const p = parseAnnualCalendarSheet(sheet);

  it("年度は曜日が暦と合う方 (題の書き残しは知らせる)", () => {
    expect(p.fiscalYear).toBe(2026);
    expect(p.range).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(p.warnings.find((w) => w.kind === "year")?.message).toContain("2025年度");
  });

  it("休みの型の列と公休の日", () => {
    expect(p.patterns.map((x) => [x.key, x.label])).toEqual([
      ["土日", "土日 休み"],
      ["日月", "日月 休み"],
    ]);
    const sat = new Set(p.patterns[0].offDates);
    const mon = new Set(p.patterns[1].offDates);
    // 土曜は土日の型だけ・月曜は日月の型だけ
    expect(sat.has("2026-10-03")).toBe(true);
    expect(mon.has("2026-10-03")).toBe(false);
    expect(mon.has("2026-10-05")).toBe(true);
    expect(sat.has("2026-10-05")).toBe(false);
    // 模試の日曜は出勤
    expect(sat.has("2026-11-01")).toBe(false);
    expect(mon.has("2026-11-01")).toBe(false);
    // 祝日・塾の休みは両方
    for (const d of ["2026-10-12", "2026-10-17", "2026-12-30"]) {
      expect(sat.has(d)).toBe(true);
      expect(mon.has(d)).toBe(true);
    }
    // 授業可能の祝日は公休ではない
    expect(sat.has("2026-11-23")).toBe(false);
    expect(mon.has("2026-11-23")).toBe(false);
  });

  it("凡例の色で日の意味を読む・祝日は黒い曜日", () => {
    expect(p.legend.map((l) => l.kind)).toEqual(["closed", "open", "half"]);
    expect(p.days.get("2026-10-17").kind).toBe("closed");
    expect(p.days.get("2026-11-23")).toMatchObject({ kind: "open", holiday: true, event: "勤労感謝の日" });
    expect(p.days.get("2026-10-12")).toMatchObject({ kind: null, holiday: true, event: "スポーツの日" });
    expect(p.days.get("2026-12-01")).toMatchObject({ kind: "half", event: "教科会議" });
    // 日曜の黒は祝日ではない・模試の緑は意味を付けない
    expect(p.days.get("2026-10-04").holiday).toBe(false);
    expect(p.days.get("2026-11-01")).toMatchObject({ kind: null, event: "チャレ④" });
  });

  it("月ごとの休日数・年間の合計を印と比べる (※ の日を添える)", () => {
    const count = p.warnings.filter((w) => w.kind === "count");
    expect(count).toHaveLength(2);
    expect(count[0].message).toContain("12月の「土日 休み」");
    expect(count[0].message).toContain("12/19・12/20");
    const totals = p.warnings.filter((w) => w.kind === "total");
    expect(totals).toHaveLength(2);
    const expected = [...counts.values()].reduce((a, v) => a + v[0], 0);
    expect(p.patterns[0].total).toBe(expected);
    expect(p.patterns[0].offDates.length).toBe(expected + 1);
  });

  it("注記", () => {
    expect(p.notes).toEqual(["※共通テストは，どちらか1日出勤"]);
  });

  it("まとめ", () => {
    const s = summarizeCalendar(p);
    expect(s).toMatchObject({ closed: 4, open: 1, half: 1, holidays: 3 });
  });

  it("月のブロックの無いシート・年度の書いていないシートは null", () => {
    expect(parseAnnualCalendarSheet(makeSheet("2026年度カレンダー", (s) => s.set(0, 0, "土日 休み")))).toBeNull();
    const { sheet: noYear } = smallCalendarSheet({ name: "カレンダー" });
    noYear.rows[0][30] = { t: "s", v: "カレンダー", fill: null };
    expect(parseAnnualCalendarSheet(noYear)).toBeNull();
  });
});

describe("findCalendarSheets / calendarForLeave", () => {
  it("ブックの中の年間カレンダーだけを読む", () => {
    const { sheet } = smallCalendarSheet();
    const found = findCalendarSheets({ sheets: [smallT1T2Sheet(), sheet] });
    expect(found.map((f) => f.name)).toEqual(["2026年度カレンダー"]);
  });

  it("取り込む形: 何か書いてある日だけ・型ごとの公休", () => {
    const { sheet } = smallCalendarSheet();
    const cal = calendarForLeave(parseAnnualCalendarSheet(sheet), {
      source: "予定表.xls / 2026年度カレンダー",
      importedAt: "2026-10-16",
    });
    expect(cal.year).toBe(2026);
    expect(cal.source).toBe("予定表.xls / 2026年度カレンダー");
    expect(cal.patterns[0]).toMatchObject({ key: "土日", label: "土日 休み" });
    expect(cal.patterns[0].offDates).toContain("2026-10-03");
    expect(cal.days.find((d) => d.date === "2026-10-17")).toEqual({ date: "2026-10-17", kind: "closed" });
    expect(cal.days.find((d) => d.date === "2026-10-02")).toBeUndefined();
    expect(cal.notes).toHaveLength(1);
  });
});
