import { describe, expect, it } from "vitest";
import {
  EMPTY_SENIOR_KOSHU,
  addSeniorLessons,
  SENIOR_KOSHU_TEMPLATE,
  alignDatesToTerm,
  applySeniorKoshuImport,
  csvLineToTsv,
  dropLessonsCoveredBySeniorKoshu,
  expandSeniorKoshu,
  formatTermDates,
  indexSeniorKoshuByDate,
  migrateSeniorKoshu,
  parseDateListYmd,
  parseSeniorKoshuImport,
  removePeriod,
  removeTerm,
  sameAsSeniorKoshu,
  seniorKoshuCourse,
  seniorKoshuKind,
  seniorKoshuTeachersFrom,
  toggleLessonSkip,
  updateSeniorLesson,
  upsertPeriod,
  upsertTerm,
} from "./seniorKoshu";

// 高3 Ⅰ期 (12/24〜12/27) 予備校３限 12:25-13:35 の理科基礎: 伊藤は物理基礎 (前半 2 日)
const data = () => ({
  terms: [{ id: 1, name: "高3 Ⅰ期", dates: ["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27"] }],
  periods: [{ id: 1, name: "予備校３限", time: "12:25-13:35" }],
  lessons: [
    { id: 1, teacher: "伊藤", termId: 1, periodId: 1, grade: "高3", course: "共通テスト理科基礎(物理基礎)", skipDates: ["2026-12-26", "2026-12-27"] },
    { id: 2, teacher: "滝澤", termId: 1, periodId: 1, grade: "高3", course: "共通テスト理科基礎(化学基礎)", skipDates: ["2026-12-24", "2026-12-25"] },
  ],
});

