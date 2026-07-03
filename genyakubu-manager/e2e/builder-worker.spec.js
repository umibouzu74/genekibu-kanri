import { test, expect } from "@playwright/test";

// E3a: 講習時間割作成 (timetable-builder) の自動生成を実 Worker 経路で検証。
//
// vitest (jsdom) の runGenerator.test.js は sync fallback のみ通るため、
// 「new Worker() の生成 → progress/done メッセージプロトコル → UI への反映」
// は実ブラウザでしか検証できない。ここでは:
//   1. 実際に Worker が構築されたこと (sync fallback ではないこと) を spy で確認
//   2. デフォルト project (講師マスタ入り) で自動作成が完走し結果パネルが出る
//   3. 案の採用でスケジュールへ適用される
// を通しで確認する。

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // 初回オンボーディングをスキップ (E2E はガイド UI を対象にしない)
    localStorage.setItem("builder.onboarding_seen", "1");
    // 実 Worker 構築の検知 spy。sync fallback (Worker 例外時) と区別する。
    const OriginalWorker = window.Worker;
    window.__workerSpy = { constructed: 0 };
    window.Worker = function WorkerSpy(...args) {
      window.__workerSpy.constructed += 1;
      return new OriginalWorker(...args);
    };
  });
});

async function openBuilder(page) {
  await page.goto("/genekibu-kanri/");
  // サイドバーから講習時間割作成ビューへ (chord g→b より DOM 依存が少ない)
  await page.getByRole("button", { name: "🧩 講習時間割作成" }).click();
  await expect(
    page.getByRole("button", { name: /自動作成/ }),
  ).toBeVisible({ timeout: 30_000 });
}

test("自動作成が実 Worker 経由で完走し、案を採用できる", async ({ page }) => {
  await openBuilder(page);

  await page.getByRole("button", { name: /自動作成/ }).click();

  // 結果パネル (完全解でも部分解でもヘッダは出る)
  await expect(page.getByText(/自動生成の結果/)).toBeVisible({
    timeout: 90_000,
  });

  // sync fallback ではなく実 Worker が使われたことを確認
  const constructed = await page.evaluate(
    () => window.__workerSpy.constructed,
  );
  expect(constructed).toBeGreaterThan(0);

  // 案 1 を採用するとスケジュールに反映され toast が出る
  await page.getByRole("button", { name: "この案を採用" }).first().click();
  await expect(page.getByText(/案 1 を.*適用しました/)).toBeVisible();

  // スケジュール表に講師名付きのセルが埋まっている (科目 select が非空)
  const filledSubjects = await page
    .locator('select[id$="-subject"]')
    .evaluateAll((els) => els.filter((el) => el.value !== "").length);
  expect(filledSubjects).toBeGreaterThan(0);
});

test("生成中に中止すると Worker が破棄され警告 toast が出る", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // 探索が数十秒続く重い構成を仕込む: クラス数・時限数を増やし、
    // コマ数要求をほぼ満杯 + 講師を少数に絞って backtracking を多発させる。
    // maxIterations は上限 (500 万) にして自然終了を遠ざける。
    const dates = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      label: `7/${i + 14}`,
    }));
    const periods = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      label: `${i + 1}限`,
    }));
    const classes = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      label: `クラス${i + 1}`,
    }));
    const project = {
      version: 4,
      name: "e2e-cancel",
      teachers: [
        { name: "英1", subjects: ["英語"], ngSlots: [], ngClasses: [], priorityClasses: [] },
        { name: "英2", subjects: ["英語"], ngSlots: [], ngClasses: [], priorityClasses: [] },
        { name: "数1", subjects: ["数学"], ngSlots: [], ngClasses: [], priorityClasses: [] },
        { name: "数2", subjects: ["数学"], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
      activeTabId: 1,
      dates,
      periods,
      tabs: [
        {
          id: 1,
          name: "E2E",
          config: {
            classes,
            subjectCounts: { 英語: 30, 数学: 30 },
          },
          schedule: {},
        },
      ],
      subjects: ["英語", "数学"],
      subjectColors: {},
      combinedGroups: [],
      externalCounts: {},
      externalSessions: [],
      externalSessionPresets: [],
      snapshots: [],
      maxIterations: 5000000,
    };
    localStorage.setItem("builder.schedule_project", JSON.stringify(project));
  });

  await openBuilder(page);

  await page.getByRole("button", { name: /自動作成/ }).click();

  // 生成中 UI (中止ボタン) が出る
  const cancelBtn = page.getByRole("button", { name: /中止/ });
  await expect(cancelBtn).toBeVisible({ timeout: 15_000 });
  await cancelBtn.click();

  await expect(page.getByText("自動作成を中止しました")).toBeVisible();
  // 生成ボタンが通常状態に戻る (isGenerating 解除)
  await expect(
    page.getByRole("button", { name: /自動作成/ }),
  ).toBeEnabled();
  // 結果パネルは出ない
  await expect(page.getByText(/自動生成の結果/)).not.toBeVisible();
});
