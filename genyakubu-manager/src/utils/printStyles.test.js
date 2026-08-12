import { describe, it, expect } from "vitest";
import {
  buildAllDaysBodyHtml,
  buildAllDaysDocTitle,
  buildBatchDocTitle,
  buildBatchMonthOptions,
  buildBatchPrintBodyHtml,
  buildMonthHeaderHtml,
  buildMonthLabel,
  buildPageRule,
  buildPrintStyles,
  buildTimetableHeaderHtml,
  describeMonthVisibility,
  formatPrintDate,
  groupStaffBySubject,
  injectTimetableHeaders,
} from "./printStyles";

describe("formatPrintDate", () => {
  it("ISO 日付を和式 (YYYY年MM月DD日（曜）) に整形する", () => {
    expect(formatPrintDate("2026-07-03", "金")).toBe("2026年07月03日（金）");
  });

  it("曜日なしなら日付のみ", () => {
    expect(formatPrintDate("2026-07-03")).toBe("2026年07月03日");
  });

  it("ISO 形式でない入力・空はそのまま返す (安全側)", () => {
    expect(formatPrintDate("7/3", "金")).toBe("7/3");
    expect(formatPrintDate("")).toBe("");
    expect(formatPrintDate(undefined)).toBe("");
  });
});

describe("describeMonthVisibility", () => {
  it("デフォルト (両方 false・タグ除外なし) は空文字", () => {
    expect(describeMonthVisibility({ exam: false, special: false })).toBe("");
    expect(describeMonthVisibility(undefined)).toBe("");
    expect(describeMonthVisibility({})).toBe("");
  });

  it("テスト期間のみ ON", () => {
    expect(describeMonthVisibility({ exam: true })).toBe("表示: テスト期間");
  });

  it("特別イベントのみ ON", () => {
    expect(describeMonthVisibility({ special: true })).toBe(
      "表示: 特別イベント"
    );
  });

  it("両方 ON は中黒で連結", () => {
    expect(describeMonthVisibility({ exam: true, special: true })).toBe(
      "表示: テスト期間・特別イベント"
    );
  });

  it("除外タグのみ", () => {
    expect(
      describeMonthVisibility({ tagFilters: { 中3: false, 高1: true } })
    ).toBe("除外タグ: 中3");
  });

  it("旧キー examTagFilters もフォールバックで読む", () => {
    expect(
      describeMonthVisibility({ examTagFilters: { 中3: false } })
    ).toBe("除外タグ: 中3");
  });

  it("表示と除外タグの両方が設定されているとスラッシュで連結", () => {
    expect(
      describeMonthVisibility({
        exam: true,
        tagFilters: { 中3: false, 中2: false },
      })
    ).toBe("表示: テスト期間 / 除外タグ: 中3, 中2");
  });
});

describe("buildMonthLabel", () => {
  it("講師名 + 年月で組み立てる", () => {
    expect(buildMonthLabel({ teacher: "山田", year: 2026, month: 5 })).toBe(
      "山田　2026年05月 月次予定"
    );
  });

  it("月は 2 桁にパディングする", () => {
    expect(buildMonthLabel({ teacher: "山田", year: 2026, month: 12 })).toBe(
      "山田　2026年12月 月次予定"
    );
  });

  it("講師未選択でも null/undefined を文字列化しない", () => {
    expect(buildMonthLabel({ teacher: null, year: 2026, month: 5 })).toBe(
      "2026年05月 月次予定"
    );
    expect(
      buildMonthLabel({ teacher: undefined, year: 2026, month: 5 })
    ).toBe("2026年05月 月次予定");
  });
});

describe("buildPageRule", () => {
  it("月次カレンダーは横向き", () => {
    expect(buildPageRule({ hasMonthView: true })).toBe(
      "@page{size:A4 landscape;margin:8mm}"
    );
  });

  it("それ以外は縦向き", () => {
    expect(buildPageRule({ hasMonthView: false })).toBe(
      "@page{size:A4 portrait;margin:12mm 8mm}"
    );
  });
});