describe("高校・予備校の講習 (seniorKoshu)", () => {
  it("担当を日付ごとに広げる (外した日は入れない)。種別は「期 時限」、講座は「学年 講座名」", () => {
    const items = expandSeniorKoshu(data());
    expect(items.map((x) => [x.teacher, x.date])).toEqual([
      ["伊藤", "2026-12-24"],
      ["伊藤", "2026-12-25"],
      ["滝澤", "2026-12-26"],
      ["滝澤", "2026-12-27"],
    ]);
    expect(seniorKoshuKind(items[0])).toBe("高3 Ⅰ期 予備校３限");
    expect(seniorKoshuCourse(items[0])).toBe("高3 共通テスト理科基礎(物理基礎)");
    expect([...indexSeniorKoshuByDate(items, "滝澤").keys()]).toEqual(["2026-12-26", "2026-12-27"]);
    expect([...seniorKoshuTeachersFrom(items, "2026-12-26")]).toEqual(["滝澤"]);
  });

  it("読込: 崩れた期・時限・担当を落とし、RTDB が消した空の配列を補う", () => {
    expect(migrateSeniorKoshu(undefined)).toEqual(EMPTY_SENIOR_KOSHU);
    const m = migrateSeniorKoshu({
      terms: [{ id: 1, name: " 高3 Ⅰ期 ", dates: ["2026-12-25", "2026-12-24", "x", "2026-12-24"] }, { id: 1, name: "重複" }, { id: 2, name: "" }],
      periods: [{ id: 1, name: "予備校３限", time: "１２：２５〜１３：３５" }, { id: 2, name: "壊れ", time: "あさ" }],
      lessons: [
        { id: 1, teacher: "伊藤", termId: 1, periodId: 1, course: "英語", skipDates: ["2026-12-30"] },
        { id: 2, teacher: "伊藤", termId: 9, periodId: 1, course: "英語" },
      ],
    });
    expect(m.terms).toEqual([{ id: 1, name: "高3 Ⅰ期", dates: ["2026-12-24", "2026-12-25"] }]);
    expect(m.periods).toEqual([{ id: 1, name: "予備校３限", time: "12:25-13:35" }, { id: 2, name: "壊れ", time: "" }]);
    expect(m.lessons).toEqual([{ id: 1, teacher: "伊藤", termId: 1, periodId: 1, course: "英語" }]);
  });

  it("期・時限を作る・直す (名前は重ねない)。期の日を減らすと外した日も追従。消すと担当も消える", () => {
    let d = data();
    expect(upsertTerm(d, { name: "高3Ⅰ期", dates: [] }).error).toContain("もうあります");
    const r = upsertTerm(d, { id: 1, name: "高3 Ⅰ期", dates: ["2026-12-24", "2026-12-25", "2026-12-26"] });
    d = r.data;
    expect(d.lessons[0].skipDates).toEqual(["2026-12-26"]);
    expect(d.lessons[1].skipDates).toEqual(["2026-12-24", "2026-12-25"]);
    expect(upsertPeriod(d, { name: "予備校１限", time: "9:00〜10:10" }).data.periods[1]).toEqual({ id: 2, name: "予備校１限", time: "09:00-10:10" });
    expect(upsertPeriod(d, { name: "予備校１限", time: "あさ" }).error).toBeTruthy();
    expect(removeTerm(d, 1).lessons).toEqual([]);
    expect(removePeriod(d, 1).lessons).toEqual([]);
  });

  it("担当を足す (同じ講師 × 期 × 時限 × 学年 × 講座名は飛ばす)・直す・外す日を切り替える", () => {
    let d = data();
    const r = addSeniorLessons(d, [
      { teacher: "伊藤", termId: 1, periodId: 1, grade: "高3", course: "共通テスト理科基礎(物理基礎)" },
      { teacher: "本澤", termId: 1, periodId: 1, grade: "高3", course: "共通テスト英語" },
    ]);
    expect(r.skipped).toBe(1);
    expect(r.added.map((l) => [l.id, l.teacher])).toEqual([[3, "本澤"]]);
    d = updateSeniorLesson(r.data, 3, { course: " 英語R ", grade: "" });
    expect(d.lessons[2]).toEqual({ id: 3, teacher: "本澤", termId: 1, periodId: 1, course: "英語R" });
    d = toggleLessonSkip(d, 3, "2026-12-24");
    expect(d.lessons[2].skipDates).toEqual(["2026-12-24"]);
    d = toggleLessonSkip(d, 3, "2026-12-24");
    expect("skipDates" in d.lessons[2]).toBe(false);
  });

  it("日付の並び: 期間 (日曜を除く)・並び・月を省いた日・年度から年を補う", () => {
    expect(parseDateListYmd("12/24〜12/28", 2026).dates).toEqual(["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-28"]);
    expect(parseDateListYmd("12/24・25、1/4", 2026).dates).toEqual(["2026-12-24", "2026-12-25", "2027-01-04"]);
    expect(parseDateListYmd("2/8", 2026).dates).toEqual(["2027-02-08"]);
    expect(parseDateListYmd("12/27(日)", 2026).dates).toEqual(["2026-12-27"]);
    expect(parseDateListYmd("あした・12/40", 2026).unknown).toEqual(["あした", "12/40"]);
    expect(formatTermDates(["2026-12-24", "2026-12-25", "2026-12-26"])).toBe("12/24(木)〜12/26(土) 3日");
    expect(formatTermDates(["2026-12-24", "2026-12-26"])).toBe("12/24(木)・12/26(土) 2日");
  });

  it("講習時間割作成の他学年セッションと同じ予定か (講師・日・時刻)", () => {
    const item = expandSeniorKoshu(data())[0];
    expect(sameAsSeniorKoshu(item, { teacher: "伊藤", date: "2026-12-24", time: "12:25-13:35" })).toBe(true);
    // 終わりが片方に無ければ開始だけで比べる (手で入れた「12:25」も同じ予定)
    expect(sameAsSeniorKoshu(item, { teacher: "伊藤", date: "2026-12-24", time: "12:25" })).toBe(true);
    expect(sameAsSeniorKoshu(item, { teacher: "伊藤", date: "2026-12-24", time: "12:25-13:00" })).toBe(false);
    expect(sameAsSeniorKoshu(item, { teacher: "伊藤", date: "2026-12-24", time: "09:00" })).toBe(false);
  });
});

