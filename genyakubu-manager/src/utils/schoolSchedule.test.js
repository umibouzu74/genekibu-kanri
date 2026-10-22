import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHOOL_FILTER,
  buildSchoolBadges,
  buildSchoolTimeline,
  describeExamDates,
  describeSchoolBadge,
  examDayState,
  gradeMatches,
  isSchoolBadgeExam,
  isSchoolBadgeMock,
  mdRange,
  mockGradeClass,
  normalizeSchoolFilter,
  schoolKeyOf,
  stripSchoolPrefix,
} from "./schoolSchedule";
import { buildImportedExamPeriods, parseExamPeriodImport } from "./examPeriodImport";
import { buildImportedEvents, parseSpecialEventImport } from "./specialEventImport";
import { SCHOOL_EXAM_TSV, SCHOOL_MOCK_TSV } from "./testdata/schoolSchedule2026";

// 付録 B (2026 年度の桜井・第一) をまとめて登録の経路で読み込む
const examPeriods = buildImportedExamPeriods(
  parseExamPeriodImport(SCHOOL_EXAM_TSV, { fiscalYear: 2026 }).rows,
  { startId: 1 }
);
const specialEvents = buildImportedEvents(
  parseSpecialEventImport(SCHOOL_MOCK_TSV, { fiscalYear: 2026 }).rows,
  { startId: 1 }
);
const data = { examPeriods, specialEvents };

// 日付 → 「学校 + 状態」の短い表記 (受け入れ条件の書き方に寄せる)
const chip = (b) => {
  const s = b.examState;
  const state =
    s?.kind === "exam" ? `❶❷❸❹❺❻`[s.index - 1] : s?.kind === "announce" ? " 発表" : s ? `(${s.kind})` : "";
  const mock = b.mocks.length ? (b.onlyOptionalMocks ? "[模?]" : "[模]") : "";
  return `${b.school}${state}${mock}`;
};
const badgesOn = (map, d) => (map.get(d) || []).map(chip);

const ep = (over = {}) => ({
  id: 1,
  name: "桜井2学期期末",
  startDate: "2026-11-19",
  endDate: "2026-12-02",
  targetGrades: [],
  stopsClasses: false,
  tags: ["桜井"],
  examDates: ["2026-11-26", "2026-11-27", "2026-11-30", "2026-12-01", "2026-12-02"],
  ...over,
});

describe("学校キー・まとめる対象", () => {
  it("予約タグ (希望者・部のタグ) を除いた tags の先頭。無ければ null", () => {
    expect(schoolKeyOf({ tags: ["桜井", "希望者"] })).toBe("桜井");
    expect(schoolKeyOf({ tags: ["希望者", "第一"] })).toBe("第一");
    expect(schoolKeyOf({ tags: ["高校", " 西 "] })).toBe("西");
    expect(schoolKeyOf({ tags: ["希望者"] })).toBeNull();
    expect(schoolKeyOf({ tags: [] })).toBeNull();
    expect(schoolKeyOf({})).toBeNull();
  });

  it("テスト期間は授業を止めない + 学校キーあり、特別イベントは模試 + 学校キーあり", () => {
    expect(isSchoolBadgeExam(ep())).toBe(true);
    expect(isSchoolBadgeExam(ep({ stopsClasses: undefined }))).toBe(false);
    expect(isSchoolBadgeExam(ep({ stopsClasses: true }))).toBe(false);
    expect(isSchoolBadgeExam(ep({ tags: [] }))).toBe(false);
    const mock = { id: 1, name: "模試", startDate: "2026-10-03", eventType: "mock", tags: ["桜井"] };
    expect(isSchoolBadgeMock(mock)).toBe(true);
    expect(isSchoolBadgeMock({ ...mock, eventType: "school" })).toBe(false);
    expect(isSchoolBadgeMock({ ...mock, tags: ["希望者"] })).toBe(false);
  });
});

