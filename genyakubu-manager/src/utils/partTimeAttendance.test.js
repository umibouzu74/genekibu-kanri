// バイトの出勤日数表 (utils/partTimeAttendance)。
import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_FLAG,
  DEFAULT_UNIT_PRICE,
  MAX_OVERRIDE_PERIODS,
  attendanceFileName,
  attendancePeriodKey,
  buildDutyHints,
  buildPartTimeAttendanceSheet,
  countDayAttendance,
  dutyTokenOf,
  latestClosedPeriodYm,
  parseTimeRange,
  sanitizeAttendanceOverrides,
  sanitizeGapMinutes,
  sanitizeUnitPrice,
  setAttendanceOverride,
  staffNamesOf,
} from "./partTimeAttendance";
import { computeTeachingMinutes, datesInRange, monthPeriod, summarizeTeacherRow } from "./teachingMinutes";

// "14:00-15:00, 15:30-16:30" → entries
const lessons = (text, kind = "own") =>
  text.split(",").map((t, i) => ({ date: "2026-10-10", time: t.trim(), kind, label: `授業${i + 1}` }));
const units = (text, opts) => countDayAttendance(lessons(text), opts).units;

describe("parseTimeRange", () => {
  it("開始・終了を分にする", () => {
    expect(parseTimeRange("18:30-20:00")).toEqual({ start: 1110, end: 1200 });
    expect(parseTimeRange(" 9:05 - 9:50 ")).toEqual({ start: 545, end: 590 });
  });
  it("終了が無い / 読めない / 開始以前なら end = null", () => {
    expect(parseTimeRange("18:30")).toEqual({ start: 1110, end: null });
    expect(parseTimeRange("18:30-")).toEqual({ start: 1110, end: null });
    expect(parseTimeRange("18:30-18:00")).toEqual({ start: 1110, end: null });
  });
  it("開始が読めなければ両方 null", () => {
    expect(parseTimeRange("")).toEqual({ start: null, end: null });
    expect(parseTimeRange(undefined)).toEqual({ start: null, end: null });
    expect(parseTimeRange("午後")).toEqual({ start: null, end: null });
  });
});

describe("countDayAttendance — 実データでの確認用 (2026年10月分)", () => {
  it.each([
    ["10/10(土) 福武", "14:00-15:00, 15:30-16:30, 18:25-19:25, 19:35-20:35", 2],
    ["10/10(土) 江本", "10:00-11:00, 11:10-12:10, 18:30-20:00, 20:20-21:50", 2],
    ["10/3(土) 川井", "14:00-15:00, 15:30-16:30, 18:30-20:00, 20:20-21:50", 2],
    ["10/3(土) 奥村", "18:30-20:00, 20:20-21:50", 1],
    ["連続 3 コマ", "18:55-19:40, 19:50-20:35, 20:45-21:30", 1],
    ["離れた 1 + 2 コマ", "14:00-15:00, 18:30-20:00, 20:20-21:50", 2],
    ["離れた 1 + 1 コマ", "16:15-17:15, 20:50-21:50", 2],
  ])("%s → %i", (_label, text, expected) => {
    const r = countDayAttendance(lessons(text));
    expect(r.units).toBe(expected);
    expect(r.flags).toEqual([]);
  });

  it("1 コマだけ → 1、授業なし → 0", () => {
    expect(units("19:00-20:20")).toBe(1);
    expect(countDayAttendance([])).toMatchObject({ units: 0, koma: 0, blocks: [], flags: [] });
    expect(countDayAttendance(undefined).units).toBe(0);
  });

  it("かたまりの開始・終了とコマ数を返す", () => {
    const r = countDayAttendance(lessons("18:30-20:00, 14:00-15:00, 20:20-21:50, 15:30-16:30"));
    expect(r.koma).toBe(4);
    expect(r.blocks.map((b) => [b.start, b.end, b.entries.length])).toEqual([
      ["14:00", "16:30", 2],
      ["18:30", "21:50", 2],
    ]);
  });
});

