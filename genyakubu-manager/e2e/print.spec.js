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
}

test("ダッシュボード: print で操作 UI が消え本文が残る", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  await expect(page.locator(".app-h1")).toHaveText("ダッシュボード");

  await page.emulateMedia({ media: "print" });
  await expectPrintChromeHidden(page);
  // 本文 (ビュータイトル) は残る
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

test("講師の週間予定: print で操作 UI が消える", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  // サイドバーの講師リストから講師を選ぶ (奥村はデモデータの既定講師)
  await page.locator(".sidebar button").filter({ hasText: /^奥村/ }).first().click();
  await expect(page.locator(".app-h1")).toHaveText(/奥村/);

  await page.emulateMedia({ media: "print" });
  await expectPrintChromeHidden(page);
  await expect(page.locator(".app-h1")).toBeVisible();
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
