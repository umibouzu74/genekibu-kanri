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
