// 講習時間割作成: 通常授業との講師の時間被り (2026-11-13) の E2E。
// 本体 (App) の時間割が講習の画面まで届いて NG として見えること、自動作成 (実 Worker。
// worker は本体のデータを持たないので、メイン側で解いたものを渡す) が通常授業と
// 重なる時限にその講師を入れないことを、実ブラウザで通しで確認する
// (vitest 側は導出・合流・各画面を個別に検証している)。
import { test, expect } from "@playwright/test";
import { openKoshuBuilder } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("builder.onboarding_seen", "1");
    // 本体: 3学期の時間割と、片岡の水曜 19:55-20:55 (附中1 数学)
    localStorage.setItem(
      "genyakubu-timetables",
      JSON.stringify([
        { id: 4, name: "3学期", type: "regular", startDate: "2027-01-08", endDate: null, grades: [] },
      ])
    );
    localStorage.setItem(
      "genyakubu-slots",
      JSON.stringify([
        {
          id: 1, timetableId: 4, day: "水", time: "19:55-20:55", grade: "附中1", cls: "-",
          room: "601", subj: "数学", teacher: "片岡", note: "",
        },
      ])
    );
    // 講習: 1/13 (水) と 1/14 (木)、2限 19:10〜20:10 が片岡の通常授業と重なる
    const T = (name) => ({ name, subjects: ["数学"], ngSlots: [], ngClasses: [], priorityClasses: [] });
    const project = {
      version: 4,
      name: "e2e 直前ポイント演習",
      createdAt: "2026-11-13T00:00:00.000Z",
      updatedAt: "2026-11-13T00:00:00.000Z",
      // 福江は「控えめ」(最後に試す)。通常授業を見ていなければ、自動作成は 2 日とも片岡を入れる
      teachers: [T("片岡"), { ...T("福江"), usage: "reserve" }],
      activeTabId: 1,
      dates: [{ id: 1, label: "1/13(水)" }, { id: 2, label: "1/14(木)" }],
      periods: [{ id: 1, label: "2限 (19:10~20:10)" }],
      tabs: [{
        id: 1,
        name: "中3",
        config: { classes: [{ id: 1, label: "3S" }], subjectCounts: { 数学: 2 } },
        schedule: { "d1-p1-c1": { subject: "数学", teacher: "片岡" } },
      }],
      subjects: ["数学"],
      subjectColors: {},
      combinedGroups: [],
      externalCounts: {},
      externalSessions: [],
      externalSessionPresets: [],
      snapshots: [],
    };
    localStorage.setItem("builder.schedule_project.winter", JSON.stringify(project));
  });
});

test("通常授業と重なる時限が NG になり、自動作成はその講師を入れない", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  await openKoshuBuilder(page, { season: "winter" });
  await expect(page.getByRole("heading", { name: "e2e 直前ポイント演習" })).toBeVisible();

  // 1/13 (水) 2限: 入っている片岡は NG設定違反、プルダウンは (NG:通常)
  const wed = page.locator("#select-1-1-1-cell");
  await expect(wed).toContainText("NG設定違反");
  await expect(page.locator("#select-1-1-1-teacher option", { hasText: "片岡" })).toHaveText("片岡 (NG:通常)");
  // 1/14 (木) は通常授業が無いので NG ではない
  await expect(page.locator("#select-2-1-1-teacher option", { hasText: "片岡" })).not.toContainText("NG");

  // 片岡を外して自動作成 → 1/13 は福江になる (片岡は通常授業中)
  await page.locator("#select-1-1-1-teacher").selectOption("");
  await expect(wed).not.toContainText("NG設定違反");
  await page.getByRole("button", { name: /自動作成/ }).click();
  await expect(page.getByText(/自動生成の結果/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "この案を採用" }).first().click();
  await expect(page.getByText(/案 1 を.*適用しました/)).toBeVisible();
  await expect(page.locator("#select-1-1-1-teacher")).toHaveValue("福江");
  await expect(page.locator("#select-2-1-1-teacher")).toHaveValue("片岡");
  await expect(wed).not.toContainText("NG設定違反");
});