describe("countDayAttendance — 空き時間の境目", () => {
  it("ちょうど 60 分空いたら別のかたまり", () => {
    expect(units("14:00-15:00, 16:00-17:00")).toBe(2);
  });
  it("59 分なら同じかたまり", () => {
    expect(units("14:00-15:00, 15:59-17:00")).toBe(1);
  });
  it("しきい値は変えられる", () => {
    expect(units("14:00-15:00, 15:30-16:30", { gapMinutes: 30 })).toBe(2);
    expect(units("14:00-15:00, 16:00-17:00", { gapMinutes: 90 })).toBe(1);
  });
  it("おかしなしきい値は 60 分として扱う", () => {
    expect(units("14:00-15:00, 16:00-17:00", { gapMinutes: 0 })).toBe(2);
    expect(units("14:00-15:00, 15:59-17:00", { gapMinutes: "x" })).toBe(1);
  });
  it("重なった授業は同じかたまり (長い方の終わりから測る)", () => {
    // 14:00-17:00 の中に 15:00-15:30 があっても、17:30 開始は 30 分しか空いていない
    expect(units("14:00-17:00, 15:00-15:30, 17:30-18:00")).toBe(1);
  });
  it("種別が混じっていても時刻だけで分ける", () => {
    const entries = [
      { date: "2026-10-10", time: "14:00-15:00", kind: "koshu" },
      { date: "2026-10-10", time: "15:10-16:00", kind: "prep" },
      { date: "2026-10-10", time: "19:00-20:00", kind: "sub" },
    ];
    expect(countDayAttendance(entries).units).toBe(2);
  });
});

describe("countDayAttendance — 要確認", () => {
  it("かたまりが 3 つ以上なら印を付けて、数はそのまま", () => {
    const r = countDayAttendance(lessons("10:00-11:00, 14:00-15:00, 19:00-20:00"));
    expect(r.units).toBe(3);
    expect(r.flags).toEqual([ATTENDANCE_FLAG.MANY_BLOCKS]);
  });
  it("時刻の無い授業だけの日は 1 として数えて印を付ける", () => {
    const r = countDayAttendance([
      { date: "2026-10-10", time: "", kind: "koshu" },
      { date: "2026-10-10", time: "", kind: "koshu" },
    ]);
    expect(r.units).toBe(1);
    expect(r.koma).toBe(2);
    expect(r.untimed).toHaveLength(2);
    expect(r.flags).toEqual([ATTENDANCE_FLAG.NO_TIME]);
  });
  it("時刻の無い授業はかたまりを増やさない (時刻のある授業のかたまりで数える)", () => {
    const r = countDayAttendance([
      ...lessons("14:00-15:00, 19:00-20:00"),
      { date: "2026-10-10", time: "", kind: "extra" },
    ]);
    expect(r.units).toBe(2);
    expect(r.flags).toEqual([ATTENDANCE_FLAG.NO_TIME]);
  });
  it("終了時刻の無い授業も印を付ける (開始をその授業の終わりとみなす)", () => {
    const r = countDayAttendance(lessons("18:30, 19:00-20:00"));
    expect(r.units).toBe(1);
    expect(r.flags).toEqual([ATTENDANCE_FLAG.NO_TIME]);
  });
});

describe("staffNamesOf / sanitize*", () => {
  it("旧形式・新形式どちらも名前の配列にする (並び順のまま・重複なし)", () => {
    expect(staffNamesOf([{ name: "福武" }, "江本", { name: " 福武 " }, null, { name: "" }])).toEqual([
      "福武",
      "江本",
    ]);
  });
  it("単価・しきい値", () => {
    expect(sanitizeUnitPrice(6000)).toBe(6000);
    expect(sanitizeUnitPrice("5500")).toBe(5500);
    expect(sanitizeUnitPrice(-1)).toBe(DEFAULT_UNIT_PRICE);
    expect(sanitizeUnitPrice(12.5)).toBe(DEFAULT_UNIT_PRICE);
    expect(sanitizeGapMinutes(90)).toBe(90);
    expect(sanitizeGapMinutes(61)).toBe(60);
  });
});

