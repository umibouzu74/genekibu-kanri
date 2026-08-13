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

  it("1 ページに収まらない背の高いセクション (regb-section-tall) だけは分断を許す", () => {
    // 収まらない表に avoid を効かせたままだと、Chromium は表の前に
    // 空きページを作った末に結局分断する (実測 A4 縦・20 時限で
    // 「タイトルだけの紙」+「見出しだけの紙」+ 表 2 枚 = 4 ページ)。
    // セクションと tbody の両方を auto に戻して 2 ページに収める
    const rule = /\.regb-section-tall,?[^{]*\{[^}]*break-inside:\s*auto/;
    expect(REGULAR_PRINT_STYLE).toMatch(rule);
    expect(REGULAR_PRINT_STYLE).toMatch(
      /\.regb-section-tall tbody\s*\{[^}]*break-inside:\s*auto/
    );
  });

  it("セクション見出し (色帯) がページ末尾に取り残されない", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(
      /\.regb-section > button\s*\{[^}]*break-after:\s*avoid/
    );
  });

  it("時間列 (regb-timecol) は実寸で固定し、入らないときは折り返す", () => {
    // table-layout: fixed は幅指定の無い列を等分するため、固定しないと
    // 時間列の幅がセクションの列数で変わる (実測 A4 縦: 1 列のセクションで
    // 343px / 8 列で 76px)。狭いほうでは時刻が隣の列へはみ出していた
    expect(REGULAR_PRINT_STYLE).toMatch(
      /\.print-container \.regb-timecol\s*\{[^}]*width:\s*28mm/
    );
    expect(REGULAR_PRINT_STYLE).toMatch(
      /\.print-container\.regb-compact \.regb-timecol\s*\{[^}]*width:\s*23mm/
    );
    expect(REGULAR_PRINT_STYLE).toMatch(
      /\.print-container \.regb-timecol\s*\{[^}]*white-space:\s*normal/
    );
  });

  it("紙面の select は矢印を消して教科名の横幅を確保する (appearance:none)", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(/\.print-container select\s*\{[^}]*appearance:\s*none/);
  });

  it("空欄の教室・備考を紙面に出さない (プレースホルダ透明化 + 空入力の非表示)", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(/input::placeholder\s*\{[^}]*color:\s*transparent/);
    expect(REGULAR_PRINT_STYLE).toMatch(/input:placeholder-shown\s*\{[^}]*visibility:\s*hidden/);
  });

  it("紙面ではセルの truncate (…) を解除して全文を折り返す", () => {
    // 画面は行高を揃えるため科目・講師・備考を truncate しているが、紙は
    // クリックして全文を読めないので省略してはいけない。Tailwind の
    // truncate は 3 プロパティの複合なので 3 つとも戻っていること。
    expect(REGULAR_PRINT_STYLE).toMatch(
      /\.print-container \.truncate\s*\{[^}]*overflow:\s*visible/
    );
    expect(REGULAR_PRINT_STYLE).toMatch(
      /\.print-container \.truncate\s*\{[^}]*text-overflow:\s*clip/
    );
    expect(REGULAR_PRINT_STYLE).toMatch(
      /\.print-container \.truncate\s*\{[^}]*white-space:\s*normal/
    );
  });

  it("紙面ではセル見出し行の flex を解除する (狭い列で 1 文字ずつ折り返さない)", () => {
    expect(REGULAR_PRINT_STYLE).toMatch(
      /\.print-container \.regb-cell-head\s*\{[^}]*display:\s*block/
    );
  });

  it("紙面のセルは画面より 1px 大きく刷る (コンパクト表示は据え置き)", () => {
    // 字を大きくすると折り返しが減り、実測では紙が増えるどころか減った
    // (週表示 13 → 12 ページ)。コンパクトは「詰めて見る」ためなので対象外
    for (const [cls, px] of [
      ["regb-cell-subj", 14],
      ["regb-cell-teacher", 13],
      ["regb-cell-sub", 11],
    ]) {
      expect(REGULAR_PRINT_STYLE).toMatch(
        new RegExp(
          `\\.print-container:not\\(\\.regb-compact\\) \\.${cls}\\s*\\{[^}]*font-size:\\s*${px}px`
        )
      );
    }
  });

  describe("🖨 白黒 (regb-mono)", () => {
    it("背景の塗りを全部落として文字を黒に統一する", () => {
      expect(REGULAR_PRINT_STYLE).toMatch(
        /\.regb-mono \.print-container \*\s*\{[^}]*background-color:\s*transparent/
      );
      expect(REGULAR_PRINT_STYLE).toMatch(
        /\.regb-mono \.print-container \*\s*\{[^}]*background-image:\s*none/
      );
      // 白抜き文字 (セクション見出し・⚠バッジ) が白地で消えないように
      expect(REGULAR_PRINT_STYLE).toMatch(
        /\.regb-mono \.print-container \*\s*\{[^}]*color:\s*#000/
      );
    });

    it("塗りの代わりに升目の罫線を引く (style/width まで明示)", () => {
      // Tailwind preflight を読み込んでいないため border-* は幅だけで
      // border-style が付かず何も描かれない。白黒では自分で引く
      expect(REGULAR_PRINT_STYLE).toMatch(
        /\.regb-mono \.print-container td[^{]*\{[^}]*border:\s*1px solid/
      );
    });

    it("セクション見出しは下線 + 太字で見出しらしさを残す", () => {
      expect(REGULAR_PRINT_STYLE).toMatch(
        /\.regb-mono[^{]*\.regb-section > :first-child\s*\{[^}]*border-bottom:\s*2px solid/
      );
    });

    it("白黒指定が無ければ従来どおり色付きで刷る (規則は regb-mono の下だけ)", () => {
      const mono = REGULAR_PRINT_STYLE.slice(
        REGULAR_PRINT_STYLE.indexOf("🖨 白黒")
      );
      // 白黒ブロックの規則は全て .regb-mono で始まる = 通常印刷に漏れない
      const selectors = mono.match(/^\s*\.[\w-][^{]*\{/gm) || [];
      expect(selectors.length).toBeGreaterThan(0);
      for (const sel of selectors) expect(sel.trim()).toMatch(/^\.regb-mono\b/);
    });
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