describe("buildPrintStyles", () => {
  it("デフォルトでは縦 A4・月次/タイムテーブル CSS を含まない", () => {
    const css = buildPrintStyles({
      hasTimetableGrid: false,
      hasMonthView: false,
    });
    expect(css).toContain("@page{size:A4 portrait;margin:12mm 8mm}");
    expect(css).not.toContain("landscape");
    expect(css).not.toContain(".month-print-grid");
    expect(css).not.toContain(".excel-print-col-ms");
  });

  it("月次有効時は横 A4 に切替・月次専用ルールを含む", () => {
    const css = buildPrintStyles({
      hasTimetableGrid: false,
      hasMonthView: true,
    });
    expect(css).toContain("@page{size:A4 landscape;margin:8mm}");
    expect(css).not.toContain("portrait");
    expect(css).toContain(".month-print-grid");
    expect(css).toContain(".month-print-cell");
    expect(css).toContain("break-inside:avoid");
    expect(css).toContain(".month-print-page-title");
  });

  it("タイムテーブル有効時は縦 A4 で MS/HS の改ページ規則を含む", () => {
    const css = buildPrintStyles({
      hasTimetableGrid: true,
      hasMonthView: false,
    });
    expect(css).toContain("portrait");
    expect(css).toContain(
      ".excel-print-col-ms{break-after:page;page-break-after:always}"
    );
  });

  it("常に共通の no-print 隠し規則と print-color-adjust を含む", () => {
    const css = buildPrintStyles({
      hasTimetableGrid: false,
      hasMonthView: false,
    });
    expect(css).toContain(".no-print{display:none !important}");
    expect(css).toContain("print-color-adjust:exact");
  });
});