describe("examDayState", () => {
  it("発表 / 発表後 / n 日目 / 期間中の休み / 期間外", () => {
    const e = ep();
    expect(examDayState(e, "2026-11-18")).toBeNull();
    expect(examDayState(e, "2026-11-19")).toEqual({ kind: "announce" });
    expect(examDayState(e, "2026-11-20")).toEqual({ kind: "pre" });
    expect(examDayState(e, "2026-11-25")).toEqual({ kind: "pre" });
    expect(examDayState(e, "2026-11-26")).toEqual({ kind: "exam", index: 1, total: 5 });
    expect(examDayState(e, "2026-11-28")).toEqual({ kind: "gap" });
    expect(examDayState(e, "2026-12-02")).toEqual({ kind: "exam", index: 5, total: 5 });
    expect(examDayState(e, "2026-12-03")).toBeNull();
  });

  it("考査日が無いテスト期間は期間全体が period (従来の見え方を変えない)", () => {
    const e = ep({ examDates: undefined });
    expect(examDayState(e, "2026-11-19")).toEqual({ kind: "period" });
    expect(examDayState(e, "2026-11-30")).toEqual({ kind: "period" });
  });

  it("開始日が考査日なら発表ではなく 1 日目。並びの乱れ・範囲外の考査日は無視", () => {
    const e = ep({ startDate: "2026-11-26", examDates: ["2026-12-02", "2026-11-26", "2026-11-26", "2027-01-01"] });
    expect(examDayState(e, "2026-11-26")).toEqual({ kind: "exam", index: 1, total: 2 });
    expect(examDayState(e, "2026-12-02")).toEqual({ kind: "exam", index: 2, total: 2 });
  });
});

describe("絞り込み", () => {
  it("学年は対象学年と交わるか (空 = 全学年は常に出す)", () => {
    expect(gradeMatches(["高3"], "12")).toBe(false);
    expect(gradeMatches(["高2", "高3"], "12")).toBe(true);
    expect(gradeMatches([], "3")).toBe(true);
    expect(gradeMatches(["高3"], "all")).toBe(true);
  });

  it("保存された値は不正なら既定に戻す", () => {
    expect(normalizeSchoolFilter(null)).toEqual(DEFAULT_SCHOOL_FILTER);
    expect(normalizeSchoolFilter({ grade: "高1", exam: "yes", mock: false, optional: true })).toEqual({
      grade: "all",
      exam: true,
      mock: false,
      optional: true,
    });
  });
});

