import { describe, expect, it } from 'vitest';
import { BUILDER_PRINT_STYLE } from './builderPrintStyle';

// 講習時間割の印刷スタイル (window.print() 系) の回帰ガード。
// 実際の紙面レイアウトは e2e (print.spec.js) が print メディアで検証するが、
// 「A3 縦・全列収め・日付単位の改ページ」という要件が CSS 文字列から
// 落ちないことをここで固定する。
describe('BUILDER_PRINT_STYLE', () => {
  it('@media print ブロックとして出力される', () => {
    expect(BUILDER_PRINT_STYLE).toContain('@media print');
  });

  it('A3 縦向きを既定にする', () => {
    expect(BUILDER_PRINT_STYLE).toMatch(/@page\s*\{\s*size:\s*A3 portrait/);
  });

  it('全列を紙面幅に収めるため table-layout: fixed と min-width 解除を持つ', () => {
    expect(BUILDER_PRINT_STYLE).toMatch(/table-layout:\s*fixed/);
    expect(BUILDER_PRINT_STYLE).toMatch(/width:\s*100%/);
    expect(BUILDER_PRINT_STYLE).toMatch(/min-width:\s*0/);
  });

  it('1 日分 (tbody) をページ境界で分断しない (break-inside / page-break-inside)', () => {
    expect(BUILDER_PRINT_STYLE).toMatch(/tbody\s*\{[^}]*break-inside:\s*avoid/);
    expect(BUILDER_PRINT_STYLE).toMatch(/tbody\s*\{[^}]*page-break-inside:\s*avoid/);
  });

  it('紙面の select は矢印を消して科目名の横幅を確保する (appearance:none)', () => {
    expect(BUILDER_PRINT_STYLE).toMatch(/\.print-container select\s*\{[^}]*appearance:\s*none/);
  });

  it('.print-container のスクロール制限を印刷時に解除する', () => {
    expect(BUILDER_PRINT_STYLE).toContain('.print-container');
    expect(BUILDER_PRINT_STYLE).toMatch(/max-height:\s*none/);
    expect(BUILDER_PRINT_STYLE).toMatch(/overflow:\s*visible/);
  });
});
