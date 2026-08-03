// 通常時間割作成 (RegularBuilderApp) の window.print() 用スタイル。
//
// CLAUDE.md「印刷システムの二系統」の window.print() 側に寄せる
// (講習ビルダーの builderPrintStyle と同型)。no-print の除去と
// アプリシェルのスクロール解除は親アプリ (App.jsx 末尾) のグローバル
// @media print が担うので、ここは @page と .print-container 内の
// 紙面調整だけを持つ。RegularBuilderApp が <style> でそのまま流し込む。
//
// 講習 (A3 縦) との違い:
//  - **A4 縦を既定に**: 通常時間割は列 = クラス (高々数列) で横幅が細く、
//    行数も 週の曜日 × 時限 なので A4 縦で足りる。曜日単位の改ページ制御
//    (break-inside: avoid) で 1 曜日が紙面をまたがないようにする。
//  - **プレースホルダを刷らない**: セルの教室・備考は空でも input が
//    置かれているため、placeholder ("備考" 等) が紙面に写らないよう
//    透明化する (講習のセルは select のみでこの問題が無い)。
export const REGULAR_PRINT_STYLE = `
@media print {
  @page { size: A4 portrait; margin: 8mm; }
  .print-container {
    max-height: none !important;
    border: none !important;
    overflow: visible !important;
  }
  .print-container table {
    width: 100% !important;
    table-layout: fixed !important;
  }
  .print-container th,
  .print-container td {
    min-width: 0 !important;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .print-container select {
    max-width: 100%;
    text-overflow: ellipsis;
    /* 紙面ではドロップダウンの矢印は不要。矢印分の横幅を教科名に回す */
    -webkit-appearance: none;
    appearance: none;
    padding-right: 0 !important;
    background-image: none !important;
  }
  /* 空欄の教室・備考は紙面に出さない (プレースホルダ文字も入力枠も)。
     visibility なのでレイアウトは崩れない */
  .print-container input::placeholder {
    color: transparent !important;
  }
  .print-container input:placeholder-shown {
    visibility: hidden;
  }
  .print-container tbody {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .print-container tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  /* sticky を解除して thead をページごとに繰り返させる (曜日/時限列も静的化) */
  .print-container thead,
  .print-container th,
  .print-container td {
    position: static !important;
  }
  /* 曜日の区切り: 黒バーは隠し、各曜日 (先頭を除く) の先頭行に上罫線 */
  .print-container .builder-day-separator {
    display: none !important;
  }
  .print-container tbody.builder-day-group:not(:first-of-type) > tr:first-child > * {
    border-top: 2px solid #1f2430 !important;
  }
}
`.trim();