describe("buildSchoolBadges (付録 B)", () => {
  it("11 月: 発表 → 発表後 → 考査 n 日目 → 期間中の休み", () => {
    const m = buildSchoolBadges(data, "2026-11-01", "2026-11-30");
    expect(badgesOn(m, "2026-11-19")).toEqual(["桜井 発表"]);
    expect(badgesOn(m, "2026-11-20")).toEqual(["桜井(pre)"]);
    expect(badgesOn(m, "2026-11-25")).toEqual(["桜井(pre)", "第一 発表"]);
    expect(badgesOn(m, "2026-11-26")).toEqual(["桜井❶", "第一(pre)"]);
    expect(badgesOn(m, "2026-11-28")).toEqual(["桜井(gap)", "第一(pre)"]);
    expect(badgesOn(m, "2026-11-29")).toEqual(["桜井(gap)", "第一(pre)"]);
    expect(badgesOn(m, "2026-11-30")).toEqual(["桜井❸", "第一(pre)"]);
    // 模試: 11/7 は第一の 1・2年進研記述 (冠模試は既定で出さない)
    expect(badgesOn(m, "2026-11-07")).toEqual(["第一[模]"]);
    expect(m.get("2026-11-07")[0].mocks.map((e) => e.name)).toEqual(["第一 1・2年進研記述"]);
    // 1 日に 1 校 1 つ。考査期間の毎日に名前が並ばない
    for (const list of m.values()) {
      expect(new Set(list.map((b) => b.school)).size).toBe(list.length);
    }
  });

  it("12 月: 12/2 は桜井❺と第一❶、12/3 は第一の休み、12/8 は第一❹", () => {
    const m = buildSchoolBadges(data, "2026-12-01", "2026-12-31");
    expect(badgesOn(m, "2026-12-02")).toEqual(["桜井❺", "第一❶"]);
    expect(badgesOn(m, "2026-12-03")).toEqual(["第一(gap)"]);
    expect(badgesOn(m, "2026-12-08")).toEqual(["第一❹"]);
    // 考査中の模試: 12/4 は第一の考査 2 日目 + 桜井の模試だけの日
    expect(badgesOn(m, "2026-12-04")).toEqual(["桜井[模]", "第一❷"]);
  });

  it("学年「高1・2」で 3 年のみの模試が消える", () => {
    const all = buildSchoolBadges(data, "2026-10-30", "2026-10-31");
    expect(all.get("2026-10-30")[0].mocks.map((e) => e.name)).toEqual(["桜井 3年第8回校外模試(進研マーク)"]);
    const m = buildSchoolBadges({ ...data, filter: { ...DEFAULT_SCHOOL_FILTER, grade: "12" } }, "2026-10-30", "2026-10-31");
    expect(m.has("2026-10-30")).toBe(false);
    expect(m.get("2026-10-31").flatMap((b) => b.mocks.map((e) => e.name))).toEqual([
      "桜井 1・2年第2回校外模試(進研記述)",
    ]);
  });

  it("希望者・冠模試は既定で出さず、オンにすると「希望者だけ」の印が付く", () => {
    const off = buildSchoolBadges(data, "2026-10-24", "2026-10-24");
    expect(badgesOn(off, "2026-10-24")).toEqual(["桜井[模]"]);
    const on = buildSchoolBadges(
      { ...data, filter: { ...DEFAULT_SCHOOL_FILTER, optional: true } },
      "2026-10-24",
      "2026-10-24"
    );
    expect(badgesOn(on, "2026-10-24")).toEqual(["桜井[模]", "第一[模?]"]);
  });

  it("種類のチェックを外すとその種類はバッジにならない", () => {
    const noExam = buildSchoolBadges({ ...data, filter: { ...DEFAULT_SCHOOL_FILTER, exam: false } }, "2026-12-01", "2026-12-08");
    expect(badgesOn(noExam, "2026-12-02")).toEqual([]);
    expect(badgesOn(noExam, "2026-12-04")).toEqual(["桜井[模]"]);
    const noMock = buildSchoolBadges({ ...data, filter: { ...DEFAULT_SCHOOL_FILTER, mock: false } }, "2026-12-01", "2026-12-08");
    expect(badgesOn(noMock, "2026-12-04")).toEqual(["第一❷"]);
  });

  it("発表日が学年で違う 2 行は、その日の状態の強い方 (発表) を見た目に使う", () => {
    const m = buildSchoolBadges(data, "2026-06-22", "2026-07-08");
    expect(badgesOn(m, "2026-06-25")).toEqual(["桜井 発表", "第一(pre)"]);
    expect(m.get("2026-06-25")[0].exams).toHaveLength(2);
    expect(badgesOn(m, "2026-07-02")).toEqual(["桜井❶", "第一❶"]);
  });
});