describe("校正 (2026-10-28)", () => {
  it("春期の 3 月 → 4 月は続けて読む (年を書いていない日付が前より前なら次の年)", () => {
    expect(parseDateListYmd("3/26〜4/3", 2026).dates).toEqual([
      "2027-03-26", "2027-03-27", "2027-03-29", "2027-03-30", "2027-03-31", "2027-04-01", "2027-04-02", "2027-04-03",
    ]);
    expect(parseDateListYmd("3/30・3/31・4/1・4/2", 2026).dates).toEqual(["2027-03-30", "2027-03-31", "2027-04-01", "2027-04-02"]);
    // 曜日の前に空白があっても読む
    expect(parseDateListYmd("12/24 (木)・12/25 (金)", 2026)).toEqual({ dates: ["2026-12-24", "2026-12-25"], unknown: [] });
  });

  it("見出しは完全に一致するものを先に当てる (「担当しない日」を講師の列にしない)", () => {
    const text = [
      "講師\t期\t時限\t講座名\t担当しない日\t期の日\t時刻",
      "伊藤\t高3 Ⅰ期\t3限\t理科基礎\t12/26\t12/24〜12/26\t12:25-13:35",
    ].join("\n");
    const parsed = parseSeniorKoshuImport(text, { data: EMPTY_SENIOR_KOSHU, fiscalYear: 2026 });
    expect(parsed.errors).toEqual([]);
    expect(parsed.drafts.map((d) => [d.teacher, d.skipDates])).toEqual([["伊藤", ["2026-12-26"]]]);
  });

  it("読めなかった行で期・時限を作らない。見本はそのまま登録できる", () => {
    const bad = [
      "講師\t期\t時限\t講座名\t外す日\t日付\t時刻",
      "伊藤\t高3 Ⅰ期\t3限\t理科基礎\t1/5\t12/24〜12/26\t12:25-13:35",
    ].join("\n");
    const parsed = parseSeniorKoshuImport(bad, { data: EMPTY_SENIOR_KOSHU, fiscalYear: 2026 });
    expect(parsed.errors).toHaveLength(1);
    expect([parsed.newTerms, parsed.newPeriods]).toEqual([[], []]);
    const sample = parseSeniorKoshuImport(SENIOR_KOSHU_TEMPLATE, { data: EMPTY_SENIOR_KOSHU, fiscalYear: 2026 });
    expect(sample.errors).toEqual([]);
    expect(sample.drafts.map((d) => d.teacher)).toEqual(["伊藤", "藤本", "本澤"]);
  });

  it("CSV の引用符の中のカンマは区切りにしない", () => {
    expect(csvLineToTsv('"藤本,本澤",Ⅰ期,"a ""b""",x')).toBe('藤本,本澤\tⅠ期\ta "b"\tx');
    const csv = ["講師,期,時限,講座名,日付,時刻", '"藤本,本澤",Ⅰ期,1限,英語,12/24〜12/26,9:00-10:10'].join("\n");
    const parsed = parseSeniorKoshuImport(csv, { data: EMPTY_SENIOR_KOSHU, fiscalYear: 2026 });
    expect(parsed.errors).toEqual([]);
    expect(parsed.drafts.map((d) => d.teacher)).toEqual(["藤本", "本澤"]);
  });

  it("外す日は期の日の年にそろえる (春期の 4/1)", () => {
    expect(alignDatesToTerm(["2026-04-01"], ["2027-03-31", "2027-04-01"])).toEqual(["2027-04-01"]);
  });

  it("消した id を使い回さない (idFloor)", () => {
    const d = { terms: [{ id: 1, name: "Ⅰ期", dates: ["2026-12-24"] }], periods: [{ id: 1, name: "1限", time: "09:00-10:10" }], lessons: [] };
    const r = addSeniorLessons(d, [{ teacher: "伊藤", termId: 1, periodId: 1, course: "英語" }], { idFloor: 5 });
    expect(r.added.map((l) => l.id)).toEqual([6]);
  });
});

