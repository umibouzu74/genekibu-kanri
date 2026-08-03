// 通常時間割作成 (RegularBuilderApp) の window.print() 用スタイル。
//
// CLAUDE.md「印刷システムの二系統」の window.print() 側に寄せる
// (講習ビルダーの builderPrintStyle と同型)。no-print の除去と
// アプリシェルのスクロール解除は親アプリ (App.jsx 末尾) のグローバル
// @media print が担うので、ここは @page と .print-container 内の
// 紙面調整だけを持つ。RegularBuilderApp が <style> でそのまま流し込む。
//
// 講習 (A3 縦) との違い:
//  - **A4 縦を既定に**: セクション (時間軸を共有する学年のまとまり) ごとの
//    小さな表なので A4 縦で足りる。画面の 2 カラム流し込み (flex) は
//    紙面では縦 1 列に直し、1 セクションが紙面をまたがないようにする
//    (break-inside: avoid)。
//  - **プレースホルダを刷らない**: セルの教室・備考は空でも input が
//    置かれているため、placeholder ("備考" 等) が紙面に写らないよう
//    透明化する (講習のセルは select のみでこの問題が無い)。
export const REGULAR_PRINT_STYLE = `
@media print {
  @page { size: A4 portrait; margin: 8mm; }
  .print-container {
    display: block !important;
    max-height: none !important;
    border: none !important;
    overflow: visible !important;
  }
  /* ブラウザは既定で背景色を刷らないため、セクション見出し (色背景 +
     白文字) が紙面で白文字だけになり読めなくなる。背景・文字色を
     そのまま刷らせる (学年色・科目カラーも残る) */
  .print-container,
  .print-container * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* 全曜日印刷: 曜日ブロックごとに改ページ (先頭は除く) */
  .regb-print-day {
    break-before: page;
    page-break-before: always;
  }
  .regb-print-day:first-child {
    break-before: auto;
    page-break-before: auto;
  }
  /* セクションは縦積みで全幅・途中で改ページしない */
  .print-container .regb-section {
    break-inside: avoid;
    page-break-inside: avoid;
    width: 100% !important;
    max-width: 100% !important;
    margin-bottom: 6mm;
    box-shadow: none !important;
  }
  .print-container .regb-section > div {
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
  /* sticky を解除して thead をページごとに繰り返させる */
  .print-container thead,
  .print-container th,
  .print-container td {
    position: static !important;
  }
}
`.trim();