describe("文言", () => {
  it("バッジの全文 (aria-label / title)", () => {
    const m = buildSchoolBadges(data, "2026-11-27", "2026-11-27");
    expect(describeSchoolBadge(m.get("2026-11-27")[0], "2026-11-27")).toBe(
      "桜井 2学期期末（高校部）考査2日目 11/26〜12/2"
    );
    const pre = buildSchoolBadges(data, "2026-11-20", "2026-11-20");
    expect(describeSchoolBadge(pre.get("2026-11-20")[0], "2026-11-20")).toBe(
      "桜井 2学期期末（高校部）発表後 (考査まであと6日) 11/26〜12/2"
    );
    const mock = buildSchoolBadges(data, "2026-12-04", "2026-12-04").get("2026-12-04")[0];
    expect(describeSchoolBadge(mock, "2026-12-04")).toBe(
      "桜井 模試: 大進研共通テストファイナル(3年)（高3） 12/4〜5"
    );
  });

  it("一覧の 1 行・短い日付の範囲・学校名の頭", () => {
    expect(describeExamDates(examPeriods.find((e) => e.name === "桜井2学期中間"))).toBe(
      "発表 10/6 → 考査 10/13〜16（4日）"
    );
    expect(describeExamDates(ep({ startDate: "2026-11-26" }))).toBe("考査 11/26〜12/2（5日）");
    expect(describeExamDates(ep({ examDates: undefined }))).toBe("");
    expect(mdRange("2026-11-26", "2026-12-02")).toBe("11/26〜12/2");
    expect(stripSchoolPrefix("桜井 2学期期末", "桜井")).toBe("2学期期末");
    expect(stripSchoolPrefix("桜井", "桜井")).toBe("桜井");
  });

  it("模試の色分け: 高1・2 を含む / 高3 のみ / 学年の記載なし", () => {
    expect(mockGradeClass(["高2", "高3"])).toBe("g12");
    expect(mockGradeClass(["高3"])).toBe("g3");
    expect(mockGradeClass([])).toBe("all");
  });
});

describe("buildSchoolTimeline (付録 B)", () => {
  it("10〜12 月: 考査中の学校が 2 校重なるのは 10/13〜16 と 12/2 だけ", () => {
    const tl = buildSchoolTimeline(data, "2026-10-01", "2026-12-31");
    expect(tl.days).toBe(92);
    const two = tl.examCounts.filter((c) => c.count >= 2).map((c) => c.date);
    expect(two).toEqual(["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-12-02"]);
    const one = tl.examCounts.filter((c) => c.count === 1).map((c) => c.date);
    expect(one).toEqual([
      "2026-11-26",
      "2026-11-27",
      "2026-11-30",
      "2026-12-01",
      "2026-12-04",
      "2026-12-07",
      "2026-12-08",
    ]);
    expect(tl.schools.map((s) => s.school)).toEqual(["桜井", "第一"]);
    // 帯の位置は from からの日の番号
    const [sakuraiKimatsu] = tl.schools[0].examLanes.flat().filter((b) => b.exam.name === "桜井2学期期末");
    expect(sakuraiKimatsu).toMatchObject({ startOffset: 49, endOffset: 62, announceOffset: 49, label: "2学期期末（高校部）" });
    expect(sakuraiKimatsu.examOffsets).toEqual([56, 57, 60, 61, 62]);
  });

  it("重なる帯は段を分ける (発表日が学年で違う 1学期期末、同じ日の模試)", () => {
    const tl = buildSchoolTimeline(data, "2026-06-01", "2026-07-31");
    const sakurai = tl.schools.find((s) => s.school === "桜井");
    expect(sakurai.examLanes).toHaveLength(2);
    // 7/11 は 3 年と 1・2 年の模試が同じ日
    const jul11 = sakurai.mockLanes.flat().filter((m) => m.event.startDate === "2026-07-11");
    expect(jul11.map((m) => m.gradeClass).sort()).toEqual(["g12", "g3"]);
    expect(sakurai.mockLanes.length).toBeGreaterThanOrEqual(2);
  });

  it("範囲の外は切り、絞り込みが効く", () => {
    const tl = buildSchoolTimeline(
      { ...data, filter: { ...DEFAULT_SCHOOL_FILTER, mock: false } },
      "2026-11-01",
      "2026-11-30"
    );
    const b = tl.schools.find((s) => s.school === "桜井").examLanes.flat()[0];
    expect(b.endOffset).toBe(29); // 12/2 まで続くが 11/30 で切る
    expect(tl.schools.every((s) => s.mockLanes.length === 0)).toBe(true);
  });
});
