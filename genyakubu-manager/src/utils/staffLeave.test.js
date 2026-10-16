import { describe, expect, it } from "vitest";
import {
  LEAVE_RANGE_MAX_DAYS,
  countLeave,
  fmtLeaveDays,
  grantFor,
  indexLeaveRecords,
  leaveKey,
  leaveRangeDates,
  migrateStaffLeave,
  recordsInRange,
  removeLeave,
  setGrant,
  setLeave,
  setLeaveForDates,
  summarizeYear,
  upcomingLeave,
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
