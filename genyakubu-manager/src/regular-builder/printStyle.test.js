import { describe, expect, it } from "vitest";
import { REGULAR_PRINT_STYLE } from "./printStyle";

// 通常時間割の印刷スタイル (window.print() 系) の回帰ガード。
// builderPrintStyle.test.js と同型 — 「A4 縦・全列収め・セクション単位の
// 改ページ・プレースホルダ非表示」が CSS 文字列から落ちないことを固定する。
describe("REGULAR_PRINT_STYLE", () => {
  it("@media print ブロックとして出力される", () => {
    expect(REGULAR_PRINT_STYLE).toContain("@media print");
  });

  it("A4 縦向きを既定にする", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(/@page\s*\{\s*size:\s*A4 portrait/);
  });

  it("全列を紙面幅に収めるため table-layout: fixed と min-width 解除を持つ", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(/table-layout:\s*fixed/);
    expect(REGULAR_PRINT_STYLE).toMatch(/width:\s*100%/);
    expect(REGULAR_PRINT_STYLE).toMatch(/min-width:\s*0/);
  });

  it("1 セクションをページ境界で分断せず、紙面では縦 1 列・全幅にする", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(/\.regb-section\s*\{[^}]*break-inside:\s*avoid/);
    expect(REGULAR_PRINT_STYLE).toMatch(/\.regb-section\s*\{[^}]*page-break-inside:\s*avoid/);
    expect(REGULAR_PRINT_STYLE).toMatch(/\.regb-section\s*\{[^}]*width:\s*100%/);
    expect(REGULAR_PRINT_STYLE).toMatch(/\.print-container\s*\{[^}]*display:\s*block/);
  });

  it("時限行 (tbody/tr) をページ境界で分断しない", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(/tbody\s*\{[^}]*break-inside:\s*avoid/);
    expect(REGULAR_PRINT_STYLE).toMatch(/tbody\s*\{[^}]*page-break-inside:\s*avoid/);
  });

  it("紙面の select は矢印を消して教科名の横幅を確保する (appearance:none)", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(/\.print-container select\s*\{[^}]*appearance:\s*none/);
  });

  it("空欄の教室・備考を紙面に出さない (プレースホルダ透明化 + 空入力の非表示)", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(/input::placeholder\s*\{[^}]*color:\s*transparent/);
    expect(REGULAR_PRINT_STYLE).toMatch(/input:placeholder-shown\s*\{[^}]*visibility:\s*hidden/);
  });

  it("列見出しをページごとに繰り返すため sticky を静的化する", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(/thead[^{]*\{[^}]*position:\s*static/);
  });

  it("背景色を刷らせる (白文字のセクション見出しが紙面で消えないように)", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(/print-color-adjust:\s*exact/);
  });

  it("全曜日印刷は曜日ブロックごとに改ページする (先頭は除く)", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(/\.regb-print-day\s*\{[^}]*break-before:\s*page/);
    expect(REGULAR_PRINT_STYLE).toMatch(
      /\.regb-print-day:first-child\s*\{[^}]*break-before:\s*auto/
    );
  });
});
