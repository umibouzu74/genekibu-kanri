import { describe, expect, it } from "vitest";
import {
  LEAVE_RANGE_MAX_DAYS,
  NO_WORK_PATTERN,
  calendarDayOf,
  calendarFor,
  countLeave,
  fmtLeaveDays,
  grantFor,
  indexLeaveRecords,
  leaveKey,
  leaveRangeDates,
  migrateStaffLeave,
  offDayPredicate,
  publicOffCount,
  publicOffOf,
  recordsInRange,
  removeLeave,
  restoreCalendars,
  setCalendar,
  setGrant,
  setLeave,
  setLeaveForDates,
  setWorkPattern,
  summarizeYear,
  upcomingLeave,
  workPatternFor,
  yearsWithLeave,
} from "./staffLeave";

const EMPTY = { records: [], grants: [] };

describe("migrateStaffLeave", () => {
  it("欠けた配列を補い、形にならない記録を落とす", () => {
    expect(migrateStaffLeave(null)).toEqual(EMPTY);
    expect(migrateStaffLeave({})).toEqual(EMPTY);
    const out = migrateStaffLeave({
      records: {
        0: { id: 1, name: "石原", date: "2026-10-02", kind: "full", memo: " 通院 " },
        1: { id: 2, name: "", date: "2026-10-03", kind: "full" },
        2: { id: 3, name: "堀上", date: "2026/10/03", kind: "full" },
        3: { id: 4, name: "堀上", date: "2026-10-05", kind: "zzz" },
      },
      grants: [
        { name: "石原", year: 2026, days: 10.3 },
        { name: "x", year: 2026, days: -1 },
      ],
    });
    expect(out.records).toEqual([
      { id: 1, name: "石原", date: "2026-10-02", kind: "full", memo: "通院" },
      { id: 4, name: "堀上", date: "2026-10-05", kind: "other" },
    ]);
    expect(out.grants).toEqual([{ name: "石原", year: 2026, days: 10.5 }]);
  });
});

describe("setLeave / removeLeave", () => {
  it("1 人 × 1 日に 1 件。入れ直すと置き換え (id は保つ)", () => {
    let l = setLeave(EMPTY, { name: "石原", date: "2026-10-02", kind: "am" });
    expect(l.records).toEqual([{ id: 1, name: "石原", date: "2026-10-02", kind: "am" }]);
    l = setLeave(l, { name: "石原", date: "2026-10-02", kind: "full", memo: "家の用事" });
    expect(l.records).toEqual([
      { id: 1, name: "石原", date: "2026-10-02", kind: "full", memo: "家の用事" },
    ]);
    l = setLeave(l, { name: "堀上", date: "2026-10-02", kind: "pm" });
    expect(l.records.map((r) => r.id)).toEqual([1, 2]);
    l = removeLeave(l, "石原", "2026-10-02");
    expect(l.records).toEqual([{ id: 2, name: "堀上", date: "2026-10-02", kind: "pm" }]);
  });

  it("日付・名前が無ければ何もしない", () => {
    expect(setLeave(EMPTY, { name: "", date: "2026-10-02", kind: "full" })).toEqual(EMPTY);
    expect(setLeave(EMPTY, { name: "石原", date: "x", kind: "full" })).toEqual(EMPTY);
  });
});

describe("期間でまとめて入れる", () => {
  it("日曜を除く (既定) / 含める", () => {
    // 2026-10-17 は土曜、10-18 は日曜
    expect(leaveRangeDates("2026-10-17", "2026-10-19").dates).toEqual(["2026-10-17", "2026-10-19"]);
    expect(leaveRangeDates("2026-10-17", "2026-10-19", { skipSundays: false }).dates).toHaveLength(
      3
    );
  });

  it("逆順・上限超え・日曜だけはエラー", () => {
    expect(leaveRangeDates("2026-10-19", "2026-10-17").errors).not.toHaveLength(0);
    expect(leaveRangeDates("2026-10-01", "2026-12-31").errors[0]).toMatch(
      String(LEAVE_RANGE_MAX_DAYS)
    );
    expect(leaveRangeDates("2026-10-18", "2026-10-18").errors).toEqual(["入れる日がありません"]);
  });

  it("setLeaveForDates は日ごとに置き換える", () => {
    const l = setLeaveForDates(EMPTY, {
      name: "松川",
      dates: ["2026-08-10", "2026-08-11"],
      kind: "full",
      memo: "夏休み",
    });
    expect(l.records.map((r) => [r.date, r.memo])).toEqual([
      ["2026-08-10", "夏休み"],
      ["2026-08-11", "夏休み"],
    ]);
  });
});

