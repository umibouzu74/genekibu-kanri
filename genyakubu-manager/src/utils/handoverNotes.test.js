import { describe, expect, it } from "vitest";
import {
  addHandoverNote,
  filterNotes,
  splitPinned,
  updateHandoverNote,
  validateHandoverDraft,
  fmtNoteDate,
  fmtOffset,
  groupByMonthOfYear,
  groupByYearMonth,
  migrateHandoverNotes,
  normalizeHandoverNote,
  notesToMarkdown,
  schoolMonthIndex,
  seasonalNotes,
  sortNotesDesc,
} from "./handoverNotes";

const note = (id, date, title, extra = {}) => ({ id, date, title, category: "事務", ...extra });

describe("normalizeHandoverNote / migrateHandoverNotes", () => {
  it("空の任意項目と undefined を落とし、必須が欠けたものは捨てる", () => {
    expect(
      normalizeHandoverNote({
        id: 1,
        date: "2026-10-01",
        title: " 事務よりズバリ的中の提出催促 ",
        category: "事務",
        body: "9月の会議で告知済み",
        advice: "  ",
        annual: false,
        createdAt: undefined,
      })
    ).toEqual({
      id: 1,
      date: "2026-10-01",
      title: "事務よりズバリ的中の提出催促",
      category: "事務",
      body: "9月の会議で告知済み",
    });
    expect(normalizeHandoverNote({ id: 1, date: "2026-02-31", title: "x" })).toBeNull();
    expect(normalizeHandoverNote({ id: 1, date: "2026-10-01", title: " " })).toBeNull();
    expect(normalizeHandoverNote({ date: "2026-10-01", title: "x" })).toBeNull();
  });

  it("分類が無ければ「その他」、毎年は true のときだけ持つ", () => {
    expect(normalizeHandoverNote({ id: 2, date: "2026-10-01", title: "x", annual: true })).toEqual({
      id: 2,
      date: "2026-10-01",
      title: "x",
      category: "その他",
      annual: true,
    });
  });

  it("配列でない値は空、RTDB のオブジェクト形は配列に直す、id 重複は先勝ち", () => {
    expect(migrateHandoverNotes(null)).toEqual([]);
    expect(migrateHandoverNotes({ 0: note(1, "2026-10-01", "a"), 2: note(2, "2026-10-02", "b") })).toHaveLength(2);
    const out = migrateHandoverNotes([note(1, "2026-10-01", "a"), note(1, "2026-10-02", "b")]);
    expect(out.map((n) => n.title)).toEqual(["a"]);
    // 冪等
    expect(migrateHandoverNotes(out)).toEqual(out);
  });
});

describe("並べ方", () => {
  const notes = [
    note(1, "2025-10-03", "去年の催促"),
    note(2, "2026-10-01", "ズバリ的中の提出催促"),
    note(3, "2026-04-10", "春期講習の振り返り"),
    note(4, "2026-03-20", "年度末の鍵の返却"),
    note(5, "2026-10-01", "同じ日の 2 件目"),
  ];

  it("時系列は新しい日付が先、同じ日は後から書いた方が先", () => {
    expect(sortNotesDesc(notes).map((n) => n.id)).toEqual([5, 2, 3, 4, 1]);
    expect(groupByYearMonth(notes).map((g) => g.label)).toEqual([
      "2026年10月",
      "2026年4月",
      "2026年3月",
      "2025年10月",
    ]);
  });

  it("月別は 4 月始まりで、年をまたいで同じ月をまとめる", () => {
    expect(schoolMonthIndex(4)).toBe(0);
    expect(schoolMonthIndex(3)).toBe(11);
    const groups = groupByMonthOfYear(notes);
    expect(groups.map((g) => g.label)).toEqual(["4月", "10月", "3月"]);
    // 10 月の中は月日順 (10/1 → 10/3)、同じ月日は新しい年 → 後から書いた方
    expect(groups[1].notes.map((n) => n.id)).toEqual([5, 2, 1]);
  });
});

describe("filterNotes", () => {
  const notes = [
    note(1, "2026-10-01", "事務よりズバリ的中の提出催促", { body: "9月の会議で告知済み" }),
    note(2, "2026-07-20", "夏期講習の教室割", { category: "行事・講習" }),
  ];

  it("空白区切りの AND で、見出し・詳細・日付の打ち方 (10/1, 10月) を探す", () => {
    expect(filterNotes(notes, { query: "ズバリ 会議" }).map((n) => n.id)).toEqual([1]);
    expect(filterNotes(notes, { query: "10/1" }).map((n) => n.id)).toEqual([1]);
    expect(filterNotes(notes, { query: "7月" }).map((n) => n.id)).toEqual([2]);
    // 全角・半角を区別しない
    expect(filterNotes(notes, { query: "ｽﾞﾊﾞﾘ" }).map((n) => n.id)).toEqual([1]);
    expect(filterNotes(notes, { query: "９月" }).map((n) => n.id)).toEqual([1]);
  });

  it("分類で絞る", () => {
    expect(filterNotes(notes, { category: "行事・講習" }).map((n) => n.id)).toEqual([2]);
  });
});

