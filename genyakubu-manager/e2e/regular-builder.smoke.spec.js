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
  await page.getByRole("button", { name: "⚠ 問題 1 件", exact: true }).click();
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

  // ── 講師リネーム: マスタ + 割当セルが追従する (全体設定モーダルの
  // 👤 講師 タブ) ──
  await page.getByRole("button", { name: "⚙ 全体設定" }).click();
  await page.getByRole("tab", { name: "👤 講師" }).click();
  await page
    .locator('button[title^="クリックで名前を変更"]')
    .filter({ hasText: "田中" })
    .click();
  await page.getByLabel("田中 の新しい名前").fill("田仲");
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("「田中」→「田仲」に変更しました（割当セル 2 件も更新）")
  ).toBeVisible();
  await page.getByRole("button", { name: "全体設定を閉じる" }).click();
  await expect(cellS1).toContainText("田仲");

  // ── 時限行ヘッダの一括クリア (確認ダイアログ付き・Undo 可) ──
  await page
    .locator("th", { hasText: "1限" })
    .first()
    .click({ button: "right" });
  await page.getByRole("menu").getByText("🗑️ 一括クリア (2 コマ)").click();
  await page.getByRole("button", { name: "クリアする" }).click();
  await expect(page.getByText("2 コマをクリアしました")).toBeVisible();
  await expect(cellS1).not.toContainText("数学");
  // 重複セルが消えたのでバッジは「問題なし」に戻る
  await expect(
    page.getByRole("button", { name: "✓ 問題なし", exact: true })
  ).toBeVisible();
});

test("講師NG の登録 → 検出 → 承認と、上限付き集計パネルが動く", async ({
  page,
}) => {
  await page.goto("/genekibu-kanri/");
  await expect(page.getByRole("button", { name: "⚙ 全体設定" })).toBeVisible({
    timeout: 30_000,
  });

  // ── 全体設定 (🚫 NG・上限 タブ) で 山田 の 火曜終日 NG と
  // 田中 の週上限 1 を登録 ──
  await page.getByRole("button", { name: "⚙ 全体設定" }).click();
  await page.getByRole("tab", { name: "🚫 NG・上限" }).click();
  await page.getByLabel("NG を設定する講師").selectOption("山田");
  // 曜日はトグル群 (複数選択可)。時間帯は既定の「終日」のまま
  const ngDays = page.getByRole("group", { name: "NG の曜日 (複数選択)" });
  await ngDays.getByRole("button", { name: "火", exact: true }).click();
  await page.getByRole("button", { name: "+ NG 追加" }).click();
  await expect(page.getByText("🚫 山田: 火・終日")).toBeVisible();

  await page.getByLabel("上限を設定する講師").selectOption("田中");
  await page.getByLabel("週の上限コマ数").fill("1");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.getByText("📏 田中: 週1")).toBeVisible();
  await page.getByRole("button", { name: "全体設定を閉じる" }).click();

  // ── NG 違反が検出される: 火1限 S = 国語/山田 (既存の重複 1 + NG 1) ──
  await page.getByRole("button", { name: "⚠ 問題 2 件", exact: true }).click();
  await expect(page.getByText(/山田 NG \(終日\)/)).toBeVisible();

  // NG セルへジャンプ → 火曜へ切り替わり ⚠️NG バッジのセルが光る
  await page
    .locator("div", { hasText: /^⚠ 火 講師 山田 NG/ })
    .getByRole("button", { name: "→ 表示" })
    .click();
  const ngCell = page.getByRole("button", { name: "火 1限 中3 S を編集" });
  await expect(ngCell).toContainText("⚠️NG");
  // フラッシュ終了 (= smooth スクロール完了後) を待ってから右クリックする
  // (スクロール中に開いたメニューはスクロールイベントで閉じるため)
  await expect(page.locator("td.animate-pulse")).toHaveCount(0, {
    timeout: 5_000,
  });

  // 右クリックメニューから承認 → バッジが 1 件に減る
  await ngCell.click({ button: "right" });
  await page.getByRole("menu").getByText("✅ この問題を承認 (1 件)").click();
  await expect(page.getByText("1 件の問題を承認しました")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "⚠ 問題 1 件", exact: true })
  ).toBeVisible();

  // ── 📊 集計パネル: 田中は月2コマで週上限 1 を超過 (2/1 赤字) ──
  await page.getByRole("button", { name: "📊 集計" }).click();
  const summary = page.locator("table", { hasText: "週計" });
  const tanakaRow = summary.locator("tr", { hasText: "田中" });
  await expect(tanakaRow).toContainText("2/1");
  await expect(tanakaRow.locator("td[title*='週上限 1 コマを超過']")).toBeVisible();
  const yamadaRow = summary.locator("tr", { hasText: "山田" });
  await expect(yamadaRow).toContainText("1");
});

