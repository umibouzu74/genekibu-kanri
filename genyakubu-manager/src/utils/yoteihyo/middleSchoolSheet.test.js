import { describe, expect, it } from "vitest";
import { makeEventHelpers } from "../../components/views/dashboardHelpers";
import { buildCancelIndex } from "../slotCancel";
import { compareSchedules, compareSessionNumbers } from "./compare";
import { courseGradeMatches, effectiveMapping, suggestMapping } from "./courseMapping";
import { mergeHighSchoolSheets } from "./highSchoolSheet";
import { middleGradesIn, parseMiddleLegend, parseMiddleSchoolSheet, SHARED_GRADE } from "./middleSchoolSheet";
import { analyzeWorkbook, defaultSheetSelection } from "./sheetSelection";
import { BLACK, makeSheet, smallT1T2Sheet, weekdayIndexOf } from "./testUtils";
import { courseLabel } from "./labels";
import { proposeCohortCutoffs } from "./cutoffProposals";

const sessionsOf = (course) =>
  [...course.sessions].sort(([a], [b]) => a.localeCompare(b)).map(([d, x]) => [d.slice(5), x.status === "held" ? x.number : "×"]);

describe("凡例・学年の読み取り", () => {
  it("題の学年 (附中は含めない)", () => {
    expect(middleGradesIn("2026年度【中1・中2ゼミ】")).toEqual(["中1", "中2"]);
    expect(middleGradesIn("【中3ゼミ】附中コース")).toEqual(["中3"]);
    expect(middleGradesIn("中1・2")).toEqual(["中1", "中2"]);
  });

  it("「中N…」のあとの記号はその学年、離れた記号は学年をまたぐ", () => {
    const lg = parseMiddleLegend([
      "中1…■：本科，◇：附中　　　中2…□：本科，◆：附中　　　☆：プレップ（個別指導）",
      "■：本科コース（火木）　□：本科コース（水金）　◆：附中コース　★内申対策コース",
    ]);
    expect(lg.byGrade.get("中1").get("◇")).toBe("附中");
    expect(lg.byGrade.get("中2").get("□")).toBe("本科");
    expect(lg.global.get("☆")).toBe("プレップ(個別指導)");
    // 「★内申対策」のように「：」が無くても読む
    expect(lg.global.get("★")).toBe("内申対策コース");
  });
});

