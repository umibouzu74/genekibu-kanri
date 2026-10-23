// e2e で共有する小さな操作。

/**
 * サイドバーのカテゴリを開く (2026-10-16 からサイドバーはカテゴリごとに開け閉め
 * する。既定で開いているのは「今日の対応」と今いる画面のカテゴリだけ)。
 * 開いていれば何もしない。
 * @param {import("@playwright/test").Page} page
 * @param {string} label カテゴリ名 (「時間割」「予定・休み」など)
 */
export async function openSidebarCategory(page, label) {
  const head = page
    .locator(".sidebar")
    .getByRole("button", { name: new RegExp(label), expanded: false });
  if (await head.count()) await head.first().click();
}

/**
 * サイドバーから講習時間割作成を開く。講習は季節 (春期 / 夏期 / 冬期) ごとの時間割で、
 * 開いたときの季節は日付で決まる (次に来る講習)。season を渡せばその季節に切り替える。
 * その季節がまだ無ければ「初期値から始める」で作る (既定の 中３ / 中１・２ の project)。
 * @param {import("@playwright/test").Page} page
 * @param {{season?: "spring"|"summer"|"winter"}} [opts]
 */
export async function openKoshuBuilder(page, { season } = {}) {
  await openSidebarCategory(page, "時間割");
  await page.locator(".sidebar").getByRole("button", { name: "🧩 講習時間割作成" }).click();
  if (season) {
    const label = { spring: "春期講習", summer: "夏期講習", winter: "冬期講習" }[season];
    const button = page.getByRole("group", { name: "講習の季節" }).getByRole("button", {
      name: new RegExp(`^${label}:`),
    });
    if ((await button.getAttribute("aria-current")) !== "true") await button.click();
  }
  const generate = page.getByRole("button", { name: /自動作成/ });
  const start = page.getByRole("button", { name: "初期値から始める" });
  await generate.or(start).first().waitFor({ timeout: 30_000 });
  if (await start.isVisible()) await start.click();
  await generate.waitFor({ timeout: 30_000 });
}