describe("上書きの保存", () => {
  const key = attendancePeriodKey("2026-09-21", "2026-10-20");
  it("入れる・外す", () => {
    let s = setAttendanceOverride({}, key, "川井", "2026-10-03", 1);
    expect(s).toEqual({ [key]: { 川井: { "2026-10-03": 1 } } });
    s = setAttendanceOverride(s, key, "川井", "2026-10-10", 0);
    expect(s[key].川井).toEqual({ "2026-10-03": 1, "2026-10-10": 0 });
    s = setAttendanceOverride(s, key, "川井", "2026-10-03", null);
    s = setAttendanceOverride(s, key, "川井", "2026-10-10", null);
    expect(s).toEqual({});
  });
  it("覚えておく期間は新しい方から MAX_OVERRIDE_PERIODS まで", () => {
    let s = {};
    for (let m = 1; m <= MAX_OVERRIDE_PERIODS + 2; m++) {
      const p = monthPeriod(2026, m, 20);
      s = setAttendanceOverride(s, attendancePeriodKey(p.startDate, p.endDate), "福武", p.endDate, 2);
    }
    const keys = Object.keys(s).sort();
    expect(keys).toHaveLength(MAX_OVERRIDE_PERIODS);
    expect(keys[0].startsWith("2026-02-21")).toBe(true);
  });
  it("形の崩れた保存値は捨てる", () => {
    expect(
      sanitizeAttendanceOverrides({
        [key]: { 福武: { "2026-10-01": 2, "2026-10-02": -1, "2026-10-03": 1.5, bad: 1 }, 江本: [] },
        x: "y",
      })
    ).toEqual({ [key]: { 福武: { "2026-10-01": 2 } } });
    expect(sanitizeAttendanceOverrides(null)).toEqual({});
    expect(sanitizeAttendanceOverrides([1])).toEqual({});
  });
});

describe("buildPartTimeAttendanceSheet", () => {
  const DATES = ["2026-10-02", "2026-10-03", "2026-10-04"];
  const rows = new Map([
    [
      "川井",
      {
        entries: [
          { date: "2026-10-02", time: "19:50-20:35", kind: "own", label: "中1AB 数学" },
          { date: "2026-10-03", time: "14:00-15:00", kind: "own", label: "中3クラス 理科B" },
          { date: "2026-10-03", time: "15:30-16:30", kind: "own", label: "中3クラス 理科B" },
          { date: "2026-10-03", time: "18:30-20:00", kind: "own", label: "中1-3 英語·数学·理科" },
          { date: "2026-10-03", time: "20:20-21:50", kind: "own", label: "中1-3 英語·数学·理科" },
          // 期間外の日は数えない
          { date: "2026-10-10", time: "18:30-20:00", kind: "own", label: "x" },
        ],
      },
    ],
    [
      "奥村",
      {
        entries: [
          { date: "2026-10-03", time: "18:30-20:00", kind: "own", label: "a" },
          { date: "2026-10-03", time: "20:20-21:50", kind: "own", label: "b" },
          { date: "2026-10-04", time: "13:00-14:00", kind: "prep", label: "特訓" },
        ],
      },
    ],
    // バイトでない人は行にしない
    ["堀上", { entries: [{ date: "2026-10-02", time: "19:00-20:00", kind: "own", label: "c" }] }],
  ]);
  const staff = [{ name: "奥村" }, { name: "川井" }, { name: "杉原" }];

  it("行 = バイト (登録の並び順)、セル = その日の出勤日数、日数 (金額は持たない)", () => {
    const sheet = buildPartTimeAttendanceSheet({ rows, staff, dates: DATES });
    expect(sheet.rows.map((r) => r.teacher)).toEqual(["奥村", "川井", "杉原"]);
    const [okumura, kawai, sugihara] = sheet.rows;
    expect(okumura.cells.map((c) => c.units)).toEqual([0, 1, 1]);
    expect(kawai.cells.map((c) => c.units)).toEqual([1, 2, 0]);
    expect(sugihara.cells.map((c) => c.units)).toEqual([0, 0, 0]);
    expect([okumura.days, kawai.days, sugihara.days]).toEqual([2, 3, 0]);
    expect(sheet.totalDays).toBe(5);
    // 金額・単価は表データに持たない (画面に出さない。金額は Excel の金額入りだけ)
    expect(kawai).not.toHaveProperty("amount");
    expect(sheet).not.toHaveProperty("totalAmount");
    expect(sheet).not.toHaveProperty("unitPrice");
    expect(sheet.checks).toEqual([]);
  });

  it("合計に含めない種別は数えず、セルに excluded として持つ", () => {
    const sheet = buildPartTimeAttendanceSheet({
      rows,
      staff,
      dates: DATES,
      included: ["own", "sub", "extra", "koshu"],
    });
    const okumura = sheet.rows[0];
    expect(okumura.cells[2]).toMatchObject({ units: 0, koma: 0 });
    expect(okumura.cells[2].excluded).toHaveLength(1);
    expect(okumura.days).toBe(1);
  });

  it("手での上書きは数を置き換え、印を付ける (0 = 数えない)", () => {
    const sheet = buildPartTimeAttendanceSheet({
      rows,
      staff,
      dates: DATES,
      overrides: { 川井: { "2026-10-03": 1 }, 杉原: { "2026-10-04": 1 }, 奥村: { "2026-10-04": 0 } },
    });
    const [okumura, kawai, sugihara] = sheet.rows;
    expect(kawai.cells[1]).toMatchObject({ units: 1, auto: 2, overridden: true });
    expect(kawai.days).toBe(2);
    expect(sugihara.cells[2]).toMatchObject({ units: 1, auto: 0, overridden: true });
    expect(okumura.cells[2]).toMatchObject({ units: 0, auto: 1, overridden: true });
    expect(sheet.overridden).toHaveLength(3);
    expect(sheet.totalDays).toBe(1 + 2 + 1);
  });

  it("要確認の日を一覧にする", () => {
    const r = new Map([
      [
        "杉原",
        {
          entries: [
            { date: "2026-10-04", time: "10:00-11:00", kind: "own", label: "a" },
            { date: "2026-10-04", time: "14:00-15:00", kind: "own", label: "b" },
            { date: "2026-10-04", time: "19:00-20:00", kind: "own", label: "c" },
            { date: "2026-10-02", time: "", kind: "koshu", label: "講習" },
          ],
        },
      ],
    ]);
    const sheet = buildPartTimeAttendanceSheet({ rows: r, staff, dates: DATES });
    expect(sheet.checks).toEqual([
      { teacher: "杉原", date: "2026-10-02", flags: [ATTENDANCE_FLAG.NO_TIME], units: 1, auto: 1 },
      { teacher: "杉原", date: "2026-10-04", flags: [ATTENDANCE_FLAG.MANY_BLOCKS], units: 3, auto: 3 },
    ]);
    expect(sheet.rows[2].days).toBe(4);
  });
});