describe("数える", () => {
  const leave = migrateStaffLeave({
    records: [
      { id: 1, name: "石原", date: "2026-04-10", kind: "full" },
      { id: 2, name: "石原", date: "2026-10-02", kind: "am" },
      { id: 3, name: "石原", date: "2027-03-31", kind: "pm" },
      { id: 4, name: "石原", date: "2027-04-01", kind: "full" }, // 次の年度
      { id: 5, name: "石原", date: "2026-12-28", kind: "other", memo: "代休" },
      { id: 6, name: "堀上", date: "2026-10-02", kind: "full" },
    ],
    grants: [{ name: "石原", year: 2026, days: 10 }],
  });

  it("有給 1 日・半休 0.5 日、その他の休みは有給に数えない", () => {
    const c = countLeave(leave.records.filter((r) => r.name === "石原"));
    expect(c).toEqual({ paidDays: 3, full: 2, am: 1, pm: 1, other: 1 });
    expect(fmtLeaveDays(2.5)).toBe("2.5");
    expect(fmtLeaveDays(2)).toBe("2");
  });

  it("年度のまとめ: 月 (4 月 → 3 月)・合計・残り", () => {
    const [ishihara, horigami] = summarizeYear(leave, ["石原", "堀上"], 2026);
    expect(ishihara.byMonth).toEqual([1, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5]);
    expect(ishihara.counts.paidDays).toBe(2);
    expect(ishihara.grant).toBe(10);
    expect(ishihara.remaining).toBe(8);
    expect(horigami.grant).toBeNull();
    expect(horigami.remaining).toBeNull();
  });

  it("持ち日数を入れる / 消す", () => {
    let l = setGrant(leave, "堀上", 2026, "12");
    expect(grantFor(l, "堀上", 2026)).toBe(12);
    l = setGrant(l, "堀上", 2026, "");
    expect(grantFor(l, "堀上", 2026)).toBeNull();
  });

  it("索引・期間・年度の一覧", () => {
    const idx = indexLeaveRecords(leave.records);
    expect(idx.get(leaveKey("堀上", "2026-10-02")).kind).toBe("full");
    expect(recordsInRange(leave.records, "2026-10-01", "2026-10-31", ["石原"])).toHaveLength(1);
    expect(yearsWithLeave(leave)).toEqual([2027, 2026]);
  });

  it("今日から 7 日の休暇 (日付ごと)", () => {
    expect(upcomingLeave(leave, "2026-09-30")).toEqual([
      {
        date: "2026-10-02",
        records: [
          { id: 2, name: "石原", date: "2026-10-02", kind: "am" },
          { id: 6, name: "堀上", date: "2026-10-02", kind: "full" },
        ],
      },
    ]);
    expect(upcomingLeave(leave, "2026-10-03")).toEqual([]);
  });
});