test("強調表示 (講師/教室)・週間ミニビュー・📅 週表示が動く", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  const highlight = page.getByLabel("強調表示する講師・教室");
  await expect(highlight).toBeVisible({ timeout: 30_000 });

  // ── 講師で強調 → 週間ミニビューが開き、エントリでセルへジャンプ ──
  await highlight.selectOption("t:田中");
  await expect(page.getByText(/👁 田中 の週間（計 2 コマ/)).toBeVisible();
  await page.getByRole("button", { name: /18:00-18:45 中3 S 数学/ }).click();
  await expect(page.locator("td.animate-pulse")).toHaveCount(1);
  await expect(page.locator("td.animate-pulse")).toHaveCount(0, {
    timeout: 5_000,
  });

  // ── 教室で強調: 501 (S の既定教室) のコマだけ光り、他は減光 ──
  await highlight.selectOption("r:501");
  await expect(page.getByText("👁 田中 の週間", { exact: false })).toHaveCount(0);
  // 教室側の週間ミニビュー (どの時間帯が塞がっているか) に切り替わる
  await expect(page.getByText(/👁 教室 501 の週間（計 2 コマ/)).toBeVisible();
  const cellS1 = page.getByRole("button", { name: "月 1限 中3 S を編集" });
  const cellA2 = page.getByRole("button", { name: "月 2限 中3 A を編集" });
  await expect(cellS1).toHaveClass(/ring-2/);
  await expect(cellA2).toHaveClass(/opacity-40/);
  await highlight.selectOption("");

  // ── 📅 週表示: 全曜日が縦に並び、月・火のセルが同時に見える ──
  await page.getByRole("button", { name: "📅 週表示" }).click();
  await expect(page.getByText("月曜日", { exact: true })).toBeVisible();
  await expect(page.getByText("火曜日", { exact: true })).toBeVisible();
  await expect(cellS1).toBeVisible();
  await expect(
    page.getByRole("button", { name: "火 1限 中3 S を編集" })
  ).toBeVisible();
});

test("Ctrl+C/V/Delete のキーボード操作と 📌 スナップショット (保存 → 差分 → 復元)", async ({
  page,
}) => {
  await page.goto("/genekibu-kanri/");
  const cellS1 = page.getByRole("button", { name: "月 1限 中3 S を編集" });
  await expect(cellS1).toBeVisible({ timeout: 30_000 });

  // ── 先にスナップショットを保存 ──
  await page.getByRole("button", { name: /^📌 案/ }).click();
  await page.getByRole("button", { name: "＋ 現在の状態を保存" }).click();
  await expect(
    page.getByText("スナップショット「案 1」を保存しました")
  ).toBeVisible();

  // ── キーボード: Ctrl+C → ↓ → Ctrl+V → ↑ → Delete ──
  await cellS1.click(); // 編集モード
  await page.keyboard.press("Escape"); // 表示セルへフォーカス復帰
  await page.keyboard.press("Control+c");
  await expect(page.getByText("「数学/田中」をコピーしました")).toBeVisible();
  await page.keyboard.press("ArrowDown"); // 月 2限 S へ
  await page.keyboard.press("Control+v");
  const cellS2 = page.getByRole("button", { name: "月 2限 中3 S を編集" });
  await expect(cellS2).toContainText("数学");
  await page.keyboard.press("ArrowUp"); // 月 1限 S へ戻る
  await page.keyboard.press("Delete");
  await expect(cellS1).not.toContainText("数学");

  // ── 差分: 保存時 → 現在 が ＋1 (2限に追加) / －1 (1限を削除) ──
  await page.getByRole("button", { name: "🔍 差分" }).click();
  await expect(page.getByText("＋1")).toBeVisible();
  await expect(page.getByText("－1")).toBeVisible();
  await expect(
    page.getByText(/－ 月 1限 中3 S: 数学\/田中 → 空/)
  ).toBeVisible();
  await expect(
    page.getByText(/＋ 月 2限 中3 S: 空 → 数学\/田中/)
  ).toBeVisible();

  // ── 復元: 保存時の状態に戻る ──
  await page.getByRole("button", { name: "復元", exact: true }).click();
  await page.getByRole("button", { name: "復元する" }).click();
  await expect(page.getByText("「案 1」を復元しました")).toBeVisible();
  await expect(cellS1).toContainText("数学");
  await expect(cellS2).not.toContainText("数学");
});

test("複数選択 (Ctrl/Shift+クリック) → 一括クリア → Undo が動く", async ({
  page,
}) => {
  await page.goto("/genekibu-kanri/");
  const cellS1 = page.getByRole("button", { name: "月 1限 中3 S を編集" });
  await expect(cellS1).toBeVisible({ timeout: 30_000 });
  const cellA2 = page.getByRole("button", { name: "月 2限 中3 A を編集" });

  // Ctrl+クリックでトグル → Shift+クリックで矩形 (1限 S 〜 2限 A の 4 マス)
  await cellS1.click({ modifiers: ["Control"] });
  await expect(page.getByText("1 セル選択中")).toBeVisible();
  await cellA2.click({ modifiers: ["Shift"] });
  await expect(page.getByText("4 セル選択中")).toBeVisible();

  // 一括クリア: 中身のある 2 コマ (1限 S/A) だけが対象になる
  await page.getByRole("button", { name: "🧹 クリア" }).click();
  await expect(
    page.getByText(/選択中のセル の 2 コマをクリアしますか/)
  ).toBeVisible();
  await page.getByRole("button", { name: "クリアする" }).click();
  await expect(page.getByText("2 コマをクリアしました")).toBeVisible();
  await expect(cellS1).not.toContainText("数学");
  await expect(page.getByText("セル選択中")).toHaveCount(0);

  // Ctrl+Z で 2 コマまとめて戻る
  await page.keyboard.press("Control+z");
  await expect(cellS1).toContainText("数学");

  // Esc で選択解除
  await cellS1.click({ modifiers: ["Control"] });
  await expect(page.getByText("1 セル選択中")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("セル選択中")).toHaveCount(0);
});
