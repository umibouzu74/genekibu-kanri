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
  // プリセット・写さない講師を確かめる画面を挟む
  await page
    .getByRole("dialog", { name: /冬期講習の設定を写して始める/ })
    .getByRole("button", { name: "この内容で始める" })
    .click();
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

test("翌年用に作り直し、日付を作ってから前の講習の時間割を N 日目 → N 日目に写す。教室を入れると見出しに出る", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  await openKoshuBuilder(page, { season: "winter" });
  await expect(page.getByRole("heading", { name: "e2e 冬期講習" })).toBeVisible();

  await page.getByRole("button", { name: "⚙️ 設定", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "⚙️ 設定メニュー" });
  await settings.getByRole("button", { name: /次の冬期講習用に作り直す/ }).click();
  const rebuild = page.getByRole("dialog", { name: "次の冬期講習用に作り直す" });
  await expect(rebuild).toContainText("今の時間割 (1 コマ) は控えとして残ります");
  await rebuild.getByLabel("作り直した後のプロジェクト名").fill("e2e 次の冬期講習");
  await rebuild.getByRole("button", { name: "作り直す" }).click();

  // 今年の日付を作る (2 日)
  await settings.getByLabel("生成 開始日").fill("2027-12-23");
  await settings.getByLabel("生成 終了日").fill("2027-12-24");
  await settings.getByRole("button", { name: "この内容でこのタブに設定" }).click();

  // 前の講習の時間割を写す (1 日目の 1限 3S 英語 堀上)
  await settings.getByRole("button", { name: /前の講習の時間割を写す/ }).click();
  const copy = page.getByRole("dialog", { name: "📋 前の講習の時間割を写す" });
  await expect(copy).toContainText("作り直す前の時間割「e2e 冬期講習」");
  await expect(copy.getByRole("status")).toContainText("1 コマを写します");
  await copy.getByRole("button", { name: "写す (1 コマ)" }).click();
  // 写したあと、コマ数の設定 (英語 2) と合わないクラスを出してから閉じる
  await expect(copy).toContainText("中3 3S: 英語 1/2 (−1)");
  await copy.getByRole("button", { name: "閉じる" }).click();

  // 教室を入れる
  const room = settings.getByLabel("クラス「3S」の教室");
  await room.fill("401");
  await room.press("Enter");
  await settings.getByRole("button", { name: "設定を閉じる" }).click();

  await expect(page.getByRole("heading", { name: "e2e 次の冬期講習" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /^3S\s*401$/ })).toBeVisible();
  // 1 日目 (12/23) の 1限 3S に科目と講師が写っている。2 日目は元に無いので空
  await expect(page.getByRole("combobox", { name: "12/23(木) 1限 (13:00~13:45) 3S の科目" })).toHaveValue("英語");
  await expect(page.getByRole("combobox", { name: "12/23(木) 1限 (13:00~13:45) 3S の講師" })).toHaveValue("堀上");
  await expect(page.getByRole("combobox", { name: "12/24(金) 1限 (13:00~13:45) 3S の科目" })).toHaveValue("");
});

test("他学年セッションを表で一括登録し、NG に当たっている割当の一覧からセルへ飛ぶ", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  await openKoshuBuilder(page, { season: "winter" });
  await page.getByRole("button", { name: "⚙️ 設定", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "⚙️ 設定メニュー" });
  await settings.getByRole("tab", { name: /講師不在・NG/ }).click();
  await settings.getByRole("button", { name: /他学年セッションを表で一括登録/ }).click();
  await settings
    .getByLabel("他学年セッションの表 (CSV)")
    .fill("講師,日付,開始,終了,メモ\n堀上・山田,12/24,12:25,13:35,予備校３限");
  await settings.getByRole("button", { name: "他学年セッションを追加 (2 件)" }).click();

  // 12/24 1限 (13:00〜) の堀上の割当が予備校３限と重なる
  const list = settings.getByRole("region", { name: "NG に当たっている割当" });
  await expect(list).toContainText("中3 12/24(木) 1限 3S 英語 堀上");
  await expect(list).toContainText("予備校３限 12:25〜13:35");
  await list.getByRole("button", { name: /のセルへ移動/ }).click();
  await expect(settings).toBeHidden();
});