describe("parseMiddleSchoolSheet (中1・中2)", () => {
  const p = parseMiddleSchoolSheet(smallT1T2Sheet());

  it("記号ごとのコースと、その日の第N回", () => {
    expect([...p.courses.keys()].sort()).toEqual(
      ["中1|sym:■", "中2|sym:□", "中学|sym:☆", "附中1|sym:◇", "附中2|sym:◆"].sort()
    );
    const hon1 = p.courses.get("中1|sym:■");
    expect(hon1.dept).toBe("中学部");
    expect(hon1.grades).toEqual(["中1"]);
    expect(sessionsOf(hon1).slice(0, 3)).toEqual([["10-02", 1], ["10-06", 2], ["10-09", 3]]);
    expect(courseLabel(hon1)).toBe("中1 ■ 本科");
    // 附中は学年を「附中N」に (システムの学年の書き方)
    expect(p.courses.get("附中1|sym:◇").grades).toEqual(["附中1"]);
  });

  it("2 つの欄をまたぐ記号は学年をまたぐコース (☆ プレップ)", () => {
    const prep = p.courses.get("中学|sym:☆");
    expect(prep.shared).toBe(true);
    expect(prep.grades).toEqual([SHARED_GRADE]);
    expect(prep.sheetGrades).toEqual(["中1", "中2"]);
    expect(prep.name).toBe("プレップ(個別指導)");
  });

  it("「※」はその欄の、その曜日がいつもの曜日のコースの授業なし", () => {
    expect(p.courses.get("中学|sym:☆").sessions.get("2026-10-17").status).toBe("cancelled");
    expect(p.courses.get("附中2|sym:◆").sessions.get("2026-11-04").status).toBe("cancelled");
    // 同じ欄でも曜日の違うコース (中2 本科は月木) には付けない
    expect(p.courses.get("中2|sym:□").sessions.has("2026-11-04")).toBe(false);
  });

  it("黄色は振替・変更、黒い曜日は休日、備考の日付はその日の注記", () => {
    expect(p.courses.get("中2|sym:□").sessions.get("2026-11-06")).toMatchObject({ status: "held", changed: true });
    expect(p.days.get("2026-10-12").closed).toEqual({ label: "休日" });
    expect(p.days.get("2026-11-06").notes).toContain("中2本科：11/9(月)の授業を11/6(金)に振替");
    expect(p.days.get("2026-11-09").notes).toContain("中2本科：11/9(月)の授業を11/6(金)に振替");
    // 見出し「＜ゼミ終講日＞」を添える
    expect(p.days.get("2026-11-27").notes).toContain("＜ゼミ終講日＞ 中1本科：11/27(金)");
    // 授業の記号の無い休校の日は休みの日
    expect(p.days.get("2026-10-17").closed.label).toMatch(/休校/);
    expect(p.notes).toContain("※予定に変更がある場合，担任からお知らせします。");
  });

  it("凡例の色はその日の注記、凡例に無い色・表の外の印は点検に出す", () => {
    expect(p.days.get("2026-10-20").notes).toContain("公立中学校定期テスト(標準日)");
    const kinds = p.warnings.map((w) => w.kind).sort();
    expect(kinds).toEqual(["fill", "stray"]);
    expect(p.warnings.find((w) => w.kind === "stray").message).toMatch(/「☆9」/);
    expect(p.warnings.find((w) => w.kind === "fill").message).toMatch(/#e2f0d9.*11\/25/);
  });

  it("曜日が暦と合わない月は比べず、点検に出す (前の年の曜日の書き残し)", () => {
    const wrong = parseMiddleSchoolSheet(smallT1T2Sheet({ wrongWeekday: true }));
    const w = wrong.warnings.find((x) => x.kind === "weekday");
    expect(w.message).toMatch(/11月の欄の曜日が 2026 年の暦と合いません/);
    expect(w.message).toMatch(/比べていません/);
    const hon1 = wrong.courses.get("中1|sym:■");
    expect([...hon1.sessions.keys()].every((d) => d < "2026-11-01")).toBe(true);
  });
});

// 中3 の予定表 (形は「T3」を写したもの): 欄は「本科コース」「附中コース」。
// ■ 本科 (火木)・□ 本科 (水金)・◆ 附中 (水)、☆ プレップと ★ 内申対策は 2 つの欄をまたぐ
function smallT3Sheet() {
  return makeSheet("T3", (s) => {
    s.set(0, 0, "2026年度【中3ゼミ】 10月予定表　■：本科コース（火木）　□：本科コース（水金）　◆：附中コース　☆：プレップ（個別指導）　★：内申対策コース");
    s.set(2, 0, "10月");
    s.set(3, 0, "コース");
    s.set(3, 2, "本科コース");
    s.merge(3, 2, 3, 7);
    s.set(3, 8, "附中コース");
    s.merge(3, 8, 3, 13);
    const map = s.month({ year: 2026, month: 10, dayCol: 0, firstRow: 4 });
    const n = {};
    const next = (k) => (n[k] = (n[k] || 0) + 1);
    for (const [iso, r] of map) {
      const wd = weekdayIndexOf(iso);
      if (wd === 0) {
        s.set(r, 1, "日", BLACK);
        continue;
      }
      if (wd === 6) {
        s.set(r, 2, iso === "2026-10-17" ? "※" : `☆${next("☆")}  ★${next("★")}`);
        s.merge(r, 2, r, 13);
        continue;
      }
      if (wd === 2 || wd === 4) s.set(r, 2, `■${next("■")}  英①`);
      if (wd === 3 || wd === 5) s.set(r, 2, `□${next("□")}  数①`);
      if (wd === 3) s.set(r, 8, `◆${next("◆")}  国①`);
    }
  });
}

describe("中3 の予定表と、中1・中2 の予定表をまとめる", () => {
  const t3 = parseMiddleSchoolSheet(smallT3Sheet());

  it("中3 の本科 2 コースと附中、学年をまたぐ ☆ ★", () => {
    expect([...t3.courses.keys()].sort()).toEqual(
      ["中3|sym:■", "中3|sym:□", "中学|sym:☆", "中学|sym:★", "附中3|sym:◆"].sort()
    );
    expect(t3.courses.get("中3|sym:□").name).toBe("本科コース(水金)");
    expect(t3.courses.get("中学|sym:★").sessions.get("2026-10-17").status).toBe("cancelled");
  });

  it("☆ プレップは 2 枚の表で 1 コース (学年を足す)", () => {
    const merged = mergeHighSchoolSheets([
      { name: "T1T2", parsed: parseMiddleSchoolSheet(smallT1T2Sheet()) },
      { name: "T3", parsed: t3 },
    ]);
    const prep = merged.courses.get("中学|sym:☆");
    expect(prep.sheetGrades).toEqual(["中1", "中2", "中3"]);
    expect(prep.dept).toBe("中学部");
  });

  it("ブックの中学部のシートを読み、既定で選ぶ", () => {
    const sheets = analyzeWorkbook({ sheets: [smallT1T2Sheet(), smallT3Sheet()] });
    expect(sheets.map((s) => s.kind)).toEqual(["middle", "middle"]);
    expect([...defaultSheetSelection(sheets, "2026-10-16")].sort()).toEqual([0, 1]);
  });
});

// システムのコマ (作りもの)
const SLOTS = [
  { id: 1, day: "火", time: "19:00-20:20", grade: "中1", cls: "", subj: "英語", room: "601", teacher: "A", note: "" },
  { id: 2, day: "金", time: "19:00-20:20", grade: "中1", cls: "", subj: "数学", room: "601", teacher: "B", note: "" },
  { id: 3, day: "水", time: "17:00-18:20", grade: "附中1", cls: "", subj: "英語", room: "602", teacher: "C", note: "" },
  { id: 4, day: "月", time: "19:00-20:20", grade: "中2", cls: "", subj: "国語", room: "603", teacher: "D", note: "" },
  { id: 5, day: "木", time: "19:00-20:20", grade: "中2", cls: "", subj: "理科", room: "603", teacher: "E", note: "" },
  { id: 6, day: "水", time: "18:30-19:50", grade: "附中2", cls: "", subj: "数学", room: "604", teacher: "F", note: "" },
  { id: 7, day: "土", time: "15:00-16:20", grade: "中1-3", cls: "", subj: "プレップ", room: "605", teacher: "G", note: "" },
  { id: 8, day: "土", time: "16:30-17:50", grade: "中1-3", cls: "", subj: "プレップ", room: "605", teacher: "G", note: "" },
  { id: 9, day: "水", time: "21:00-21:30", grade: "附中", cls: "", subj: "確認テスト", room: "606", teacher: "H", note: "" },
];
const CUTOFF = {
  groups: [
    {
      label: "中学",
      grades: ["中1", "中2", "中3", "附中1", "附中2", "附中3"],
      startDate: "2026-10-01",
      date: "2027-03-31",
      orientationFirstDay: false,
    },
  ],
};

function makeSys({ holidays = [], classSets = [] } = {}) {
  const helpers = makeEventHelpers(holidays, [], []);
  const ctx = {
    classSets,
    allSlots: SLOTS,
    displayCutoff: CUTOFF,
    timetables: [],
    isOffForGrade: helpers.isOffForGrade,
    biweeklyAnchors: [],
    holidays,
    examPeriods: [],
    sessionOverrides: [],
    daySchedules: [],
    adjustments: [],
    _cancelIndex: buildCancelIndex([]),
    orientationOnFirstDay: true,
  };
  return { ctx, adjustments: [], holidays, examPeriods: [], displayCutoff: CUTOFF, timetables: [], extraLessons: [] };
}

function setup(sysOpts) {
  const merged = mergeHighSchoolSheets([{ name: "T1T2", parsed: parseMiddleSchoolSheet(smallT1T2Sheet()) }]);
  const suggested = suggestMapping(merged.courses.values(), SLOTS);
  const mapping = effectiveMapping(suggested.byCourse, {});
  return { merged, suggested, mapping, sys: makeSys(sysOpts) };
}

describe("中学部のコース → システムのコマ", () => {
  it("学年 × いつもの曜日で当てる。名前のあるコース (プレップ) は科目名で", () => {
    const { suggested } = setup();
    const subj = (k) => suggested.byCourse.get(k).subjects;
    expect(subj("中1|sym:■")).toEqual(["中1|数学", "中1|英語"]);
    expect(subj("附中1|sym:◇")).toEqual(["附中1|英語"]);
    expect(subj("中2|sym:□")).toEqual(["中2|国語", "中2|理科"]);
    expect(subj("附中2|sym:◆")).toEqual(["附中2|数学"]);
    expect(subj("中学|sym:☆")).toEqual(["中1-3|プレップ"]);
  });

  it("対応表の候補: 学年をまたぐコースは「中1-3」のような共通学年も入る", () => {
    const { merged } = setup();
    expect(courseGradeMatches(merged.courses.get("中学|sym:☆"), "中1-3")).toBe(true);
    expect(courseGradeMatches(merged.courses.get("中1|sym:■"), "中2")).toBe(false);
  });
});

describe("中学部の予定表とシステムを比べる", () => {
  it("※ の日・振替元の日にシステムで授業があれば食い違い、振替先は日まるごと振替の案内", () => {
    const { merged, mapping, sys } = setup();
    const { findings } = compareSchedules({ merged, mapping, slots: SLOTS, sys });
    const at = (date) => findings.filter((f) => f.date === date).map((f) => `${f.kind}:${f.courseKey}`).sort();
    expect(at("2026-10-17")).toEqual(["needOff:中学|sym:☆"]);
    expect(at("2026-11-04")).toEqual(["needOff:附中2|sym:◆"]);
    expect(at("2026-11-09")).toEqual(["needOff:中2|sym:□"]);
    const extra = findings.find((f) => f.date === "2026-11-06");
    expect(extra).toMatchObject({ kind: "missingExtra", courseKey: "中2|sym:□", sourceDate: "2026-11-09" });
  });

  it("予定表の第N回と比べる: 1 日 2 コマで 2 回進んでいれば「日数カウント」の案内", () => {
    const { merged, mapping, sys } = setup();
    const issues = compareSessionNumbers({ merged, mapping, slots: SLOTS, sys });
    // 本科 (システムでは教科が 2 つ = カウンタが 2 本) は比べない。プレップと、
    // 科目が 1 つの附中2 だけ
    expect(issues.map((x) => x.courseKey).sort()).toEqual(["中学|sym:☆", "附中2|sym:◆"]);
    const prep = issues.find((x) => x.courseKey === "中学|sym:☆");
    expect(prep.first).toEqual({ date: "2026-10-03", sheetNo: 1, systemNos: [1, 2] });
    expect(prep.hint).toBe("perDay");
    // 附中2 は 11/4 の「※」をシステムで休講にしていないので、その次から 1 つずれる
    const fz = issues.find((x) => x.courseKey === "附中2|sym:◆");
    expect(fz.first).toEqual({ date: "2026-11-11", sheetNo: 5, systemNos: [6] });
    expect(fz.hint).toBeNull();
  });

  it("授業セットの日数カウント + 休校の休講日を入れると合う", () => {
    const holidays = [
      { id: 1, date: "2026-10-17", label: "休校", scope: ["中学部"], targetGrades: ["中1-3"], subjKeywords: [] },
      { id: 2, date: "2026-11-04", label: "休講", scope: ["中学部"], targetGrades: ["附中2"], subjKeywords: [] },
    ];
    const classSets = [{ id: 1, label: "土プレップ", units: [{ grade: "中1-3", day: "土" }], countByDay: true }];
    const { merged, mapping, sys } = setup({ holidays, classSets });
    expect(compareSessionNumbers({ merged, mapping, slots: SLOTS, sys })).toEqual([]);
  });

  it("日数カウントだけで休講日が無いと、途中から 1 つずれる (休講の登録を確かめる案内)", () => {
    const classSets = [{ id: 1, label: "土プレップ", units: [{ grade: "中1-3", day: "土" }], countByDay: true }];
    const { merged, mapping, sys } = setup({ classSets });
    const issue = compareSessionNumbers({ merged, mapping, slots: SLOTS, sys }).find(
      (x) => x.courseKey === "中学|sym:☆"
    );
    expect(issue.first).toEqual({ date: "2026-10-24", sheetNo: 3, systemNos: [4] });
    expect(issue.hint).toBeNull();
  });

  it("予定表の最後の授業日から中学部のコースの終講日を案にする", () => {
    const { merged, mapping } = setup();
    const { proposals } = proposeCohortCutoffs({ merged, mapping, slots: SLOTS, displayCutoff: CUTOFF });
    const byId = new Map(proposals.map((p) => [p.cohortId, p.proposed]));
    expect(byId.get("M|中1|火金")).toBe("2026-11-27");
    expect(byId.get("M|中1-3|土")).toBe("2026-11-28");
  });
});