describe("buildMonthHeaderHtml", () => {
  // 決定的にするため固定日時を渡す。
  const fixedNow = new Date(2026, 4, 5); // 2026-05-05

  it("講師名 + 年月でタイトルを組む", () => {
    const html = buildMonthHeaderHtml({
      teacher: "山田",
      year: 2026,
      month: 5,
      visibility: {},
      now: fixedNow,
    });
    expect(html).toContain("山田　2026年05月 月次予定");
  });

  it("講師未選択ではタイトル先頭に名前を出さない", () => {
    const html = buildMonthHeaderHtml({
      teacher: null,
      year: 2026,
      month: 12,
      visibility: {},
      now: fixedNow,
    });
    expect(html).toContain("2026年12月 月次予定");
    expect(html).not.toMatch(/null/);
  });

  it("印刷日を YYYY年MM月DD日 形式で含む", () => {
    const html = buildMonthHeaderHtml({
      teacher: "山田",
      year: 2026,
      month: 5,
      visibility: {},
      now: fixedNow,
    });
    expect(html).toContain("2026年05月05日 印刷");
  });

  it("デフォルト visibility ではフィルタ説明 (表示/除外タグ) を出さない", () => {
    const html = buildMonthHeaderHtml({
      teacher: "山田",
      year: 2026,
      month: 5,
      visibility: { exam: false, special: false },
      now: fixedNow,
    });
    expect(html).not.toContain("表示:");
    expect(html).not.toContain("除外タグ");
  });

  it("非デフォルト visibility ではフィルタ行を含む", () => {
    const html = buildMonthHeaderHtml({
      teacher: "山田",
      year: 2026,
      month: 5,
      visibility: { exam: true, tagFilters: { 中3: false } },
      now: fixedNow,
    });
    expect(html).toContain("表示: テスト期間");
    expect(html).toContain("除外タグ: 中3");
  });

  it("講師名が HTML 特殊文字を含むとエスケープされる (XSS 防止)", () => {
    const html = buildMonthHeaderHtml({
      teacher: "<script>alert(1)</script>",
      year: 2026,
      month: 5,
      visibility: {},
      now: fixedNow,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("バッジ凡例 (代/合/振/移/特訓/追/講/外) を含む", () => {
    const html = buildMonthHeaderHtml({
      teacher: "山田",
      year: 2026,
      month: 5,
      visibility: {},
      now: fixedNow,
    });
    expect(html).toContain("代</b>代行");
    expect(html).toContain("合</b>合同");
    expect(html).toContain("振</b>振替");
    expect(html).toContain("移</b>時間変更");
    expect(html).toContain("特訓</b>テスト直前特訓");
    expect(html).toContain("追</b>追加授業");
    expect(html).toContain("講</b>講習");
    expect(html).toContain("外</b>講習期間の外部授業");
  });
});

describe("groupStaffBySubject", () => {
  const subjects = [
    { id: 1, name: "英語" },
    { id: 2, name: "数学" },
    { id: 3, name: "国語" },
  ];

  it("subjectIds に従って各教科グループに登録 (重複担当も両方に出す)", () => {
    const result = groupStaffBySubject({
      partTimeStaff: [
        { name: "山田", subjectIds: [1, 2] },
        { name: "佐藤", subjectIds: [2] },
        { name: "鈴木", subjectIds: [1] },
      ],
      subjects,
    });
    const map = Object.fromEntries(
      result.map((g) => [g.subjectName, g.staff])
    );
    expect(map["英語"]).toEqual(["山田", "鈴木"].sort((a, b) => a.localeCompare(b, "ja")));
    expect(map["数学"]).toEqual(["山田", "佐藤"].sort((a, b) => a.localeCompare(b, "ja")));
    expect(map["国語"]).toBeUndefined(); // 該当者ゼロのグループは省く
  });

  it("subjectIds 未指定または空配列は 未分類 グループに入る", () => {
    const result = groupStaffBySubject({
      partTimeStaff: [
        { name: "山田", subjectIds: [] },
        { name: "佐藤" },
      ],
      subjects,
    });
    const unassigned = result.find((g) => g.subjectName === "未分類");
    expect(unassigned).toBeDefined();
    expect(unassigned.staff).toEqual(["佐藤", "山田"]);
  });

  it("存在しない subjectId のみを持つ staff も 未分類 に逃がす", () => {
    const result = groupStaffBySubject({
      partTimeStaff: [{ name: "山田", subjectIds: [999] }],
      subjects,
    });
    expect(result).toEqual([{ subjectName: "未分類", staff: ["山田"] }]);
  });

  it("グループ間の順序は subjects の登場順 + 末尾に 未分類", () => {
    const result = groupStaffBySubject({
      partTimeStaff: [
        { name: "A", subjectIds: [3] },
        { name: "B", subjectIds: [1] },
        { name: "C", subjectIds: [] },
      ],
      subjects,
    });
    expect(result.map((g) => g.subjectName)).toEqual(["英語", "国語", "未分類"]);
  });

  it("グループ内 staff は五十音順", () => {
    const result = groupStaffBySubject({
      partTimeStaff: [
        { name: "山田", subjectIds: [1] },
        { name: "佐藤", subjectIds: [1] },
        { name: "あいうえお", subjectIds: [1] },
      ],
      subjects,
    });
    expect(result[0].staff).toEqual(["あいうえお", "佐藤", "山田"]);
  });

  it("空入力は空配列を返す", () => {
    expect(groupStaffBySubject({})).toEqual([]);
    expect(groupStaffBySubject({ partTimeStaff: [], subjects: [] })).toEqual(
      []
    );
  });

  it("subjects に 未分類 という教科があっても フォールバックの未分類グループと衝突しない", () => {
    const result = groupStaffBySubject({
      partTimeStaff: [
        { name: "A", subjectIds: [99] }, // subjects に存在する 未分類 教科
        { name: "B", subjectIds: [] }, // subjectIds 空 → 末尾の未分類グループへ
      ],
      subjects: [{ id: 99, name: "未分類" }],
    });
    // 両方とも subjectName は "未分類" だが、A は教科として、B はフォールバック先
    // にそれぞれ独立して入る。staff が消えないことを担保する。
    const allStaff = result.flatMap((g) => g.staff);
    expect(allStaff.sort()).toEqual(["A", "B"]);
  });
});

describe("buildBatchMonthOptions", () => {
  it("基準月の前 1 か月〜後 4 か月を昇順で列挙する (既定)", () => {
    const opts = buildBatchMonthOptions({ year: 2026, month: 7 });
    expect(opts.map((o) => o.key)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(opts[1]).toEqual({
      year: 2026,
      month: 7,
      key: "2026-07",
      label: "2026年7月",
    });
  });

  it("年跨ぎ (12 月基準) は翌年へ正しく繰り上がる", () => {
    const opts = buildBatchMonthOptions({ year: 2026, month: 12 });
    expect(opts.map((o) => o.key)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
    ]);
    expect(opts[2].label).toBe("2027年1月");
  });

  it("1 月基準では前月が前年 12 月になる", () => {
    const opts = buildBatchMonthOptions({ year: 2027, month: 1 });
    expect(opts[0]).toMatchObject({ year: 2026, month: 12, key: "2026-12" });
  });

  it("before/after を指定して窓を変えられる", () => {
    const opts = buildBatchMonthOptions({
      year: 2026,
      month: 7,
      before: 0,
      after: 1,
    });
    expect(opts.map((o) => o.key)).toEqual(["2026-07", "2026-08"]);
  });

  it("year/month が数値でなければ空配列 (安全側)", () => {
    expect(buildBatchMonthOptions({ year: undefined, month: 7 })).toEqual([]);
    expect(buildBatchMonthOptions({ year: 2026, month: NaN })).toEqual([]);
  });
});

describe("buildBatchDocTitle", () => {
  it("複数月は 2 桁パディングして中黒で連結する", () => {
    expect(
      buildBatchDocTitle({
        nameCount: 3,
        months: [
          { year: 2026, month: 7 },
          { year: 2026, month: 8 },
        ],
      })
    ).toBe("月次予定 一括印刷 (3名・2026年07月・2026年08月)");
  });

  it("単月は従来どおりの形式", () => {
    expect(
      buildBatchDocTitle({ nameCount: 5, months: [{ year: 2026, month: 7 }] })
    ).toBe("月次予定 一括印刷 (5名・2026年07月)");
  });
});

describe("buildBatchPrintBodyHtml", () => {
  it("各 slide を batch-print-page で包んで連結する", () => {
    const html = buildBatchPrintBodyHtml({
      slides: [
        { headerHtml: "<h2>A</h2>", monthRootHtml: "<div>cal-A</div>" },
        { headerHtml: "<h2>B</h2>", monthRootHtml: "<div>cal-B</div>" },
      ],
    });
    expect(html).toBe(
      `<section class="batch-print-page"><h2>A</h2><div>cal-A</div></section>` +
        `<section class="batch-print-page"><h2>B</h2><div>cal-B</div></section>`
    );
  });

  it("空 slides では空文字を返す", () => {
    expect(buildBatchPrintBodyHtml({ slides: [] })).toBe("");
    expect(buildBatchPrintBodyHtml({})).toBe("");
  });

  it("欠損プロパティは空文字でフォールバック", () => {
    const html = buildBatchPrintBodyHtml({
      slides: [{ headerHtml: "<h2>only</h2>" }, { monthRootHtml: "<div>cal</div>" }],
    });
    expect(html).toContain("<h2>only</h2></section>");
    expect(html).toContain("<section class=\"batch-print-page\"><div>cal</div></section>");
  });
});

describe("buildPrintStyles (batch print rules)", () => {
  it("月次有効時は .batch-print-page の改ページルールを含む", () => {
    const css = buildPrintStyles({
      hasTimetableGrid: false,
      hasMonthView: true,
    });
    expect(css).toContain(".batch-print-page");
    expect(css).toContain("page-break-after:always");
    expect(css).toContain(".batch-print-page:last-child");
  });

  it("タイムテーブル有効時は .excel-print-meta のスタイルを含む", () => {
    const css = buildPrintStyles({
      hasTimetableGrid: true,
      hasMonthView: false,
    });
    expect(css).toContain(".excel-print-meta");
  });
});

describe("buildTimetableHeaderHtml", () => {
  const fixedNow = new Date(2026, 4, 6); // 2026-05-06

  it("中学セクションのタイトルと日付・印刷日を含む", () => {
    const html = buildTimetableHeaderHtml({
      section: "中学",
      dateText: "2026-05-06（水）",
      selected: null,
      now: fixedNow,
    });
    expect(html).toContain("中学の時間割 — 2026-05-06（水）");
    expect(html).toContain("2026年05月06日 印刷");
    expect(html).toContain('class="excel-print-page-title"');
    expect(html).toContain('class="excel-print-meta"');
  });

  it("高校セクションのタイトル", () => {
    const html = buildTimetableHeaderHtml({
      section: "高校",
      dateText: "2026-05-06（水）",
      now: fixedNow,
    });
    expect(html).toContain("高校の時間割 — 2026-05-06（水）");
  });

  it("section 未指定では 時間割 のみを出す", () => {
    const html = buildTimetableHeaderHtml({
      dateText: "2026-05-06（水）",
      now: fixedNow,
    });
    expect(html).toContain("時間割 — 2026-05-06（水）");
    expect(html).not.toContain("中学の時間割");
    expect(html).not.toContain("高校の時間割");
  });

  it("dateText 未指定では 区切り — を出さず時間割のみ", () => {
    const html = buildTimetableHeaderHtml({
      section: "中学",
      now: fixedNow,
    });
    expect(html).toContain("中学の時間割</h2>");
    expect(html).not.toContain("—");
  });

  it("selected を渡すと meta 行に 担当: が追加される", () => {
    const html = buildTimetableHeaderHtml({
      section: "中学",
      dateText: "2026-05-06（水）",
      selected: "山田",
      now: fixedNow,
    });
    expect(html).toContain("担当: 山田");
  });

  it("selected が無い場合は 担当 行を出さない", () => {
    const html = buildTimetableHeaderHtml({
      section: "中学",
      dateText: "2026-05-06（水）",
      now: fixedNow,
    });
    expect(html).not.toContain("担当:");
  });

  it("講師名が HTML 特殊文字を含むとエスケープされる (XSS 防止)", () => {
    const html = buildTimetableHeaderHtml({
      section: "中学",
      dateText: "2026-05-06（水）",
      selected: "<script>alert(1)</script>",
      now: fixedNow,
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("buildTimetableHeaderHtml (曜日)", () => {
  const fixedNow = new Date(2026, 4, 6); // 2026-05-06

  it("日付が無い時は曜日をタイトルに出す (全曜日印刷でどの紙か判るように)", () => {
    const html = buildTimetableHeaderHtml({
      section: "中学",
      day: "水",
      now: fixedNow,
    });
    expect(html).toContain("中学の時間割 — 水曜日");
  });

  it("日付がある時は曜日を出さない (dateText に（水）が入っていて冗長)", () => {
    const html = buildTimetableHeaderHtml({
      section: "中学",
      dateText: "2026年05月06日（水）",
      day: "水",
      now: fixedNow,
    });
    expect(html).toContain("中学の時間割 — 2026年05月06日（水）");
    expect(html).not.toContain("水曜日");
  });
});

describe("injectTimetableHeaders", () => {
  const fixedNow = new Date(2026, 4, 6); // 2026-05-06
  const body =
    '<div class="excel-grid-sections">' +
    '<div class="excel-print-col-ms" style="min-width:0">MS</div>' +
    '<div class="excel-print-col-hs" style="min-width:0">HS</div>' +
    "</div>";

  it("中学/高校カラムの直前にそれぞれのヘッダを差し込む", () => {
    const out = injectTimetableHeaders(body, {
      dateText: "2026年05月06日（水）",
      now: fixedNow,
    });
    expect(out).toContain("中学の時間割 — 2026年05月06日（水）");
    expect(out).toContain("高校の時間割 — 2026年05月06日（水）");
    // ヘッダはカラムの「前」(カラム内に入っていない)
    expect(out.indexOf("中学の時間割")).toBeLessThan(
      out.indexOf('class="excel-print-col-ms"')
    );
    expect(out.indexOf("高校の時間割")).toBeLessThan(
      out.indexOf('class="excel-print-col-hs"')
    );
    // 元の中身は保たれる
    expect(out).toContain(">MS</div>");
    expect(out).toContain(">HS</div>");
  });

  it("カラムが無い HTML はそのまま返す", () => {
    expect(injectTimetableHeaders("<div>なにもなし</div>", {})).toBe(
      "<div>なにもなし</div>"
    );
  });

  it("講師名に $& が含まれても置換文字列として解釈されない", () => {
    const out = injectTimetableHeaders(body, {
      selected: "$&山田",
      now: fixedNow,
    });
    expect(out).toContain("担当: $&amp;山田");
    expect(out).toContain('class="excel-print-col-ms"');
  });

  it("各クラス最初の 1 つだけに差し込む (曜日ブロック単位で呼ぶ前提)", () => {
    const twice = body + body;
    const out = injectTimetableHeaders(twice, { day: "水", now: fixedNow });
    expect(out.match(/中学の時間割/g)).toHaveLength(1);
    expect(out.match(/高校の時間割/g)).toHaveLength(1);
  });
});

describe("buildAllDaysBodyHtml", () => {
  it("曜日ブロックを section.excel-print-day で包んで連結する", () => {
    const html = buildAllDaysBodyHtml({
      blocks: [{ html: "<p>月</p>" }, { html: "<p>火</p>" }],
    });
    expect(html).toBe(
      '<section class="excel-print-day"><p>月</p></section>' +
        '<section class="excel-print-day"><p>火</p></section>'
    );
  });

  it("空・未指定は空文字", () => {
    expect(buildAllDaysBodyHtml({ blocks: [] })).toBe("");
    expect(buildAllDaysBodyHtml({})).toBe("");
  });
});

describe("buildAllDaysDocTitle", () => {
  it("曜日を中黒で並べる", () => {
    expect(buildAllDaysDocTitle({ days: ["月", "火", "土"] })).toBe(
      "時間割 全曜日 (月・火・土)"
    );
  });

  it("曜日が無い場合は括弧を出さない", () => {
    expect(buildAllDaysDocTitle({ days: [] })).toBe("時間割 全曜日");
    expect(buildAllDaysDocTitle({})).toBe("時間割 全曜日");
  });
});

describe("buildPrintStyles (全曜日ブロック)", () => {
  it("タイムテーブル印刷 CSS に曜日ブロックの改ページが含まれる", () => {
    const css = buildPrintStyles({ hasTimetableGrid: true, hasMonthView: false });
    expect(css).toContain(".excel-print-day{break-before:page");
    expect(css).toContain(".excel-print-day:first-child{break-before:auto");
  });
});
