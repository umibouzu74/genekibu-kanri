import { describe, expect, it } from "vitest";
import {
  buildMonthWeeks,
  fiscalYearStartYm,
  genyakuEntries,
  monthRange,
  monthsFrom,
  shiftYm,
  spreadByDate,
  yobikoDayMarks,
  yobikoEntries,
} from "./yearCalendar";

describe("月のグリッド", () => {
  it("日曜始まりで、月の外は null", () => {
    // 2026-10-01 は木曜
    const weeks = buildMonthWeeks("2026-10");
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(weeks[4]).toEqual(["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
    // 2027-02 (28 日・月曜始まり) は 5 週
    expect(buildMonthWeeks("2027-02").flat().filter(Boolean)).toHaveLength(28);
  });

  it("月をずらす・並べる・年度の初め", () => {
    expect(shiftYm("2026-12", 1)).toBe("2027-01");
    expect(shiftYm("2026-01", -1)).toBe("2025-12");
    expect(monthsFrom("2026-11", 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(monthRange("2027-02")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(fiscalYearStartYm("2027-03")).toBe("2026-04");
    expect(fiscalYearStartYm("2026-10")).toBe("2026-04");
  });
});

describe("段の中身", () => {
  const yobiko = [
    { id: 1, name: "", startDate: "2026-10-04", endDate: "2026-10-04", kind: "closed" },
    { id: 2, name: "スポーツの日", startDate: "2026-10-12", endDate: "2026-10-12", kind: "closed" },
    { id: 3, name: "冬期講習Ⅰ期", startDate: "2026-12-24", endDate: "2026-12-27", kind: "event" },
    { id: 4, name: "", startDate: "2026-10-04", endDate: "2026-10-04", kind: "offMonFri" },
  ];

  it("予備校部: 名称の無い日の種別は欄に出さず、数字の塗りだけ", () => {
    const entries = yobikoEntries(yobiko);
    expect(entries.map((e) => e.label)).toEqual(["スポーツの日", "冬期講習Ⅰ期"]);
    const marks = yobikoDayMarks(yobiko, "2026-10-01", "2026-12-31");
    // 休校日 (rank 0) が先
    expect(marks.get("2026-10-04").map((k) => k.key)).toEqual(["closed", "offMonFri"]);
    expect(marks.get("2026-10-12").map((k) => k.key)).toEqual(["closed"]);
    expect(marks.has("2026-12-24")).toBe(false);
  });

  it("現役部: 休講・テスト期間・特別イベントを対象つきで", () => {
    const entries = genyakuEntries({
      holidays: [
        { id: 1, date: "2026-11-03", label: "文化の日", scope: ["全部"] },
        { id: 2, date: "2026-11-30", label: "休校", scope: ["中学部"], targetGrades: ["中2"] },
      ],
      examPeriods: [{ id: 1, name: "テスト直前特訓", startDate: "2026-11-17", endDate: "2026-11-26", targetGrades: [] }],
      specialEvents: [
        { id: 1, name: "第2回保護者会", startDate: "2026-11-28", endDate: "2026-12-06", eventType: "parents", targetGrades: [] },
      ],
    });
    expect(entries.map((e) => e.label)).toEqual([
      "文化の日",
      "休校 (中2)",
      "テスト直前特訓",
      "👪 第2回保護者会",
    ]);
  });

  it("現役部: 授業を止めないテスト期間・例外的に授業を行う日を見分けられる", () => {
    const entries = genyakuEntries({
      examPeriods: [
        {
          id: 1,
          name: "特訓",
          startDate: "2026-11-17",
          endDate: "2026-11-20",
          targetGrades: ["中3"],
          classExceptions: [{ date: "2026-11-19" }],
        },
        { id: 2, name: "高校 期末", startDate: "2026-12-08", endDate: "2026-12-08", targetGrades: [], stopsClasses: false },
      ],
    });
    expect(entries.map((e) => e.label)).toEqual(["特訓 (中3)", "高校 期末 [表示のみ]"]);
    const m = spreadByDate(entries, "2026-11-01", "2026-12-31");
    expect(m.get("2026-11-19")[0].note).toBe("📖 授業あり");
    expect(m.get("2026-11-18")[0].note).toBe("");
  });

  it("現役部: 学校バッジにまとめる記録は excludeSchoolBadged で外し、それ以外は残す", () => {
    const input = {
      holidays: [{ id: 1, date: "2026-11-03", label: "文化の日", scope: ["全部"] }],
      examPeriods: [
        // 学校のテスト (授業を止めない + 学校タグ) → バッジ
        { id: 1, name: "桜井2学期期末", startDate: "2026-11-19", endDate: "2026-12-02", targetGrades: [], stopsClasses: false, tags: ["桜井"] },
        // 授業を止めるテスト期間 / 学校タグの無いテスト期間 → 従来どおり
        { id: 2, name: "中学 期末", startDate: "2026-11-25", endDate: "2026-11-27", targetGrades: ["中1"], tags: ["中学"] },
        { id: 3, name: "高校 期末", startDate: "2026-12-08", endDate: "2026-12-08", targetGrades: [], stopsClasses: false },
      ],
      specialEvents: [
        { id: 1, name: "3年第8回校外模試", startDate: "2026-10-30", endDate: "2026-10-31", eventType: "mock", targetGrades: ["高3"], tags: ["桜井"] },
        { id: 2, name: "学校名の無い模試", startDate: "2026-11-01", endDate: "2026-11-01", eventType: "mock", targetGrades: [] },
        { id: 3, name: "桜井 文化祭", startDate: "2026-11-07", endDate: "2026-11-07", eventType: "school", targetGrades: [], tags: ["桜井"] },
      ],
    };
    expect(genyakuEntries(input).map((e) => e.key)).toEqual(["h-1", "e-1", "e-2", "e-3", "s-1", "s-2", "s-3"]);
    expect(genyakuEntries(input, { excludeSchoolBadged: true }).map((e) => e.key)).toEqual([
      "h-1",
      "e-2",
      "e-3",
      "s-2",
      "s-3",
    ]);
  });

  it("日付に広げる: 範囲で切り、始まり・終わりの印を付ける", () => {
    const m = spreadByDate(yobikoEntries(yobiko), "2026-12-25", "2026-12-31");
    expect([...m.keys()]).toEqual(["2026-12-25", "2026-12-26", "2026-12-27"]);
    expect(m.get("2026-12-25")[0]).toMatchObject({ isStart: false, isEnd: false });
    expect(m.get("2026-12-27")[0]).toMatchObject({ isStart: false, isEnd: true });
  });

  it("同じ日は開始日 → 長い順", () => {
    const m = spreadByDate(
      [
        { key: "a", startDate: "2026-10-05", endDate: "2026-10-05" },
        { key: "b", startDate: "2026-10-01", endDate: "2026-10-05" },
        { key: "c", startDate: "2026-10-05", endDate: "2026-10-09" },
      ],
      "2026-10-01",
      "2026-10-31"
    );
    expect(m.get("2026-10-05").map((e) => e.key)).toEqual(["b", "c", "a"]);
  });
});
