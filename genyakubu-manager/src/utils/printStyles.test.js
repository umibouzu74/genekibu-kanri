import { describe, it, expect } from "vitest";
import {
  buildMonthHeaderHtml,
  buildMonthLabel,
  buildPageRule,
  buildPrintStyles,
  describeMonthVisibility,
} from "./printStyles";

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

  it("バッジ凡例 (代/合/振/移/特訓) を含む", () => {
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
  });
});
