import { describe, expect, it } from "vitest";
import {
  checkPlannedCounts,
  circledNumber,
  classifySheet,
  columnName,
  fillColorName,
  courseWeekdays,
  gradesIn,
  mergeHighSchoolSheets,
  namedMonthRange,
  parseHighSchoolSheet,
  splitTerms,
} from "./highSchoolSheet";
import { GRAY, RED, YELLOW, makeSheet, weekdayIndexOf } from "./testUtils";

// ─── 高1・高2 型 (1 列 = 1 講座) ───────────────────────────────────
// 10 月 (B〜H) と 11 月 (J〜P) の 2 ブロック。講座は
//   高1 高松西高校 (月木) / 高1 古文・漢文 (金) /
//   高2 東京大・京都大・医進／高松高校 (火金) / 高2 高松第一高校 物理 (水) /
//   高1・高2 高予備プレップ (土)
const COURSES = [
  { name: "高松西高校", days: [1, 4], mark: "●" },
  { name: "古文・漢文", days: [5], mark: "◇" },
  { name: "東京大・京都大・医進／高松高校", days: [2, 5], mark: "〇" },
  { name: "高松第一高校 物理", days: [3], mark: "◆" },
  { name: "高予備プレップ", days: [6], mark: "★" },
];

function buildH12({ wrongWeekday = false, counts = null } = {}) {
  return makeSheet("2026　H1H2【10-11月】教員用", (s) => {
    s.set(1, 1, "2026年度　【高1・高2ゼミ】　10月～11月予定表");
    const blocks = [
      { dayCol: 1, month: 10 },
      { dayCol: 9, month: 11 },
    ];
    const rowsByDate = new Map();
    for (const b of blocks) {
      const c0 = b.dayCol + 2;
      s.set(4, c0, "高1", "#ffff99");
      s.merge(4, c0, 4, c0 + 1);
      s.set(4, c0 + 2, "高2", "#ffff99");
      s.merge(4, c0 + 2, 4, c0 + 3);
      s.set(4, c0 + 4, "高1・高2", "#ccccff");
      COURSES.forEach((co, i) => s.set(6, c0 + i, co.name));
      const map = s.month({ year: 2026, month: b.month, dayCol: b.dayCol, firstRow: 7, labelRow: 3, wrongWeekday });
      for (const [iso, r] of map) {
        rowsByDate.set(iso, { r, c0 });
        const wd = weekdayIndexOf(iso);
        COURSES.forEach((co, i) => {
          if (co.days.includes(wd)) s.set(r, c0 + i, co.mark);
        });
      }
    }
    const at = (iso) => rowsByDate.get(iso);
    // 10/12 (月) スポーツの日: 講座の列ぜんぶをまたぐ結合
    {
      const { r, c0 } = at("2026-10-12");
      for (let i = 0; i < 5; i++) s.set(r, c0 + i, i === 0 ? "スポーツの日" : null, RED);
      s.merge(r, c0, r, c0 + 4);
    }
    // 10/9 (金): 東大京大 = 灰色の空欄、古文 = 記号つきの灰色 (どちらも休講)
    {
      const { r, c0 } = at("2026-10-09");
      s.set(r, c0 + 2, null, GRAY);
      s.set(r, c0 + 1, "◇", GRAY);
    }
    // 10/15 (木): 高松西を空欄 (= 予定表では授業なし)
    {
      const { r, c0 } = at("2026-10-15");
      s.set(r, c0, "");
    }
    // 11/6 (金): 11/9 (月) の振替で高松西 (黄色)。金曜の 2 講座の列には注記
    {
      const { r, c0 } = at("2026-11-06");
      s.set(r, c0, "●", YELLOW);
      s.set(r, c0 + 1, "←11/9(月)の振替→");
      s.set(r, c0 + 2, null);
      s.merge(r, c0 + 1, r, c0 + 2);
    }
    // 11/9 (月) 休校
    {
      const { r, c0 } = at("2026-11-09");
      for (let i = 0; i < 5; i++) s.set(r, c0 + i, i === 0 ? "休校" : null, RED);
      s.merge(r, c0, r, c0 + 4);
    }
    // 教員用の予定回数 (最初のブロックの最後の日の直下)
    if (counts) counts.forEach((n, i) => s.set(38, 3 + i, n));
    s.set(40, 1, "※日程等の変更がある場合は，授業にて連絡します。");
  });
}