describe("seasonalNotes", () => {
  const notes = [
    note(1, "2025-10-03", "去年の 10/3"),
    note(2, "2025-09-20", "去年の 9/20 (11 日前)"),
    note(3, "2024-10-30", "一昨年の 10/30"),
    note(4, "2025-12-25", "去年の 12/25 (遠い)"),
    note(5, "2026-09-28", "今年の 9/28 (書いたばかり)"),
    note(6, "2025-09-26", "去年の 9/26 (5 日前)"),
  ];

  it("去年以前のメモを今年の前後に当てはめ、1 週間前〜1 か月先を近い順に返す", () => {
    const out = seasonalNotes(notes, "2026-10-01");
    expect(out.map((x) => [x.note.id, x.offset, x.on])).toEqual([
      [6, -5, "2026-09-26"],
      [1, 2, "2026-10-03"],
      [3, 29, "2026-10-30"],
    ]);
  });

  it("年末年始をまたぐ (12/28 に去年の 1/10 が 13 日後として出る)", () => {
    const out = seasonalNotes([note(1, "2025-01-10", "x")], "2025-12-28");
    expect(out.map((x) => [x.offset, x.on])).toEqual([[13, "2026-01-10"]]);
  });

  it("2/29 は平年なら 2/28 に当てはめる", () => {
    const out = seasonalNotes([note(1, "2024-02-29", "閏日")], "2025-02-20");
    expect(out[0].on).toBe("2025-02-28");
  });
});

describe("表示用", () => {
  it("日付と相対日数", () => {
    expect(fmtNoteDate("2026-10-01")).toBe("2026/10/1 (木)");
    expect(fmtOffset(0)).toBe("今日");
    expect(fmtOffset(3)).toBe("3 日後");
    expect(fmtOffset(-2)).toBe("2 日前");
  });

  it("Markdown は月別 (年度の流れ) で、詳細と次の担当者へを入れる", () => {
    const md = notesToMarkdown(
      [
        note(1, "2026-10-01", "事務よりズバリ的中の提出催促", {
          body: "9月の会議で告知済み",
          advice: "会議の後に念押し",
          annual: true,
        }),
        note(2, "2026-04-05", "新年度の名簿"),
      ],
      { generatedOn: "2026-10-01" }
    );
    expect(md).toBe(
      [
        "# 引継ぎメモ",
        "",
        "出力日: 2026/10/1 (木)",
        "",
        "## 4月",
        "",
        "- **2026/4/5 (日)** [事務] 新年度の名簿",
        "",
        "## 10月",
        "",
        "- **2026/10/1 (木)** [事務・毎年] 事務よりズバリ的中の提出催促",
        "  9月の会議で告知済み",
        "  - 次の担当者へ: 会議の後に念押し",
        "",
      ].join("\n")
    );
  });
});

describe("作成・更新・固定 (いつでも必要なこと)", () => {
  it("追加は最大 id + 1、作成日時を入れる。更新は id と作成日時を保つ", () => {
    const base = [note(4, "2026-09-01", "a", { createdAt: "2026-09-01T00:00:00.000Z" })];
    const added = addHandoverNote(
      base,
      { date: "2026-10-01", category: "事務", title: "b", body: "", advice: "", annual: false, pinned: true },
      "2026-10-01T09:00:00.000Z"
    );
    expect(added[1]).toEqual({
      id: 5,
      date: "2026-10-01",
      category: "事務",
      title: "b",
      pinned: true,
      createdAt: "2026-10-01T09:00:00.000Z",
      updatedAt: "2026-10-01T09:00:00.000Z",
    });
    const updated = updateHandoverNote(
      added,
      4,
      { date: "2026-09-02", category: "講師", title: "a2", body: "x", advice: "", annual: true, pinned: false },
      "2026-10-02T00:00:00.000Z"
    );
    expect(updated[0]).toEqual({
      id: 4,
      date: "2026-09-02",
      category: "講師",
      title: "a2",
      body: "x",
      annual: true,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    });
  });

  it("保存できない理由", () => {
    expect(validateHandoverDraft({ date: "", title: "x" })).toMatch(/日付/);
    expect(validateHandoverDraft({ date: "2026-10-01", title: " " })).toMatch(/1 行/);
    expect(validateHandoverDraft({ date: "2026-10-01", title: "x" })).toBeNull();
  });

  it("固定メモは分類順 → 見出し順で分け、この時期には出さない", () => {
    const notes = [
      note(1, "2025-10-03", "日付のあるメモ"),
      note(2, "2025-10-03", "鍵の置き場所", { pinned: true, category: "設備・システム" }),
      note(3, "2025-10-03", "事務の連絡先", { pinned: true, category: "事務" }),
    ];
    const { pinned, dated } = splitPinned(notes);
    expect(pinned.map((n) => n.id)).toEqual([3, 2]);
    expect(dated.map((n) => n.id)).toEqual([1]);
    expect(seasonalNotes(notes, "2026-10-01").map((x) => x.note.id)).toEqual([1]);
    const md = notesToMarkdown(notes);
    expect(md.indexOf("## いつでも必要なこと")).toBeLessThan(md.indexOf("## 10月"));
    expect(md).toContain("- [事務] 事務の連絡先");
  });
});