// computeTeachingMinutes の結果からそのまま作れること (授業を拾い直さない)
describe("computeTeachingMinutes と組み合わせる", () => {
  // 2026年10月分 (20 日締め) = 9/21〜10/20
  const period = monthPeriod(2026, 10, 20);
  const slot = (id, o) => ({ id, cls: "", room: "", note: "", ...o });
  const slots = [
    // 10/3 (土) の川井: 中3 理科B 14:00〜16:30 (2 コマ) とプレップ 18:30〜21:50 (2 コマ)
    slot(1, { day: "土", time: "14:00-15:00", grade: "中3", cls: "クラス", subj: "理科B", teacher: "川井" }),
    slot(2, { day: "土", time: "15:30-16:30", grade: "中3", cls: "クラス", subj: "理科B", teacher: "川井" }),
    slot(3, {
      day: "土",
      time: "18:30-20:00",
      grade: "中1-3",
      cls: "-",
      subj: "英語·数学·理科",
      teacher: "香川·福江·川井",
      note: "プレップ個別指導",
    }),
    slot(4, {
      day: "土",
      time: "20:20-21:50",
      grade: "中1-3",
      cls: "-",
      subj: "英語·数学·理科",
      teacher: "香川·福江·川井",
      note: "プレップ個別指導",
    }),
  ];
  const result = computeTeachingMinutes({ ...period, slots });
  const { dates } = datesInRange(period.startDate, period.endDate);
  const staff = [{ name: "香川" }, { name: "福江" }, { name: "川井" }];

  it("土曜の川井は毎週 2、香川・福江はプレップだけで 1", () => {
    const sheet = buildPartTimeAttendanceSheet({ rows: result.rows, staff, dates });
    const kawai = sheet.rows.find((r) => r.teacher === "川井");
    const kagawa = sheet.rows.find((r) => r.teacher === "香川");
    const oct3 = dates.indexOf("2026-10-03");
    expect(kawai.cells[oct3].units).toBe(2);
    expect(kagawa.cells[oct3].units).toBe(1);
    // 9/21〜10/20 の土曜は 9/26, 10/3, 10/10, 10/17 の 4 回
    expect(kawai.days).toBe(8);
    expect(kagawa.days).toBe(4);
    // 既存の「出勤日数」(日付の数) は変えない
    expect(summarizeTeacherRow(result.rows.get("川井")).days).toBe(4);
  });
});