describe("gradesIn / circledNumber", () => {
  it("学年の表記ゆれ", () => {
    expect(gradesIn("2026年度　【高1・高2ゼミ】")).toEqual(["高1", "高2"]);
    expect(gradesIn("高1・2")).toEqual(["高1", "高2"]);
    expect(gradesIn("【高3ゼミ】")).toEqual(["高3"]);
    expect(gradesIn("中1・中2")).toEqual([]);
  });
  it("丸数字の各系統", () => {
    expect(circledNumber("①")).toBe(1);
    expect(circledNumber("⑯")).toBe(16);
    expect(circledNumber("➁")).toBe(2);
    expect(circledNumber("❸")).toBe(3);
    expect(circledNumber("⓫")).toBe(11);
    expect(circledNumber("〇")).toBeNull();
    expect(circledNumber("①②")).toBeNull();
  });
});

describe("classifySheet", () => {
  it("高校部・中学部・カレンダーを見分ける", () => {
    expect(classifySheet(buildH12()).kind).toBe("high");
    const mid = makeSheet("T3", (s) => s.set(0, 0, "2026年度【中3ゼミ】 4月～7月予定表"));
    expect(classifySheet(mid).kind).toBe("middle");
    const cal = makeSheet("2026年度カレンダー", (s) => s.set(0, 0, "土日 休み"));
    expect(classifySheet(cal).kind).toBe("calendar");
    expect(classifySheet(makeSheet("Sheet1", () => {})).kind).toBe("unknown");
  });
});

