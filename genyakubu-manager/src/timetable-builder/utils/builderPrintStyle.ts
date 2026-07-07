// 講習時間割 (BuilderApp) の window.print() 用スタイル。
//
// CLAUDE.md「印刷システムの二系統」の window.print() 側。no-print の除去は
// 親アプリ (App.jsx 末尾) のグローバル @media print が担うので、ここは
// @page と .print-container 内の紙面調整だけを持つ。BuilderApp が
// <style> でそのまま流し込む。printHeader.ts と同型のローカル慣習。
//
// 方針 (2026-07-07):
//  - **A3 縦向きを既定に** (従来は `size: landscape` = プリンタ既定紙の横向き
//    ≒ A4横 297×210mm)。A3縦は幅が A4横と同じ 297mm のまま縦が倍 (420mm)
//    なので、横方向の収まりを変えずに 1 ページへ載る日数を増やせる。
//  - **全クラス列を必ず紙面幅に収める**: `table-layout: fixed` + `width:100%`
//    + `min-width:0`。列数が多いほど各列は狭くなるが、min-width 由来で横に
//    溢れて 2 ページ目送りになる (=列が切れる) のを防ぐ。セル内テキストは
//    折り返す。
//  - **1 日分 (tbody) をページ境界で分断しない**: `break-inside: avoid`。
//    ScheduleTable は日付ごとに <tbody> を分けており、その日が 1 ページに
//    収まらない場合のみ従来どおり分割される (= 出来る限り日の途中で切らない)。
//    リポジトリ慣習に合わせ page-break-inside も併記 (printStyles.js と同様)。
//  - **列見出しを各ページ先頭に繰り返す**: <thead> は画面用に position:sticky
//    だが、sticky のままだと Chromium の thead 自動繰り返し
//    (display:table-header-group) が阻害され、A3縦で複数ページに跨ると
//    2 ページ目以降が見出し無しになる。印刷では position:static に戻す
//    (日付/時限列の sticky も同時に静的化。印刷に横スクロールは無い)。
//  - **日の区切り**: 画面の黒バー (builder-day-separator) は tbody 末尾に
//    あり、ページ末尾に単独で残ると『帯』に見える。印刷では非表示にし、
//    代わりに各日の先頭へ上罫線を引く (ページ跨ぎで宙ぶらりんにならない)。
//
// 注意 (改ページの検証限界): 実際に「日境界でページが分かれる」挙動は
// Chromium の table-row-group への break-inside 対応に依存する。
// print.spec.js は CSS が当たっていることまでしか検証できない
// (emulateMedia('print') では実ページボックスを観測できない) ため、
// エンジン更新時は A3 縦 PDF を出力してページ境界が日境界に一致するかを
// 目視再確認すること (ROADMAP G.2 の実機確認項目と同性質)。
export const BUILDER_PRINT_STYLE = `
@media print {
  @page { size: A3 portrait; margin: 8mm; }
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
    /* 紙面ではドロップダウンの矢印は不要。矢印分の横幅を科目名に回すと
       狭い列でも「国語」「数学」等 (2 文字) が省略されず収まる。 */
    -webkit-appearance: none;
    appearance: none;
    padding-right: 0 !important;
    background-image: none !important;
  }
  .print-container tbody {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .print-container tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  /* sticky を解除して thead をページごとに繰り返させる (日付/時限列も静的化) */
  .print-container thead,
  .print-container th,
  .print-container td {
    position: static !important;
  }
  /* 日の区切り: 黒バーは隠し、各日 (先頭日を除く) の先頭行に上罫線 */
  .print-container .builder-day-separator {
    display: none !important;
  }
  .print-container tbody.builder-day-group:not(:first-of-type) > tr:first-child > * {
    border-top: 2px solid #1f2430 !important;
  }
}
`.trim();