describe("担当の目安", () => {
  it("中学 = T、高校 = H、中学のプレップ = P", () => {
    expect(dutyTokenOf({ grade: "中3" })).toEqual({ kind: "T", grades: [3] });
    expect(dutyTokenOf({ grade: "高2" })).toEqual({ kind: "H", grades: [2] });
    expect(dutyTokenOf({ grade: "中1-3", note: "プレップ個別指導" })).toEqual({ kind: "P", grades: [] });
    expect(dutyTokenOf({ grade: "中1-3" })).toEqual({ kind: "T", grades: [1, 2, 3] });
    expect(dutyTokenOf({ grade: "高1高2", subj: "高予備プレップ" })).toEqual({ kind: "H", grades: [1, 2] });
    expect(dutyTokenOf({ grade: "" })).toBeNull();
  });

  const dates = datesInRange("2026-09-21", "2026-10-20").dates;
  const s = (id, o) => ({ id, time: "19:00-20:00", cls: "", subj: "数学", note: "", timetableId: 1, ...o });

  it("曜日ごとに学年をドットでつなぐ", () => {
    const slots = [
      s(1, { day: "火", grade: "高2", teacher: "福武" }),
      s(2, { day: "水", grade: "中3", teacher: "福武" }),
      s(3, { day: "金", grade: "中1", teacher: "川井" }),
      s(4, { day: "金", grade: "中3", teacher: "川井" }),
      s(5, { day: "土", grade: "中3", teacher: "川井" }),
      s(6, { day: "土", grade: "中1-3", teacher: "香川·福江·川井", note: "プレップ個別指導" }),
      // 隔週の相手 (B 週) も担当に入れる
      s(7, { day: "木", grade: "中3", teacher: "南條", note: "隔週(江本)" }),
      // バイトでない人は作らない
      s(8, { day: "月", grade: "中2", teacher: "堀上" }),
    ];
    const hints = buildDutyHints({
      slots,
      timetables: [],
      staffNames: ["福武", "川井", "香川", "江本", "杉原"],
      dates,
    });
    expect(hints.get("福武")).toBe("（火H2・水T3）");
    expect(hints.get("川井")).toBe("（金T1.3・土T3.P）");
    expect(hints.get("香川")).toBe("（土P）");
    expect(hints.get("江本")).toBe("（木T3）");
    expect(hints.get("杉原")).toBe("");
    expect(hints.has("堀上")).toBe(false);
  });

  it("期間中に有効でない時間割のコマは入れない", () => {
    const timetables = [
      { id: 1, name: "1学期", startDate: "2026-04-01", endDate: "2026-08-31", grades: [] },
      { id: 2, name: "2学期", startDate: "2026-09-01", grades: [] },
    ];
    const slots = [
      s(1, { day: "火", grade: "中1", teacher: "福武", timetableId: 1 }),
      s(2, { day: "水", grade: "中3", teacher: "福武", timetableId: 2 }),
    ];
    const hints = buildDutyHints({ slots, timetables, staffNames: ["福武"], dates });
    expect(hints.get("福武")).toBe("（水T3）");
  });
});

describe("latestClosedPeriodYm", () => {
  it("締め終わった最新の月分", () => {
    expect(latestClosedPeriodYm("2026-10-23", 20)).toEqual({ y: 2026, m: 10 });
    expect(latestClosedPeriodYm("2026-10-21", 20)).toEqual({ y: 2026, m: 10 });
    expect(latestClosedPeriodYm("2026-10-20", 20)).toEqual({ y: 2026, m: 9 });
    expect(latestClosedPeriodYm("2026-01-05", 20)).toEqual({ y: 2025, m: 12 });
    expect(latestClosedPeriodYm("2026-12-25", 20)).toEqual({ y: 2026, m: 12 });
    expect(latestClosedPeriodYm("2026-10-23", 0)).toEqual({ y: 2026, m: 9 });
  });
});

describe("attendanceFileName", () => {
  it("アルバイトコマ数YYYY.M.D-M.D.xlsx", () => {
    expect(attendanceFileName("2026-09-21", "2026-10-20")).toBe("アルバイトコマ数2026.9.21-10.20.xlsx");
    expect(attendanceFileName("2026-12-21", "2027-01-20")).toBe("アルバイトコマ数2026.12.21-1.20.xlsx");
    expect(attendanceFileName("", "")).toBe("アルバイトコマ数.xlsx");
    // 金額なし (日数だけ) は名前で分かるように
    expect(attendanceFileName("2026-09-21", "2026-10-20", { withAmounts: false })).toBe(
      "アルバイトコマ数2026.9.21-10.20_日数のみ.xlsx"
    );
  });
});