describe("表でまとめて登録", () => {
  it("期・時限は名前で合わせ、無ければ日付・時刻の列から作る。講師は何人でも", () => {
    const text = [
      "講師\t期\t時限\t学年\t講座名\t外す日\t日付\t時刻",
      "伊藤\t高3 Ⅳ期\t予備校３限\t高3\t理科基礎(物理基礎)\t2/9\t2/8〜2/10\t12:25-13:35",
      "藤本・本澤\t高3 Ⅳ期\t予備校１限\t高3\t英語\t\t\t9:00-10:10",
      "伊藤\t高3 Ⅰ期\t予備校３限\t高3\t共通テスト理科基礎(物理基礎)\t\t\t",
    ].join("\n");
    const parsed = parseSeniorKoshuImport(text, { data: data(), fiscalYear: 2026 });
    expect(parsed.errors).toEqual([]);
    expect(parsed.newTerms).toEqual([{ name: "高3 Ⅳ期", dates: ["2027-02-08", "2027-02-09", "2027-02-10"] }]);
    expect(parsed.newPeriods).toEqual([{ name: "予備校１限", time: "09:00-10:10" }]);
    const r = applySeniorKoshuImport(data(), parsed);
    // 伊藤の Ⅰ期 は登録済み (飛ばす)
    expect(r.skipped).toBe(1);
    expect(r.added.map((l) => [l.teacher, l.termId, l.periodId, l.skipDates])).toEqual([
      ["伊藤", 2, 1, ["2027-02-09"]],
      ["藤本", 2, 2, undefined],
      ["本澤", 2, 2, undefined],
    ]);
  });

  it("読めない行は理由つき (無い期・無い時限・期に無い外す日・時刻の違う時限)。CSV も読む", () => {
    const text = [
      "講師,期,時限,講座名,外す日,時刻",
      "伊藤,高3 Ⅹ期,予備校３限,英語,,",
      "伊藤,高3 Ⅰ期,予備校９限,英語,,",
      "伊藤,高3 Ⅰ期,予備校３限,英語,1/5,",
      "伊藤,高3 Ⅰ期,予備校３限,英語,,9:00-10:00",
      ",高3 Ⅰ期,予備校３限,英語,,",
    ].join("\n");
    const parsed = parseSeniorKoshuImport(text, { data: data(), fiscalYear: 2026 });
    expect(parsed.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
    expect(parsed.errors[0].message).toContain("期「高3 Ⅹ期」がありません");
    expect(parsed.errors[2].message).toContain("期「高3 Ⅰ期」の日ではありません");
    expect(parsed.errors[3].message).toContain("時刻が違います");
  });

  it("月間: 講習時間割作成に手で入れた同じ講師・日・時刻の「外」は出さない (本体の「講」と二重になる)", () => {
    const items = expandSeniorKoshu(data());
    const lessons = [
      { kind: "external", key: "ext:1", teacher: "伊藤", date: "2026-12-24", time: "12:25-13:35" },
      { kind: "external", key: "ext:2", teacher: "伊藤", date: "2026-12-24", time: "09:00-10:10" },
      { kind: "external", key: "ext:3", teacher: "伊藤", date: "2026-12-26", time: "12:25-13:35" },
      { kind: "koshu", key: "k", teacher: "伊藤", date: "2026-12-24", time: "12:25-13:35" },
    ];
    expect(dropLessonsCoveredBySeniorKoshu(lessons, items).map((l) => l.key)).toEqual(["ext:2", "ext:3", "k"]);
    expect(dropLessonsCoveredBySeniorKoshu(lessons, [])).toBe(lessons);
  });
});
