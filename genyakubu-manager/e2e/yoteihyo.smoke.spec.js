// 予定表チェック (時間割管理 → 📑) の E2E。
// 実ブラウザで Excel を読み込む経路 (ファイル選択 → 先頭バイトで形式を判定 →
// exceljs を動的 import して .xlsx を読む → 塗りの色から休講・振替を読む) を
// 通しで確認する。突き合わせ・直す案・登録は vitest 側 (utils/yoteihyo と
// YoteihyoCheckView.test.jsx) で見ている。ここは local-only (管理者でない) なので
// 登録のボタンが出ないことまで。
import { Buffer } from "node:buffer";
import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";

const WD = "日月火水木金土";
const GRAY = "FF969696";
const YELLOW = "FFFFFF00";
const RED = "FFFF8080";

// utils/yoteihyo/testUtils.js の smallH12Sheet と同じ形の .xlsx:
// 高1 高松西高校 (月木) と 高2 古文・漢文 (木)、10〜11 月。10/12 祝日・11/9 休校の
// 行は赤、10/15 の高1 は灰色 (休講)、11/6 (金) に黄色の振替「←11/9(月)の振替→」
async function buildWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("2026 H1H2【10-11月】教員用");
  const fill = (cell, argb) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  };
  ws.getCell(2, 2).value = "2026年度 【高1・高2ゼミ】 10月～11月予定表";
  for (const { col, month } of [
    { col: 2, month: 10 },
    { col: 7, month: 11 },
  ]) {
    const c0 = col + 2;
    ws.getCell(4, col).value = `${month}月`;
    ws.getCell(5, c0).value = "高1";
    ws.getCell(5, c0 + 1).value = "高2";
    ws.getCell(7, c0).value = "高松西高校";
    ws.getCell(7, c0 + 1).value = "古文・漢文";
    const days = new Date(Date.UTC(2026, month, 0)).getUTCDate();
    for (let d = 1; d <= days; d++) {
      const r = 7 + d;
      const wd = new Date(Date.UTC(2026, month - 1, d)).getUTCDay();
      const md = `${month}-${d}`;
      ws.getCell(r, col).value = d;
      ws.getCell(r, col + 1).value = WD[wd];
      if (md === "10-12" || md === "11-9") {
        ws.mergeCells(r, c0, r, c0 + 1);
        ws.getCell(r, c0).value = md === "10-12" ? "スポーツの日" : "休校";
        fill(ws.getCell(r, c0), RED);
        continue;
      }
      if (wd === 1 || wd === 4) {
        ws.getCell(r, c0).value = "●";
        if (md === "10-15") fill(ws.getCell(r, c0), GRAY);
      }
      if (wd === 4) ws.getCell(r, c0 + 1).value = "◇";
      if (md === "11-6") {
        ws.getCell(r, c0).value = "●";
        fill(ws.getCell(r, c0), YELLOW);
        ws.getCell(r, c0 + 1).value = "←11/9(月)の振替→";
      }
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const SLOTS = [
  { id: 1, day: "月", time: "19:40-20:40", grade: "高1", cls: "", room: "701", subj: "高松西 数学", teacher: "A", note: "" },
  { id: 2, day: "木", time: "19:40-20:40", grade: "高1", cls: "", room: "701", subj: "高松西 英語", teacher: "B", note: "" },
  { id: 3, day: "木", time: "19:40-20:40", grade: "高2", cls: "", room: "702", subj: "古文漢文", teacher: "C", note: "" },
  { id: 4, day: "木", time: "20:50-21:50", grade: "高2", cls: "", room: "703", subj: "高松西 英語", teacher: "D", note: "" },
  { id: 5, day: "木", time: "19:50-20:35", grade: "中2", cls: "S", room: "601", subj: "数学", teacher: "E", note: "" },
];
const HOLIDAYS = [
  { id: 1, date: "2026-10-12", label: "スポーツの日", scope: ["全部"], targetGrades: [], subjKeywords: [] },
];

test.beforeEach(async ({ page }) => {
  // 「今日」= 2026-10-09 (金)。既定のシート選び (今年度) と「今日以降」が日付で決まる
  await page.clock.setFixedTime(new Date("2026-10-09T10:00:00+09:00"));
  await page.addInitScript(
    ({ slots, holidays }) => {
      localStorage.setItem("builder.onboarding_seen", "1");
      localStorage.setItem("genyakubu-slots", JSON.stringify(slots));
      localStorage.setItem("genyakubu-holidays", JSON.stringify(holidays));
    },
    { slots: SLOTS, holidays: HOLIDAYS }
  );
});

test("予定表 (.xlsx) を読み込むと、塗りの色から食い違う日が出る", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  await page.getByRole("button", { name: "📑 予定表チェック" }).click();
  await expect(page.locator(".app-h1")).toHaveText("予定表チェック");

  await page.getByLabel("予定表の Excel ファイル").setInputFiles({
    name: "予定表.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await buildWorkbook(),
  });
  await expect(page.getByText("読み込んだファイル: 予定表.xlsx")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("「2026 H1H2【10-11月】教員用」を照合に使う")).toBeChecked();

  const cards = page.getByRole("region", { name: /の食い違い$/ });
  await expect(cards).toHaveCount(3);
  // 10/15: 灰色 = 休講。高1 だけ止める案 (木曜の高2・中2 は残す)
  const oct15 = page.getByRole("region", { name: "10/15(木) の食い違い" });
  await expect(oct15.getByText("予定表: 休講 (灰色)", { exact: false })).toBeVisible();
  await expect(oct15.getByText("高校部 高1", { exact: true })).toBeVisible();
  // 11/9: 休校の行 (赤) の文字を休講日の名前に
  await expect(page.getByRole("region", { name: "11/9(月) の食い違い" }).getByText(/休講日「休校」/)).toBeVisible();
  // 11/6: 黄色の振替。注記から振替元を読む
  await expect(
    page.getByRole("region", { name: "11/6(金) の食い違い" }).getByText("11/9(月) の授業をこの日へ振り替える登録がありません。")
  ).toBeVisible();

  // 管理者でなければ登録のボタンは出さない
  await expect(page.getByText("直す案の登録には管理者ログインが必要です。")).toBeVisible();
  await expect(page.getByRole("button", { name: "この日の案を登録" })).toHaveCount(0);
});
