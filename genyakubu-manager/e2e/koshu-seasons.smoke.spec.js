// 講習時間割作成の季節 (春期 / 夏期 / 冬期) の E2E (2026-10-23)。
// 季節に分ける前の project (旧キー) がその季節へ移ること、まだ無い季節をほかの
// 季節から写して始められること、リロードしても季節ごとに残ることを実ブラウザで
// 通しで確認する (vitest 側は状態の決め方・写し方・保存先を個別に検証している)。
import { test, expect } from "@playwright/test";
import { openKoshuBuilder, openSidebarCategory } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("builder.onboarding_seen", "1");
    // reload でも再実行されるので、初回だけ旧キーに置く (移した後は季節のキーにある)
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    const T = (name) => ({ name, subjects: ["英語"], ngSlots: [], ngClasses: [], priorityClasses: [] });
    const project = {
      version: 4,
      name: "e2e 冬期講習",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-12-01T00:00:00.000Z",
      teachers: [T("堀上"), T("山田")],
      activeTabId: 1,
      dates: [{ id: 1, label: "12/24(木)" }, { id: 2, label: "1/6(水)" }],
      periods: [{ id: 1, label: "1限 (13:00~13:45)" }],
      tabs: [{
        id: 1,
        name: "中3",
        config: { classes: [{ id: 1, label: "3S" }], subjectCounts: { 英語: 2 } },
        schedule: { "d1-p1-c1": { subject: "英語", teacher: "堀上" } },
      }],
      subjects: ["英語"],
      subjectColors: {},
      combinedGroups: [],
      externalCounts: {},
      externalSessions: [],
      externalSessionPresets: [],
      snapshots: [],
    };
    localStorage.setItem("builder.schedule_project", JSON.stringify(project));
  });
});

test("旧データは冬期へ移り、春期は冬期から写して始められ、リロード後も季節ごとに残る", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  await openKoshuBuilder(page, { season: "winter" });
  await expect(page.getByRole("heading", { name: "e2e 冬期講習" })).toBeVisible();
  const seasons = page.getByRole("group", { name: "講習の季節" });
  await expect(seasons.getByRole("button", { name: /^冬期講習: e2e 冬期講習/ })).toBeVisible();
  // 旧キーは季節のキーへ移して消える
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("builder.schedule_project")))
    .toBeNull();

  // 春期はまだ無い → 冬期から写して始める
  await seasons.getByRole("button", { name: /^春期講習:/ }).click();
  await expect(page.getByRole("heading", { name: /春期講習の時間割はまだありません/ })).toBeVisible();
  await page.getByRole("textbox", { name: "プロジェクト名" }).fill("e2e 春期講習");
  await page.getByRole("button", { name: /冬期講習「e2e 冬期講習」の設定を写して始める/ }).click();
  await expect(page.getByRole("heading", { name: "e2e 春期講習" })).toBeVisible();
  await expect(page.getByText(/まだ講習の日付がありません/)).toBeVisible();

  // サイドバーの子項目で冬期へ戻ると、冬期の時間割はそのまま
  await openSidebarCategory(page, "時間割");
  await page.locator(".sidebar").getByRole("button", { name: /冬期講習/ }).click();
  await expect(page.getByRole("heading", { name: "e2e 冬期講習" })).toBeVisible();

  // リロードしても冬期を開いたまま、春期も残っている
  await page.reload();
  await expect(page.getByRole("heading", { name: "e2e 冬期講習" })).toBeVisible({ timeout: 30_000 });
  await expect(seasons.getByRole("button", { name: /^春期講習: e2e 春期講習/ })).toBeVisible();
});
