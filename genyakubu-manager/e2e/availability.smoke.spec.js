// 出勤可能調査 (講習時間割作成 ⚙ 設定 → 🙋) の E2E。
// 回答を付ける → × が NG としてセルの講師プルダウンに効く → 一覧の人数 →
// リロード後も残る、を実ブラウザで通しで確認する (vitest 側は reducer /
// 紙面の組み立て / パネルを個別に検証している)。あわせて、講習側だけに当てた
// 罫線の土台 (tailwind.css の .koshu-builder) が効いていることも見る。
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("builder.onboarding_seen", "1");
    // reload でも再実行されるので、autosave された編集を消さないよう未存在時のみ
    if (localStorage.getItem("builder.schedule_project")) return;
    const T = (name, subjects) => ({ name, subjects, ngSlots: [], ngClasses: [], priorityClasses: [] });
    const project = {
      version: 4,
      name: "e2e-availability",
      teachers: [T("堀上", ["英語"]), T("山田", ["英語"])],
      activeTabId: 1,
      dates: [{ id: 1, label: "7/29(水)" }, { id: 2, label: "7/30(木)" }],
      periods: [{ id: 1, label: "1限 (13:00~13:45)" }, { id: 2, label: "2限 (13:55~14:40)" }],
      tabs: [{
        id: 1,
        name: "中3",
        config: { classes: [{ id: 1, label: "3S" }], subjectCounts: { 英語: 2 } },
        schedule: { "d1-p1-c1": { subject: "英語" } },
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

test("回答を付けると × が NG になり、一覧に人数が出て、リロード後も残る", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  await page.getByRole("button", { name: "🧩 講習時間割作成" }).click();
  await expect(page.getByRole("button", { name: /自動作成/ })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "⚙️ 設定" }).click();
  await page.getByRole("tab", { name: "🙋 出勤可能調査" }).click();

  // 山田: 7/29 1限 を ×、7/29 2限 を ○
  await page.getByRole("button", { name: /^山田/ }).click();
  await page.getByRole("radio", { name: "× 出られない" }).click();
  await page.getByRole("button", { name: "7/29(水) 13:00-13:45: 未記入" }).click();
  await page.getByRole("radio", { name: "○ 出られる" }).click();
  await page.getByRole("button", { name: "7/29(水) 13:55-14:40: 未記入" }).click();
  await expect(page.getByRole("button", { name: "7/29(水) 13:00-13:45: × 出られない" })).toBeVisible();

  // 一覧: 7/29 2限 に出られる人は 1 名 (山田)
  await page.getByRole("tab", { name: "👀 誰が入れるか" }).click();
  await page.getByRole("button", { name: "7/29(水) 13:55-14:40 に出られる人: 1 名" }).click();
  await expect(page.getByText("山田(英語)")).toBeVisible();

  // 時間割のセル (7/29 1限 3S): 山田 は (NG:調査) で選べない
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  const teacherSelect = page.locator("#select-1-1-1-teacher");
  await expect(teacherSelect.locator("option", { hasText: "山田 (NG:調査)" })).toBeDisabled();

  // 罫線の土台: 講習側のセル枠 (border) が実際に描かれている
  const style = await page.locator("#select-1-1-1-cell > div").evaluate((el) => getComputedStyle(el).borderTopStyle);
  expect(style).toBe("solid");

  // リロード後も回答が残る (autosave)
  await page.reload();
  await page.getByRole("button", { name: "🧩 講習時間割作成" }).click();
  await page.getByRole("button", { name: "⚙️ 設定" }).click();
  await page.getByRole("tab", { name: "🙋 出勤可能調査" }).click();
  await page.getByRole("button", { name: /^山田/ }).click();
  await expect(page.getByRole("button", { name: "7/29(水) 13:00-13:45: × 出られない" })).toBeVisible();
});
