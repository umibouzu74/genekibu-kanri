import { test, expect } from "@playwright/test";

// E3c: 印刷出力のスモークテスト (構造検証)。
//
// 印刷は 2 系統 (リポジトリ CLAUDE.md の印刷ルール参照):
//  A. window.print() 直接系 (PrintButton): App.jsx 末尾のグローバル
//     @media print で sidebar / .no-print が消え、本文が残る。
//     ここでは print メディアエミュレーションで「消えるべきものが消え、
//     残るべきものが残る」ことを検証する (2026-07-03 に発覚した
//     トップバー操作ボタンの写り込みのような回帰を検出する)。
//  B. popup 注入系 (handlePrint): #main-content をコピーしてビュー別の
//     印刷ヘッダ (タイトル・印刷日・凡例) を動的注入する。popup の DOM に
//     ヘッダが実際に注入されることを検証する。
//
// ピクセル比較 (VRT) はフォント環境差で flaky になるため導入しない
// (ROADMAP E3c の判断メモ参照)。

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("builder.onboarding_seen", "1");
  });
});

// 紙面 (A4 縦) の幅 ≒ 210mm - @page margin 8mm×2 = 194mm ≒ 733 CSS px。
// 印刷時のメディアクエリは「画面幅」ではなく「紙面幅」で評価されるため、
// デスクトップ幅のまま emulateMedia('print') しただけでは
// @media (min-width: 769px) 前提の回帰 (下の「紙面が暗くならない」) を
// 取りこぼす。紙面幅を再現したいテストはこの幅にビューポートを合わせる。
const PRINT_PAGE_WIDTH = 733;

// print メディアで、印刷に出ないはずの要素が全て消えていることを確認する。
async function expectPrintChromeHidden(page) {
  await expect(page.locator(".sidebar")).toBeHidden();
  // .no-print が 1 つでも表示状態で残っていたら NG (写り込み回帰の検出)
  const visibleNoPrint = await page
    .locator(".no-print")
    .evaluateAll((els) =>
      els.filter((el) => getComputedStyle(el).display !== "none").length
    );
  expect(visibleNoPrint).toBe(0);
  // 紙面を覆う不透明・半透明のオーバレイが残っていないこと。
  // サイドバーの backdrop (rgba(0,0,0,.4)) が紙面全体に乗って出力が
  // 暗くなる不具合の回帰ガード。
  const overlays = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed") continue;
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const bg = cs.backgroundColor;
      // 透明 (rgba(...,0) / transparent) なら紙面を汚さない
      if (bg === "transparent" || /,\s*0\)$/.test(bg)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 300 || r.height < 300) continue;
      out.push(`${el.className || el.tagName}: ${bg}`);
    }
    return out;
  });
  expect(overlays).toEqual([]);
}

test("ダッシュボード: print で操作 UI が消え本文が残る", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  await expect(page.locator(".app-h1")).toHaveText("ダッシュボード");

  await page.emulateMedia({ media: "print" });
  await expectPrintChromeHidden(page);
  // 本文 (ビュータイトル) は残る
  await expect(page.locator(".app-h1")).toBeVisible();
});

test("印刷: サイドバー未操作 (リロード直後) でも紙面が暗くならない", async ({
  page,
}) => {
  await page.goto("/genekibu-kanri/");
  await expect(page.locator(".app-h1")).toHaveText("ダッシュボード");
  // sidebarOpen の初期値は true。view は sessionStorage から復元されるため、
  // 「サイドバーを一度も操作せずに印刷する」= backdrop が DOM に居る状態は
  // リロード直後の通常運用そのもの。まずその前提を固定する。
  await expect(page.locator(".sidebar-backdrop")).toHaveCount(1);
  // 画面 (デスクトップ幅) では backdrop は見えていない
  await expect(page.locator(".sidebar-backdrop")).toBeHidden();

  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: PRINT_PAGE_WIDTH, height: 1040 });

  // 紙面幅では @media (min-width: 769px) が効かない。それでも backdrop は
  // 紙面に出ない (出ると rgba(0,0,0,.4) が全面に乗って出力が真っ暗になる)
  await expect(page.locator(".sidebar-backdrop")).toBeHidden();
  await expectPrintChromeHidden(page);
  await expect(page.locator(".app-h1")).toBeVisible();
});

