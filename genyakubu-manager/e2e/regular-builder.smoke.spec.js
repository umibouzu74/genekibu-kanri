// 通常時間割作成のスモーク E2E。
// コンテキストメニュー (コピー/貼り付け/一括クリア)・重複一覧からの
// セルジャンプ (フラッシュ表示)・Undo フィードバック toast・講師リネームの
// セル追従、という「複数コンポーネントを跨ぐ配線」を実ブラウザで通しで
// 確認する (vitest 側は純関数を個別に検証しており、ここでは UI の連結だけ)。
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // 直接 通常時間割作成 ビューで起動する (App のビュー復元と同じ経路)
    sessionStorage.setItem("genyakubu-session-view", "regular-builder");
    if (localStorage.getItem("genyakubu-regular-builder-project")) return;
    const workspace = {
      version: 2,
      activeProjectId: 1,
      projects: [
        {
          id: 1,
          version: 1,
          name: "E2E 通常",
          periods: [
            { id: 1, label: "1限", time: "18:00-18:45" },
            { id: 2, label: "2限", time: "18:55-19:40" },
          ],
          subjects: ["英語", "数学", "国語", "理科", "社会"],
          teachers: [{ name: "田中" }, { name: "山田" }],
          tabs: [
            {
              id: 1,
              name: "中3",
              grade: "中3",
              group: "",
              classes: [
                { id: 1, label: "S", room: "501" },
                { id: 2, label: "A", room: "502" },
              ],
              days: ["月", "火"],
              periodIds: [1, 2],
              schedule: {
                // 月1限: 田中 が S と A に同時に入っている (講師重複 1 件)
                "月|1|1": { subj: "数学", teacher: "田中" },
                "月|1|2": { subj: "英語", teacher: "田中" },
                "火|1|1": { subj: "国語", teacher: "山田" },
              },
            },
          ],
        },
      ],
    };
    localStorage.setItem(
      "genyakubu-regular-builder-project",
      JSON.stringify(workspace)
    );
  });
});

test("コンテキストメニュー・重複ジャンプ・Undo toast・講師リネームが通しで動く", async ({
  page,
}) => {
  await page.goto("/genekibu-kanri/");
  await expect(page.getByRole("button", { name: "⚙ 全体設定" })).toBeVisible({
    timeout: 30_000,
  });
  // ブラウザタブのタイトルにプロジェクト名が乗る
  await expect(page).toHaveTitle(/E2E 通常/);

  // ── 重複一覧 → セルへジャンプ (フラッシュ表示) ──
  await page.getByRole("button", { name: "⚠ 重複 1 件", exact: true }).click();
  await page.getByRole("button", { name: "→ 表示" }).first().click();
  // 両セルが一時ハイライトされる
  await expect(page.locator("td.animate-pulse")).toHaveCount(2);
  await expect(page.locator("td.animate-pulse")).toHaveCount(0, {
    timeout: 5_000,
  });

  // ── セルの右クリックメニュー: コピー → 貼り付け ──
  const cellS1 = page.getByRole("button", { name: "月 1限 中3 S を編集" });
  await cellS1.click({ button: "right" });
  await page.getByRole("menu").getByText("📝 コピー").click();
  await expect(page.getByText("「数学/田中」をコピーしました")).toBeVisible();

  const cellA2 = page.getByRole("button", { name: "月 2限 中3 A を編集" });
  await cellA2.click({ button: "right" });
  // 貼り付けには内容プレビューが付く
  await page.getByRole("menu").getByText("📋 貼り付け (数学/田中)").click();
  await expect(cellA2).toContainText("数学");

  // ── Undo フィードバック: 場所と「現在値 → 復元値」が toast に出る ──
  await page.keyboard.press("Control+z");
  await expect(
    page.getByText(/↩️ 元に戻す: 月 2限 中3 A: 数学\/田中 → 空/)
  ).toBeVisible();
  await expect(cellA2).not.toContainText("数学");

  // ── 講師リネーム: マスタ + 割当セルが追従する ──
  await page.getByRole("button", { name: "⚙ 全体設定" }).click();
  await page
    .locator('button[title^="クリックで名前を変更"]')
    .filter({ hasText: "田中" })
    .click();
  await page.getByLabel("田中 の新しい名前").fill("田仲");
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("「田中」→「田仲」に変更しました（割当セル 2 件も更新）")
  ).toBeVisible();
  await expect(cellS1).toContainText("田仲");
  await page.getByRole("button", { name: "⚙ 全体設定" }).click(); // パネルを閉じる

  // ── 時限行ヘッダの一括クリア (確認ダイアログ付き・Undo 可) ──
  await page
    .locator("th", { hasText: "1限" })
    .first()
    .click({ button: "right" });
  await page.getByRole("menu").getByText("🗑️ 一括クリア (2 コマ)").click();
  await page.getByRole("button", { name: "クリアする" }).click();
  await expect(page.getByText("2 コマをクリアしました")).toBeVisible();
  await expect(cellS1).not.toContainText("数学");
  // 重複セルが消えたのでバッジは「重複なし」に戻る
  await expect(
    page.getByRole("button", { name: "✓ 重複なし", exact: true })
  ).toBeVisible();
});
