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
  /* 1 ページに収まらない背の高いセクション (時限が多い = RegularGrid の
     TALL_SECTION_ROWS 超え) だけは分断を許す。収まらない表に avoid を
     効かせたままだと、Chromium は表の前に空きページを作った末に結局
     分断する (実測 A4 縦・20 時限: 「タイトルだけの紙」+「セクション
     見出しだけの紙」+ 表 2 枚 = 4 ページ → 素直に分断させて 2 ページ)。
     分断しても列見出し (thead) はページごとに繰り返される */
  .print-container .regb-section-tall,
  .print-container .regb-section-tall tbody {
    break-inside: auto;
    page-break-inside: auto;
  }
  /* セクション見出し (色帯) だけがページ末尾に取り残されないように */
  .print-container .regb-section > button {
    break-after: avoid;
    page-break-after: avoid;
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
  /* 時間列 (行見出し) は紙面では実寸で固定する。
     table-layout: fixed は「幅指定の無い列を等分する」ため、放っておくと
     時間列の幅がセクションの列数で変わる — 実測 A4 縦で中学部 (3 列) は
     171px、高校部 (8 列) は 76px。同じ紙の中でも左端が揃わず、曜日に
     よって列数が変わる (空列非表示・その日いない学年) と曜日ごとの紙でも
     幅が変わっていた。さらに狭いほうでは時刻 (「18:30-19:30」で約 92px
     必要) が入りきらず、nowrap のまま隣のクラス列へはみ出していた。
     固定してしまえば全セクション・全曜日で時間列の幅が揃い、残りの幅は
     クラス列が等分する (列数の少ないセクションほどセルが広くなる)。
     幅は実測 (「18:00-18:45」= 12px で約 86px + 左右の余白 12px) に 1 割の
     余裕を足した値。コンパクト表示は文字が 10px・余白が狭いぶん詰める。 */
  .print-container .regb-timecol {
    width: 28mm;
    /* それでも入らない環境 (幅の広いフォント・長い時限ラベル) では
       隣の列を侵さずに折り返す */
    white-space: normal !important;
  }
  .print-container.regb-compact .regb-timecol {
    width: 23mm;
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
  /* 画面のセルは行高を揃えるため科目・講師・備考を truncate (…) している。
     画面はクリックすれば全文が読めるが、**紙は読めない** ので、紙面では
     省略をやめて折り返す。RegularCell / RegularGrid の Tailwind
     truncate が対象 (overflow:hidden + text-overflow:ellipsis +
     white-space:nowrap の 3 点セットなので 3 つとも戻す)。
     td 側の overflow-wrap: anywhere と噛み合って長い科目名も収まる。 */
  .print-container .truncate {
    overflow: visible !important;
    text-overflow: clip !important;
    white-space: normal !important;
  }
  /* 科目名と ⚠バッジの行は flex を解除してブロック整形にする。flex の
     ままだと狭い列 (7 列以上のセクション) でバッジが横幅を取り、科目名が
     1 文字ずつ縦に折り返ってしまう。ブロックなら科目名が行を使い切り、
     入らないときだけバッジが次の行へ流れる */
  .print-container .regb-cell-head {
    display: block !important;
  }
  .print-container .regb-cell-head > span {
    display: inline;
  }
  /* 紙面のセルは画面より 1px 大きく刷る (科目 13→14 / 講師 12→13 /
     教室・備考 10→11px ≒ 7.5pt→8.3pt)。実測では字を大きくした方が
     行の折り返しが減り、週表示の紙は 13 → 12 ページに**減った**。
     コンパクト表示 (regb-compact) は「詰めて見る」のが目的なので据え置く */
  .print-container:not(.regb-compact) .regb-cell-subj {
    font-size: 14px !important;
  }
  .print-container:not(.regb-compact) .regb-cell-teacher {
    font-size: 13px !important;
  }
  .print-container:not(.regb-compact) .regb-cell-sub {
    font-size: 11px !important;
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
  /* 複数選択の装飾 (緑リング = box-shadow + 薄緑背景) は紙面に載せない */
  .print-container td.regb-selected {
    box-shadow: none !important;
    background-color: transparent !important;
  }

  /* ─── 🖨 白黒 (インク節約) ────────────────────────────────────────
     下書きの目視チェック用。背景の塗り (科目カラー・学年色・セクション
     見出し・重複の赤) を全部落として、罫線と文字だけで刷る。
     色を「刷らない」だけでは白抜き文字 (セクション見出し・⚠バッジ) が
     白地に白で消えるため、文字色も黒に統一する。塗りが無くなった分の
     区切りは罫線と太字で補う。**画面は色付きのまま** — 紙面だけの切替。 */
  .regb-mono .print-container,
  .regb-mono .print-container * {
    background-color: transparent !important;
    background-image: none !important;
    color: #000 !important;
    box-shadow: none !important;
  }
  /* 表の骨格を罫線で引き直す。この画面の升目は「セルの塗り分け」で見せて
     おり罫線は実は描かれていない (Tailwind の preflight を読み込んでいない
     ため border-* ユーティリティに border-style が付かず、幅だけ指定されて
     何も出ない)。塗りを落とす白黒では列を追えなくなるので、ここだけ
     style/width も明示して升目を出す */
  .regb-mono .print-container td,
  .regb-mono .print-container th {
    border: 1px solid #999 !important;
  }
  /* セクション見出し (色帯 + 白抜き) は黒の下線と太字で見出しらしさを残す */
  .regb-mono .print-container .regb-section > :first-child {
    border-bottom: 2px solid #000 !important;
    font-weight: 700 !important;
  }
  .regb-mono .print-container .regb-cell-head > span:not(:first-child) {
    border: 1px solid #000 !important;
    border-radius: 2px;
    padding: 0 2px;
  }
}
`.trim();