describe("parseHighSchoolSheet (高1・高2 型)", () => {
  const p = parseHighSchoolSheet(buildH12());

  it("列ごとの講座と学年 (見出しの結合から)", () => {
    expect(p.mode).toBe("column");
    expect(p.fiscalYear).toBe(2026);
    expect(p.grades).toEqual(["高1", "高2"]);
    expect(p.range).toEqual({ start: "2026-10-01", end: "2026-11-30" });
    expect([...p.courses.keys()].sort()).toEqual(
      [
        "高1|高松西高校",
        "高1|古文・漢文",
        "高2|東京大・京都大・医進／高松高校",
        "高2|高松第一高校 物理",
        "高1・高2|高予備プレップ",
      ].sort()
    );
    expect(p.courses.get("高1・高2|高予備プレップ").grades).toEqual(["高1", "高2"]);
    expect(p.warnings).toEqual([]);
  });

  it("灰色 = 休講 (記号あり / 空欄)、空欄 = 記載なし、黄色 = 変更", () => {
    const todai = p.courses.get("高2|東京大・京都大・医進／高松高校");
    expect(todai.sessions.get("2026-10-09")).toMatchObject({ status: "cancelled" });
    expect(todai.sessions.get("2026-10-06")).toMatchObject({ status: "held", changed: false });
    const kobun = p.courses.get("高1|古文・漢文");
    expect(kobun.sessions.get("2026-10-09")).toMatchObject({ status: "cancelled" });
    expect(kobun.sessions.has("2026-11-06")).toBe(false);
    const nishi = p.courses.get("高1|高松西高校");
    expect(nishi.sessions.has("2026-10-15")).toBe(false);
    expect(nishi.sessions.get("2026-11-06")).toMatchObject({ status: "held", changed: true });
    expect(courseWeekdays(nishi).regular).toEqual(["月", "木"]);
  });

  it("休校・祝日の行と、日の注記・シートの注記", () => {
    expect(p.days.get("2026-10-12").closed).toEqual({ label: "スポーツの日" });
    expect(p.days.get("2026-11-09").closed).toEqual({ label: "休校" });
    expect(p.days.get("2026-11-06").notes).toEqual(["←11/9(月)の振替→"]);
    expect(p.notes).toEqual(["※日程等の変更がある場合は，授業にて連絡します。"]);
    // 休校の日は講座の記号を拾わない
    expect(p.courses.get("高1|高松西高校").sessions.has("2026-10-12")).toBe(false);
  });

  it("曜日が暦と合わない表は警告する", () => {
    const bad = parseHighSchoolSheet(buildH12({ wrongWeekday: true }));
    expect(bad.warnings).toHaveLength(1);
    expect(bad.warnings[0].kind).toBe("weekday");
    expect(bad.warnings[0].message).toMatch(/^曜日が暦と合わない日が 61 日あります \(例: 10\/1 が「/);
    expect(bad.warnings[0].message).toMatch(/前の年の表の曜日が残っているかもしれません。学校に確認してください。$/);
  });

  it("教員用の予定回数を読み、数と合わない講座を出す", () => {
    const held = (key) =>
      [...p.courses.get(key).sessions.values()].filter((x) => x.status === "held").length;
    const counts = [
      held("高1|高松西高校"), // 一致
      1, // 古文: 表の方が多い → 出す
      held("高2|東京大・京都大・医進／高松高校"),
      held("高2|高松第一高校 物理"),
      99, // プレップ: 表の方が少ない。学期の頭が見えないので出さない
    ];
    const withCounts = parseHighSchoolSheet(buildH12({ counts }));
    expect(withCounts.planned.map((x) => x.count)).toEqual(counts);
    const merged = mergeHighSchoolSheets([{ name: "教員用", parsed: withCounts }]);
    expect(checkPlannedCounts(merged).map((x) => x.courseKey)).toEqual(["高1|古文・漢文"]);
  });
});

// ─── 高3 型 (セルの記号ごとに講座。凡例・集計表つき) ─────────────────
function buildH3({ summaryFri = 4 } = {}) {
  return makeSheet("2026　H3　【10月】", (s) => {
    s.set(1, 1, "2026年度　【高3ゼミ】　10月予定表");
    s.set(4, 3, "本校", "#ccffff");
    s.merge(4, 3, 4, 4);
    s.set(4, 5, "亀井町教室", "#ccffcc");
    s.merge(4, 5, 4, 6);
    s.set(6, 3, "共通テスト/旧帝大");
    s.set(6, 4, "共通テスト対策マークテスト");
    s.set(6, 5, "東大･京大・医進");
    s.set(6, 6, "共通テスト対策マークテスト");
    const map = s.month({ year: 2026, month: 10, dayCol: 1, firstRow: 7, labelRow: 3 });
    let satNo = 0;
    for (const [iso, r] of map) {
      const wd = weekdayIndexOf(iso);
      if (wd === 2) s.set(r, 3, "◎★");
      if (wd === 5) s.set(r, 3, "●★");
      if (wd === 4) s.set(r, 5, "◇");
      if (wd === 6 && iso !== "2026-10-24") s.set(r, 6, "①②③④"[satNo++] || "④");
    }
    // 10/13 (火) は灰色の空欄 = その列の火曜の講座 (◎★) が休講
    s.set(map.get("2026-10-13"), 3, null, GRAY);
    s.set(40, 1, "【本　校】", "#ccffff");
    s.set(40, 3, "　◎：旧帝大レベル【英語/国語】　　★：共通テスト英語(スタンダード)　　①～⑧：マークテスト");
    s.set(42, 3, "　●：共通テスト英語(ハイレベル)");
    s.set(44, 1, "【亀井町】", "#ccffcc");
    s.set(44, 3, "　◇：東大・京大・医進【英語・数学】");
    // 集計表 (曜日 | 記号 | 回数)
    s.set(9, 9, "火");
    s.set(9, 10, "◎★");
    s.set(9, 11, 3);
    s.set(10, 9, "金");
    s.set(10, 10, "●★");
    s.set(10, 11, summaryFri);
  });
}

describe("parseHighSchoolSheet (高3 型)", () => {
  const p = parseHighSchoolSheet(buildH3());

  it("記号ごとの講座。名前と校舎は凡例から (2 つ以上の空白で切る)", () => {
    expect(p.mode).toBe("symbol");
    expect(p.grades).toEqual(["高3"]);
    expect(p.courses.get("高3|sym:◎")).toMatchObject({ name: "旧帝大レベル【英語/国語】", campus: "本校" });
    expect(p.courses.get("高3|sym:★")).toMatchObject({ name: "共通テスト英語(スタンダード)", campus: "本校" });
    expect(p.courses.get("高3|sym:◇")).toMatchObject({ name: "東大・京大・医進【英語・数学】", campus: "亀井町" });
    expect(courseWeekdays(p.courses.get("高3|sym:★")).regular).toEqual(["火", "金"]);
  });

  it("記号の無い灰色セルは、その列のその曜日の講座の休講", () => {
    expect(p.courses.get("高3|sym:◎").sessions.get("2026-10-13")).toMatchObject({ status: "cancelled" });
    expect(p.courses.get("高3|sym:★").sessions.get("2026-10-13")).toMatchObject({ status: "cancelled" });
    expect(p.courses.get("高3|sym:●").sessions.has("2026-10-13")).toBe(false);
  });

  it("マークテストは曜日ごとの講座で、回の番号を持つ", () => {
    const mark = p.courses.get("高3|mark:土");
    expect(mark.campus).toBe("亀井町");
    expect(mark.sessions.get("2026-10-03")).toMatchObject({ status: "held", number: 1 });
    expect(mark.sessions.has("2026-10-24")).toBe(false);
  });

  it("集計表の回数と数が合わなければ出す (多い方)", () => {
    // 火曜の ◎★ は 4 回 (10/13 は休講) - 1 = 3 回で一致。金曜の ●★ は 5 回 > 4
    const merged = mergeHighSchoolSheets([{ name: "10月", parsed: p }]);
    const bad = checkPlannedCounts(merged);
    expect(bad.map((x) => `${x.courseKey}(${x.weekdays})`).sort()).toEqual(
      ["高3|sym:●(金)", "高3|sym:★(金)"].sort()
    );
    expect(bad[0]).toMatchObject({ planned: 4, counted: 5 });
    // 予定どおりなら出ない
    const ok = mergeHighSchoolSheets([{ name: "10月", parsed: parseHighSchoolSheet(buildH3({ summaryFri: 5 })) }]);
    expect(checkPlannedCounts(ok)).toEqual([]);
  });
});

describe("parseHighSchoolSheet (日付型のセル)", () => {
  it("月の見出しが無くても、日付型のセルから月をたどる", () => {
    const sheet = makeSheet("2026　H3　【8-9月】", (s) => {
      s.set(1, 2, "2026年度　【高3ゼミ】　9月～12月予定表");
      let r = 4;
      const put = (iso, first) => {
        const d = Number(iso.slice(8));
        s.set(r, 2, first ? { date: iso } : d);
        s.set(r, 3, "日月火水木金土"[weekdayIndexOf(iso)]);
        if (weekdayIndexOf(iso) === 2) s.set(r, 4, "◎");
        r++;
      };
      for (let d = 24; d <= 31; d++) put(`2026-08-${d}`, d === 24);
      for (let d = 1; d <= 30; d++) put(`2026-09-${String(d).padStart(2, "0")}`, d === 1);
    });
    const p = parseHighSchoolSheet(sheet);
    expect(p.range).toEqual({ start: "2026-08-24", end: "2026-09-30" });
    expect([...p.courses.get("高3|列5").sessions.keys()]).toContain("2026-09-01");
    // シート名は【8-9月】なのに題は「9月～12月予定表」(前の版の書き残し) なので知らせる
    expect(p.warnings).toEqual([
      {
        kind: "titlePeriod",
        message:
          "シート名「2026　H3　【8-9月】」と表の題「2026年度　【高3ゼミ】　9月～12月予定表」で期間が違います" +
          " (表の日付は 8/24〜9/30)。どちらかが前の版の書き残しかもしれません。",
      },
    ]);
  });
});

describe("mergeHighSchoolSheets", () => {
  it("凡例の無いシートの講座に、別のシートの凡例の名前を補う", () => {
    const aug = makeSheet("8-9月", (s) => {
      s.set(1, 1, "2026年度　【高3ゼミ】");
      s.set(6, 3, "共通テスト/旧帝大");
      const map = s.month({ year: 2026, month: 9, dayCol: 1, firstRow: 7, labelRow: 3 });
      for (const [iso, r] of map) {
        if (weekdayIndexOf(iso) === 2) s.set(r, 3, "◎★");
      }
    });
    const merged = mergeHighSchoolSheets([
      { name: "8-9月", parsed: parseHighSchoolSheet(aug) },
      { name: "10月", parsed: parseHighSchoolSheet(buildH3()) },
    ]);
    const c = merged.courses.get("高3|sym:◎");
    expect(c.name).toBe("旧帝大レベル【英語/国語】");
    expect([...c.sessions.keys()].some((d) => d.startsWith("2026-09"))).toBe(true);
    expect([...c.sessions.keys()].some((d) => d.startsWith("2026-10"))).toBe(true);
    // 最後は 10/31 (土) のマークテスト
    expect(merged.families.get("高3").terms).toEqual([{ start: "2026-09-01", end: "2026-10-31" }]);
  });

  it("同じ期間のシートが 2 枚あれば先のシートを使う", () => {
    const a = parseHighSchoolSheet(buildH12());
    const b = parseHighSchoolSheet(buildH12());
    // b では 10/15 の高松西を授業ありにする
    b.courses.get("高1|高松西高校").sessions.set("2026-10-15", { status: "held", changed: false, number: null });
    const merged = mergeHighSchoolSheets([
      { name: "a", parsed: a },
      { name: "b", parsed: b },
    ]);
    expect(merged.courses.get("高1|高松西高校").sessions.has("2026-10-15")).toBe(false);
  });
});

describe("splitTerms", () => {
  it("21 日を超える空きで学期を区切る", () => {
    expect(splitTerms(["2026-07-01", "2026-07-20", "2026-08-25", "2026-09-01"])).toEqual([
      { start: "2026-07-01", end: "2026-07-20" },
      { start: "2026-08-25", end: "2026-09-01" },
    ]);
  });
});

describe("記号", () => {
  it("一覧に無い記号 (■ など) も授業の印として読む。「★■」は 2 講座の授業", () => {
    const sheet = makeSheet("2026\u3000H3\u3000【10月】", (s) => {
      s.set(1, 1, "2026年度\u3000【高3ゼミ】\u300010月予定表");
      s.set(4, 3, "本校");
      s.set(6, 3, "共通テスト");
      const map = s.month({ year: 2026, month: 10, dayCol: 1, firstRow: 7, labelRow: 3 });
      for (const [iso, r] of map) if (weekdayIndexOf(iso) === 5) s.set(r, 3, "★■");
      s.set(40, 3, "\u3000★：共通テスト英語\u3000\u3000■：共通テスト数学");
    });
    const p = parseHighSchoolSheet(sheet);
    expect(p.courses.get("高3|sym:■")).toMatchObject({ name: "共通テスト数学" });
    expect(p.courses.get("高3|sym:★").sessions.size).toBe(5);
    expect(p.courses.get("高3|sym:■").sessions.size).toBe(5);
  });
});

describe("namedMonthRange", () => {
  it("シート名・題の月の期間 (1〜3 月は翌年)", () => {
    expect(namedMonthRange("2026\u3000H3\u3000【9-12月】", "", 2026)).toEqual({ start: "2026-09-01", end: "2026-12-31" });
    expect(namedMonthRange("2025 H1・H2 【1-3月】教員用", "", 2025)).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(namedMonthRange("x", "2026年度 【高1・高2ゼミ】 10月～11月予定表", 2026)).toEqual({
      start: "2026-10-01",
      end: "2026-11-30",
    });
    expect(namedMonthRange("2026 H3 【10月】", "", 2026)).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(namedMonthRange("Sheet1", "", 2026)).toBeNull();
  });
});

describe("checkPlannedCounts (シート名の期間)", () => {
  // 8/28〜12/18 の金曜 (17 回)。「【9-12月】」のシートの予定 16 回は 9/1〜12/31 の分
  const fridays = [];
  for (let d = new Date(Date.UTC(2026, 7, 28)); d <= new Date(Date.UTC(2026, 11, 18)); d.setUTCDate(d.getUTCDate() + 7)) {
    fridays.push(d.toISOString().slice(0, 10));
  }
  const mergedWith = (namedRange) => ({
    planned: [
      {
        courseKey: "高3|sym:★",
        weekdays: "金",
        count: 16,
        sheet: "2026 H3 【9-12月】",
        range: { start: "2026-10-01", end: "2026-12-31" },
        namedRange,
      },
    ],
    courses: new Map([
      ["高3|sym:★", { family: "高3", sessions: new Map(fridays.map((d) => [d, { status: "held" }])) }],
    ]),
    families: new Map([
      ["高3", { terms: [{ start: "2026-08-28", end: "2026-12-18" }], ranges: [{ start: "2026-08-24" }] }],
    ]),
  });

  it("シートの期間 (12 回)・学期 (17 回) で合わなくても、シート名の月 (16 回) で合えば一致", () => {
    expect(fridays).toHaveLength(17);
    expect(checkPlannedCounts(mergedWith({ start: "2026-09-01", end: "2026-12-31" }))).toEqual([]);
    expect(checkPlannedCounts(mergedWith(null))).toMatchObject([{ planned: 16, counted: 17, countedInSheet: 12 }]);
  });
});

// ─── 予定表そのものの点検 ─────────────────────────────────────────

// 高3 の 8 月末〜9 月。金曜は ●★☆ (8/28 だけ ★☆)。集計表は「金 ●★☆ 4」
function buildH3Fri({ stray = false } = {}) {
  return makeSheet("2026\u3000H3\u3000【9月】", (s) => {
    s.set(1, 1, "2026年度\u3000【高3ゼミ】\u30009月予定表");
    s.set(4, 3, "本校");
    s.set(6, 3, "共通テスト");
    const aug = s.month({ year: 2026, month: 8, dayCol: 1, firstRow: 7, labelRow: 3 });
    const sep = s.month({ year: 2026, month: 9, dayCol: 6, firstRow: 7, labelRow: 3 });
    s.set(4, 8, "本校");
    s.set(6, 8, "共通テスト");
    s.set(aug.get("2026-08-28"), 3, "★☆");
    for (const [iso, r] of sep) if (weekdayIndexOf(iso) === 5) s.set(r, 8, "●★☆");
    s.set(42, 3, "\u3000●：共通テスト英語(ハイレベル)\u3000\u3000★：共通テスト数学\u3000\u3000☆：共通テスト国語");
    s.set(9, 12, "金");
    s.set(9, 13, "●★☆");
    s.set(9, 14, 4);
    if (stray) s.set(57, 76, "☆11");
  });
}

describe("予定表の点検 (集計表の記号どうし)", () => {
  it("集計表の 1 行の記号で、表の印の数が違えば知らせる (シート名の月で数えると合ってしまう分も)", () => {
    const p = parseHighSchoolSheet(buildH3Fri());
    expect(p.mode).toBe("symbol");
    const w = p.warnings.filter((x) => x.kind === "plannedGroup");
    expect(w).toHaveLength(1);
    expect(w[0].message).toBe(
      "集計表の「金 ●★☆ 4 回」は 3 つの講座を同じ回数としていますが、表の印を数えると ● 4 回・★ 5 回・☆ 5 回です" +
        " (8/28 (金) は「★☆」だけ)。回数か印のどちらかが誤っているかもしれません。学校に確認してください。"
    );
    // 予定回数の点検だけでは、★☆ もシート名の月 (9 月) で数えると 4 回になり見逃す
    const merged = mergeHighSchoolSheets([{ name: "9月", parsed: p }]);
    expect(checkPlannedCounts(merged)).toEqual([]);
  });

  it("記号どうしの数が同じなら出さない", () => {
    const p = parseHighSchoolSheet(buildH3());
    expect(p.warnings.filter((x) => x.kind === "plannedGroup")).toEqual([]);
  });
});

describe("予定表の点検 (表の外の印)", () => {
  it("表の外に残った印をセルの位置つきで知らせる (凡例・集計表・注記は除く)", () => {
    const p = parseHighSchoolSheet(buildH3Fri({ stray: true }));
    const w = p.warnings.filter((x) => x.kind === "stray");
    expect(w).toEqual([
      {
        kind: "stray",
        message:
          "表の外に授業の印があります: BY58「☆11」。消し忘れ・書き間違いかもしれません (この画面ではどの講座の授業にも数えていません)。",
      },
    ]);
    expect(parseHighSchoolSheet(buildH3Fri()).warnings.filter((x) => x.kind === "stray")).toEqual([]);
    expect(parseHighSchoolSheet(buildH3()).warnings.filter((x) => x.kind === "stray")).toEqual([]);
  });

  it("列の名前", () => {
    expect([0, 25, 26, 51, 76, 701].map(columnName)).toEqual(["A", "Z", "AA", "AZ", "BY", "ZZ"]);
  });
});

describe("予定表の点検 (シート名と題の期間)", () => {
  it("同じ期間なら出さない", () => {
    expect(parseHighSchoolSheet(buildH12()).warnings).toEqual([]);
  });
});

describe("予定表の点検 (凡例に無い色)", () => {
  // 1 列 = 1 講座 の表。月曜に授業。fills で日付ごとの塗りを決める
  function colored({ fills = {}, legend = [], rowFill = null, colFill = null, shade = null } = {}) {
    return makeSheet("2026 H1H2【10月】", (s) => {
      s.set(1, 1, "2026年度 【高1・高2ゼミ】 10月予定表");
      s.set(4, 3, "高1");
      s.set(4, 4, "高1");
      s.set(4, 5, "高2");
      s.set(6, 3, "高松西高校");
      s.set(6, 4, "古文・漢文");
      s.set(6, 5, "高松高校");
      const map = s.month({ year: 2026, month: 10, dayCol: 1, firstRow: 7, labelRow: 3 });
      for (const [iso, r] of map) {
        const wd = weekdayIndexOf(iso);
        if (wd === 1) s.set(r, 3, "●", fills[iso] || null);
        if (wd === 4) s.set(r, 4, "◇");
        // 高松高校の列は全体を薄い色で塗った列 (校舎の色分けなど)
        s.set(r, 5, wd === 2 ? "〇" : null, colFill);
        if (rowFill && wd === 6) {
          // 土曜の行は日付・曜日の欄から講座の列まで同じ色
          s.set(r, 1, Number(iso.slice(8)), rowFill);
          s.set(r, 2, "土", rowFill);
          s.set(r, 4, null, rowFill);
        }
        if (shade?.dates.includes(iso)) {
          // テストの日の行を日付の欄ごと塗る
          s.set(r, 1, Number(iso.slice(8)), shade.fill);
          s.set(r, 2, "日月火水木金土"[wd], shade.fill);
          for (const c of [3, 4, 5]) s.set(r, c, null, shade.fill);
        }
      }
      legend.forEach(([text, fill], i) => s.set(40 + i, 3, text, fill));
    });
  }

  it("灰色・黄色・赤以外で、凡例・見出しに無い色の塗りを日付つきで知らせる", () => {
    const green = "#ccffcc";
    const p = parseHighSchoolSheet(
      colored({ fills: { "2026-10-19": green, "2026-10-26": green }, legend: [["定期テスト", YELLOW]] })
    );
    expect(p.warnings).toEqual([
      {
        kind: "fill",
        message:
          "凡例に無い色 (緑 #ccffcc) で塗った欄が 2 か所あります (10/19 (月)・10/26 (月))。" +
          "この画面では塗りを見ずに、記号があれば授業ありとして読んでいます。何の印か学校に確認してください。",
      },
    ]);
  });

  it("テストの日の行を日付の欄ごと塗ってあっても知らせる", () => {
    const p = parseHighSchoolSheet(colored({ shade: { dates: ["2026-10-20", "2026-10-21"], fill: "#92d050" } }));
    expect(p.warnings.map((w) => w.message)).toEqual([
      "凡例に無い色 (緑 #92d050) で塗った欄が 6 か所あります (10/20 (火)・10/21 (水))。" +
        "この画面では塗りを見ずに、記号があれば授業ありとして読んでいます。何の印か学校に確認してください。",
    ]);
  });

  it("凡例にある色・曜日ごとの塗り・列ごとの塗り・灰色/黄色は知らせない", () => {
    const green = "#ccffcc";
    const p = parseHighSchoolSheet(
      colored({
        fills: { "2026-10-19": green, "2026-10-05": GRAY, "2026-10-12": YELLOW },
        legend: [["模試", green]],
        rowFill: "#ddebf7",
        colFill: "#fff2cc",
      })
    );
    expect(p.warnings).toEqual([]);
  });

  it("色の名前", () => {
    expect(["#ccffcc", "#00b050", "#9bc2e6", "#ffc000", "#ff99cc", "#cc99ff", "#808080"].map(fillColorName)).toEqual([
      "緑",
      "緑",
      "青",
      "橙",
      "桃色",
      "紫",
      "灰色",
    ]);
  });
});