describe("年間カレンダーと休みの型", () => {
  const cal = {
    year: 2026,
    source: "予定表.xls / 2026年度カレンダー",
    patterns: [
      { key: "土日", label: "土日 休み", offDates: ["2026-10-17", "2026-10-18", "2026-10-25"], total: 2 },
      { key: "日月", label: "日月 休み", offDates: ["2026-10-18", "2026-10-19", "2026-10-25"] },
    ],
    days: [
      { date: "2026-10-12", holiday: true, event: "スポーツの日" },
      { date: "2026-10-17", kind: "closed" },
      { date: "2026-10-20", kind: "zzz" },
    ],
    notes: ["※共通テストは，どちらか1日出勤"],
  };

  it("空のカレンダー・型はキーごと持たない (取り込む前の形のまま)", () => {
    expect(migrateStaffLeave({ records: [], grants: [], calendars: [], workPatterns: [] })).toEqual(EMPTY);
  });

  it("年度ごとに 1 つ・形にならない日は落とす", () => {
    let l = setCalendar(EMPTY, cal);
    l = setCalendar(l, { ...cal, source: "新しい版" });
    expect(l.calendars).toHaveLength(1);
    expect(calendarFor(l, 2026).source).toBe("新しい版");
    expect(calendarFor(l, 2026).days.map((d) => d.date)).toEqual(["2026-10-12", "2026-10-17"]);
    expect(calendarFor(l, 2025)).toBeNull();
    // 元に戻す: 控えた年度だけ
    l = setCalendar(l, { ...cal, year: 2025 });
    l = restoreCalendars(l, [2026], []);
    expect(l.calendars.map((c) => c.year)).toEqual([2025]);
  });

  it("休みの型は「この年度から」。前の年度と同じ型は持たない", () => {
    let l = setWorkPattern(EMPTY, "石原", 2025, "土日");
    expect(workPatternFor(l, "石原", 2026)).toBe("土日");
    expect(workPatternFor(l, "石原", 2024)).toBeNull();
    l = setWorkPattern(l, "石原", 2026, "土日");
    expect(l.workPatterns).toHaveLength(1);
    l = setWorkPattern(l, "石原", 2026, "日月");
    expect(workPatternFor(l, "石原", 2026)).toBe("日月");
    expect(workPatternFor(l, "石原", 2025)).toBe("土日");
    l = setWorkPattern(l, "石原", 2026, NO_WORK_PATTERN);
    expect(workPatternFor(l, "石原", 2026)).toBeNull();
    l = setWorkPattern(l, "石原", 2026, "土日");
    expect(l.workPatterns).toEqual([{ name: "石原", fromYear: 2025, pattern: "土日" }]);
  });

  it("その人のその日の公休・カレンダーの日", () => {
    let l = setCalendar(EMPTY, cal);
    expect(publicOffOf(l, "石原", "2026-10-17")).toBeNull(); // 型が無い
    l = setWorkPattern(l, "石原", 2026, "土日");
    l = setWorkPattern(l, "堀上", 2026, "日月");
    expect(publicOffOf(l, "石原", "2026-10-17")).toEqual({ off: true, pattern: "土日", label: "土日 休み" });
    expect(publicOffOf(l, "石原", "2026-10-19").off).toBe(false);
    expect(publicOffOf(l, "堀上", "2026-10-19").off).toBe(true);
    expect(publicOffOf(l, "石原", "2027-04-03")).toBeNull(); // 次の年度のカレンダーは無い
    expect(calendarDayOf(l, "2026-10-12")).toEqual({ date: "2026-10-12", holiday: true, event: "スポーツの日" });
    expect(calendarDayOf(l, "2026-10-13")).toBeNull();
    expect(publicOffCount(l, "石原", 2026)).toBe(2);
    expect(publicOffCount(l, "堀上", 2026)).toBe(3);
    expect(publicOffCount(l, "片岡", 2026)).toBeNull();
  });

  it("期間で入れるときは公休を除く (カレンダーの無い年度は日曜)", () => {
    let l = setCalendar(EMPTY, cal);
    expect(offDayPredicate(l, "石原", "2026-10-16", "2026-10-20")).toBeNull();
    l = setWorkPattern(l, "石原", 2026, "土日");
    const isOff = offDayPredicate(l, "石原", "2026-10-16", "2026-10-20");
    expect(leaveRangeDates("2026-10-16", "2026-10-20", { isOff }).dates).toEqual([
      "2026-10-16",
      "2026-10-19",
      "2026-10-20",
    ]);
    // 2027 年度 (カレンダーなし) の日は日曜だけ除く
    expect(isOff("2027-04-04")).toBe(true);
    expect(isOff("2027-04-03")).toBe(false);
  });
});
