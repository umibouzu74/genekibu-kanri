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

  it('列見出しをページごとに繰り返すため sticky を静的化する (thead position:static)', () => {
    expect(BUILDER_PRINT_STYLE).toMatch(/thead[^{]*\{[^}]*position:\s*static/);
  });

  it('日の区切り黒バーは印刷で隠し、日ごとに上罫線で仕切る', () => {
    expect(BUILDER_PRINT_STYLE).toMatch(/\.builder-day-separator\s*\{[^}]*display:\s*none/);
    expect(BUILDER_PRINT_STYLE).toMatch(/builder-day-group:not\(:first-of-type\)[^{]*\{[^}]*border-top/);
  });

  it('.print-container のスクロール制限を印刷時に解除する', () => {
    expect(BUILDER_PRINT_STYLE).toContain('.print-container');
    expect(BUILDER_PRINT_STYLE).toMatch(/max-height:\s*none/);
    expect(BUILDER_PRINT_STYLE).toMatch(/overflow:\s*visible/);
  });

  it('L2g: 強調のセルは ring に頼らず outline を style まで書いて太く引く', () => {
    expect(BUILDER_PRINT_STYLE).toMatch(/td\[data-highlight="match"\]\s*\{[^}]*outline:\s*3px solid/);
    expect(BUILDER_PRINT_STYLE).toMatch(/td\[data-highlight="match"\]\s*\{[^}]*box-shadow:\s*none/);
  });

  it('L2g: 薄表示は画面 (0.4) より濃くして紙で読めるようにする', () => {
    const m = BUILDER_PRINT_STYLE.match(/td\[data-highlight="dim"\]\s*\{[^}]*opacity:\s*([\d.]+)/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThan(0.4);
  });

  it('L2g: 紙面用の科目・講師の文字の大きさを持つ', () => {
    expect(BUILDER_PRINT_STYLE).toContain('.builder-print-subject');
    expect(BUILDER_PRINT_STYLE).toContain('.builder-print-teacher');
  });

  it('L2h: まとめて印刷の間は画面の時間割・見出しを紙面に出さず、組ごとに改ページする', () => {
    expect(BUILDER_PRINT_STYLE).toMatch(/\.builder-batch-printing \.builder-main-sheet\s*\{[^}]*display:\s*none/);
    expect(BUILDER_PRINT_STYLE).toMatch(/\.builder-batch-sheet \+ \.builder-batch-sheet\s*\{[^}]*break-before:\s*page/);
    expect(BUILDER_PRINT_STYLE).toMatch(/\.builder-batch-sheet \+ \.builder-batch-sheet\s*\{[^}]*page-break-before:\s*always/);
  });
});