test("イベントカレンダー: print で追加授業バッジが紙面に残る", async ({ page }) => {
  // 今月 15 日の追加授業を仕込み、visibility を ON にしておく (H1b)
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  await page.addInitScript(([ymArg]) => {
    localStorage.setItem(
      "genyakubu-extra-lessons",
      JSON.stringify([
        {
          id: 1,
          date: `${ymArg}-15`,
          time: "18:30-20:00",
          grade: "中3",
          cls: "A",
          room: "",
          subj: "プレップ個別指導",
          teacher: "香川·福江",
          label: "夏期講習",
          note: "",
        },
      ])
    );
    localStorage.setItem(
      "genyakubu-event-visibility",
      JSON.stringify({ extraLesson: true })
    );
  }, [ym]);

  await page.goto("/genekibu-kanri/");
  await page.getByRole("button", { name: /イベントカレンダー/ }).click();
  await expect(
    page.getByText(/18:30 中3A プレップ個別指導/).first()
  ).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expectPrintChromeHidden(page);
  await expect(
    page.getByText(/18:30 中3A プレップ個別指導/).first()
  ).toBeVisible();
  // 月送りボタンは消えるが、年月の見出しは紙面に残る
  await expect(
    page.getByText(`${now.getFullYear()}年${now.getMonth() + 1}月`, { exact: true })
  ).toBeVisible();
});

test("講師の個人予定 (既定は月間): print で操作 UI が消える", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  // サイドバーの講師リストから講師を選ぶ (奥村はデモデータの既定講師)
  await page.locator(".sidebar button").filter({ hasText: /^奥村/ }).first().click();
  await expect(page.locator(".app-h1")).toHaveText(/奥村/);

  await page.emulateMedia({ media: "print" });
  await expectPrintChromeHidden(page);
  await expect(page.locator(".app-h1")).toBeVisible();
});

test("タイムテーブル: popup 印刷に中学/高校のセクションヘッダが注入される", async ({
  page,
  context,
}) => {
  // popup 側の window.print() を止めて onafterprint → close を防ぐ
  await context.addInitScript(() => {
    window.print = () => {};
  });

  await page.goto("/genekibu-kanri/");
  // Dashboard の既定は時間割モード (ExcelGridView)
  await expect(page.locator(".excel-grid-sections")).toBeVisible();

  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "現在のビューを印刷" }).click(),
  ]);

  // buildTimetableHeaderHtml が中学 / 高校の各セクション先頭に注入するヘッダ
  await expect(popup.locator(".excel-print-page-title").first()).toContainText(
    "中学の時間割"
  );
  await expect(popup.locator(".excel-print-page-title").nth(1)).toContainText(
    "高校の時間割"
  );
  // 対象日は和式 (E1h: formatPrintDate)
  await expect(popup.locator(".excel-print-page-title").first()).toContainText(
    /\d{4}年\d{2}月\d{2}日/
  );
  await expect(popup.locator(".excel-print-meta").first()).toContainText("印刷");
});

