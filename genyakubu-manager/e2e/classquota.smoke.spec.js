// §N: クラス別コマ数 (classSubjectCounts) の E2E。
// 中1・中2 を 1 タブに同居させ、UI (設定 > 科目 の ▦) から中2 クラスの
// コマ数を上書き → 自動作成が両クラスのクォータどおりに埋める → リロード
// 後も永続化されている、を実ブラウザで通しで確認する。
// (vitest 側は reducer / solver / 分析を個別に検証しており、ここでは
//  UI → 生成 → 採用 → autosave の連結だけを見る)
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("builder.onboarding_seen", "1");
    // addInitScript は reload 時にも再実行されるため、autosave された編集を
    // 消さないよう「未存在時のみ」シードする (リロード永続化の検証のため)。
    if (localStorage.getItem("builder.schedule_project")) return;
    // 9 日 × 4 時限 = クラスあたり 36 セル。中1 クォータ合計 36 (英9 数9 国8 理5 社5)。
    const dates = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, label: `7/${i + 20}` }));
    const periods = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, label: `${i + 1}限` }));
    const project = {
      version: 4,
      name: "e2e-classquota",
      teachers: [
        { name: "未定", subjects: ["英語", "数学", "国語", "理科", "社会"], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
      activeTabId: 1,
      dates,
      periods,
      tabs: [{
        id: 1,
        name: "中1・中2",
        config: {
          classes: [{ id: 1, label: "中1A" }, { id: 2, label: "中2A" }],
          subjectCounts: { 英語: 9, 数学: 9, 国語: 8, 理科: 5, 社会: 5 },
        },
        schedule: {},
      }],
      subjects: ["英語", "数学", "国語", "理科", "社会"],
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

test("クラス別コマ数を UI で設定し、自動作成がクォータどおりに埋める", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  await page.getByRole("button", { name: "🧩 講習時間割作成" }).click();
  await expect(page.getByRole("button", { name: /自動作成/ })).toBeVisible({ timeout: 30_000 });

  // 設定 > 科目 でクラス別モードを ON
  await page.getByRole("button", { name: "⚙️ 設定" }).click();
  await page.getByRole("tab", { name: "📚 科目" }).click();
  await page.getByLabel("中1・中2 のコマ数をクラス別に設定").click();

  // クラス別入力が現れ、初期値は共通値
  const eigo2 = page.getByLabel("中1・中2 中2A の 英語 コマ数");
  await expect(eigo2).toHaveValue("9");

  // 中2A を 英8 数8 国8 理6 社6 に (国語 8 は共通値のまま)
  for (const [subject, v] of [["英語", "8"], ["数学", "8"], ["理科", "6"], ["社会", "6"]]) {
    const input = page.getByLabel(`中1・中2 中2A の ${subject} コマ数`);
    await input.fill(v);
    await input.blur();
  }
  // 中1A は共通値のまま
  await expect(page.getByLabel("中1・中2 中1A の 英語 コマ数")).toHaveValue("9");

  // 合計/収容枠がクラス別に 36/36 で一致 (超過警告なし)
  await expect(page.getByLabel("中1・中2 中1A のコマ数合計 36、収容枠 36")).toBeVisible();
  await expect(page.getByLabel("中1・中2 中2A のコマ数合計 36、収容枠 36")).toBeVisible();

  // モーダルを閉じて自動作成 (解けない設定の警告が出ないこと自体も検証)
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /自動作成/ }).click();
  await expect(page.getByText(/自動生成の結果/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "この案を採用" }).first().click();
  await expect(page.getByText(/案 1 を.*適用しました/)).toBeVisible();

  // グリッドの科目 select をクラス別に集計してクォータと一致することを確認
  const counts = await page
    .locator('select[id$="-subject"]')
    .evaluateAll((els) => {
      const byClass = { 1: {}, 2: {} };
      els.forEach((el) => {
        const m = el.id.match(/^select-\d+-\d+-(\d+)-subject$/);
        if (!m || !el.value) return;
        const c = m[1];
        byClass[c][el.value] = (byClass[c][el.value] || 0) + 1;
      });
      return byClass;
    });
  expect(counts[1]).toEqual({ 英語: 9, 数学: 9, 国語: 8, 理科: 5, 社会: 5 });
  expect(counts[2]).toEqual({ 英語: 8, 数学: 8, 国語: 8, 理科: 6, 社会: 6 });

  // リロード後も設定が永続化されている (autosave)
  await page.reload();
  await page.getByRole("button", { name: "🧩 講習時間割作成" }).click();
  await page.getByRole("button", { name: "⚙️ 設定" }).click();
  await page.getByRole("tab", { name: "📚 科目" }).click();
  await expect(page.getByLabel("中1・中2 中2A の 英語 コマ数")).toHaveValue("8");
});