test("講習時間割作成: print で全列収め (横溢れなし) と日付単位の改ページが効く", async ({
  page,
}) => {
  // 「全クラス列が紙面幅に収まる」を実挙動で検証するため、列数の多いタブ
  // (中１・２ = 7クラス) を、その min-width 合計より狭い viewport で開く。
  // table-layout:fixed が無ければ横溢れする状況を作り、収まることを assert する。
  await page.setViewportSize({ width: 1000, height: 900 });

  await page.goto("/genekibu-kanri/");
  // サイドバーから講習時間割作成ビューへ (builder-worker.spec と同経路)
  await page.getByRole("button", { name: "🧩 講習時間割作成" }).click();
  await expect(page.getByRole("button", { name: /自動作成/ })).toBeVisible({
    timeout: 30_000,
  });
  // 列数の多いタブ (7クラス) へ切り替え
  await page.getByRole("tab", { name: /中１・２/ }).click();
  // スケジュール表 (.print-container) が出るまで待つ
  await expect(page.locator(".print-container table")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expectPrintChromeHidden(page);

  // (要件2) 全クラス列が紙面幅に収まる = コンテナ内で横溢れ (overflow) しない。
  // table-layout:fixed + width:100% + min-width:0 が外れると scrollWidth が
  // clientWidth を超える (=列が切れて 2 ページ目送りになる) ので、その回帰を捕捉。
  const fit = await page.locator(".print-container").evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth + 1);

  // 全日程が印刷される = アプリシェル (.app-main) のスクロールペインが
  // 印刷時に解除され、1 ページ (ビューポート高) でクリップされない。
  // 以前は .app-main{overflow:auto;height:100vh} が全内容を最初の1ページに
  // 切り落としていた (縦に長い時間割の 2 日目以降が印刷されない不具合)。
  const vscroll = await page.locator(".app-main").evaluate((el) => ({
    overflow: getComputedStyle(el).overflow,
    clips: el.scrollHeight > el.offsetHeight + 2,
  }));
  expect(vscroll.overflow).toBe("visible");
  expect(vscroll.clips).toBe(false);

  // 収める手段として table-layout: fixed が印刷時に効いていることも確認
  const tableLayout = await page
    .locator(".print-container table")
    .evaluate((el) => getComputedStyle(el).tableLayout);
  expect(tableLayout).toBe("fixed");

  // 列見出しを各ページ先頭に繰り返させるため、印刷では thead の sticky を
  // 静的化している (sticky のままだと Chromium の thead 自動繰り返しが阻害され、
  // A3縦で複数ページに跨ると 2 ページ目以降が見出し無しになる)。
  const theadPosition = await page
    .locator(".print-container thead")
    .evaluate((el) => getComputedStyle(el).position);
  expect(theadPosition).toBe("static");

  // (要件3) 1 日分 (tbody) はページ境界で分断しない (break-inside: avoid)。
  // 日付ごとに tbody.builder-day-group が分かれている前提。
  // 注: emulateMedia('print') では実ページボックスを観測できないため、ここは
  // CSS が当たっていることの検証まで。実際のページ分割が日境界に一致するかは
  // Chromium の table break-inside 対応に依存し、A3 縦 PDF の目視で担保する。
  const dayBodies = page.locator(".print-container tbody.builder-day-group");
  expect(await dayBodies.count()).toBeGreaterThan(0);
  const breakInside = await dayBodies
    .first()
    .evaluate((el) => getComputedStyle(el).breakInside);
  expect(breakInside).toBe("avoid");
});

test("月次カレンダー: popup 印刷にタイトル・印刷日・凡例が注入される", async ({
  page,
  context,
}) => {
  // popup 側の window.print() を止めて onafterprint → close を防ぐ
  await context.addInitScript(() => {
    window.print = () => {};
  });

  await page.goto("/genekibu-kanri/");
  await page.locator(".sidebar button").filter({ hasText: /^奥村/ }).first().click();
  await page.getByRole("button", { name: "月間", exact: true }).click();
  await expect(page.locator(".month-print-root")).toBeVisible();

  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "現在のビューを印刷" }).click(),
  ]);

  // buildMonthHeaderHtml が注入するヘッダ 3 点セット
  await expect(popup.locator(".month-print-page-title")).toContainText("月");
  await expect(popup.locator(".month-print-page-title")).toContainText("奥村");
  await expect(popup.locator(".month-print-meta")).toContainText("印刷");
  await expect(popup.locator(".month-print-legend")).toContainText("代行");
  // 本文 (カレンダー) もコピーされている
  await expect(popup.locator(".month-print-root")).toHaveCount(1);
});
