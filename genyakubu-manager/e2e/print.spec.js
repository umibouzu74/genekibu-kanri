import { test, expect } from "@playwright/test";

// E3c: 印刷出力のスモークテスト (構造検証)。
//
// 印刷は 2 系統 (リポジトリ CLAUDE.md の印刷ルール参照):
//  A. window.print() 直接系 (PrintButton): App.jsx 末尾のグローバル
//     @media print で sidebar / .no-print が消え、本文が残る。
//     ここでは print メディアエミュレーションで「消えるべきものが消え、
//     残るべきものが残る」ことを検証する (2026-07-03 に発覚した
//     トップバー操作ボタンの写り込みのような回帰を検出する)。
//  B. popup 注入系 (handlePrint): #main-content をコピーしてビュー別の
//     印刷ヘッダ (タイトル・印刷日・凡例) を動的注入する。popup の DOM に
//     ヘッダが実際に注入されることを検証する。
//
// ピクセル比較 (VRT) はフォント環境差で flaky になるため導入しない
// (ROADMAP E3c の判断メモ参照)。

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("builder.onboarding_seen", "1");
  });
});

// 紙面 (A4 縦) の幅 ≒ 210mm - @page margin 8mm×2 = 194mm ≒ 733 CSS px。
// 印刷時のメディアクエリは「画面幅」ではなく「紙面幅」で評価されるため、
// デスクトップ幅のまま emulateMedia('print') しただけでは
// @media (min-width: 769px) 前提の回帰 (下の「紙面が暗くならない」) を
// 取りこぼす。紙面幅を再現したいテストはこの幅にビューポートを合わせる。
const PRINT_PAGE_WIDTH = 733;

// ダッシュボードの時間割グリッド (.excel-grid-sections) を見るテスト用の
// 固定日。祝日 (デモデータの holidays) に当たると「本日休講」に切り替わって
// グリッドが描画されないため、実行日に依存しないよう時計を固定する。
// 2026-09-17 は木曜で祝日でない。
const GRID_DAY = new Date("2026-09-17T10:00:00+09:00");

// print メディアで、印刷に出ないはずの要素が全て消えていることを確認する。
async function expectPrintChromeHidden(page) {
  await expect(page.locator(".sidebar")).toBeHidden();
  // .no-print が 1 つでも表示状態で残っていたら NG (写り込み回帰の検出)
  const visibleNoPrint = await page
    .locator(".no-print")
    .evaluateAll((els) =>
      els.filter((el) => getComputedStyle(el).display !== "none").length
    );
  expect(visibleNoPrint).toBe(0);
  // 紙面を覆う不透明・半透明のオーバレイが残っていないこと。
  // サイドバーの backdrop (rgba(0,0,0,.4)) が紙面全体に乗って出力が
  // 暗くなる不具合の回帰ガード。
  const overlays = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed") continue;
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const bg = cs.backgroundColor;
      // 透明 (rgba(...,0) / transparent) なら紙面を汚さない
      if (bg === "transparent" || /,\s*0\)$/.test(bg)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 300 || r.height < 300) continue;
      out.push(`${el.className || el.tagName}: ${bg}`);
    }
    return out;
  });
  expect(overlays).toEqual([]);
}

test("ダッシュボード: print で操作 UI が消え本文が残る", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  await expect(page.locator(".app-h1")).toHaveText("ダッシュボード");

  await page.emulateMedia({ media: "print" });
  await expectPrintChromeHidden(page);
  // 本文 (ビュータイトル) は残る
  await expect(page.locator(".app-h1")).toBeVisible();
});

test("印刷: サイドバー未操作 (リロード直後) でも紙面が暗くならない", async ({
  page,
}) => {
  await page.goto("/genekibu-kanri/");
  await expect(page.locator(".app-h1")).toHaveText("ダッシュボード");
  // sidebarOpen の初期値は true。view は sessionStorage から復元されるため、
  // 「サイドバーを一度も操作せずに印刷する」= backdrop が DOM に居る状態は
  // リロード直後の通常運用そのもの。まずその前提を固定する。
  await expect(page.locator(".sidebar-backdrop")).toHaveCount(1);
  // 画面 (デスクトップ幅) では backdrop は見えていない
  await expect(page.locator(".sidebar-backdrop")).toBeHidden();

  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: PRINT_PAGE_WIDTH, height: 1040 });

  // 紙面幅では @media (min-width: 769px) が効かない。それでも backdrop は
  // 紙面に出ない (出ると rgba(0,0,0,.4) が全面に乗って出力が真っ暗になる)
  await expect(page.locator(".sidebar-backdrop")).toBeHidden();
  await expectPrintChromeHidden(page);
  await expect(page.locator(".app-h1")).toBeVisible();
});

test("印刷: 用紙サイズを変えても紙面レイアウトが変わらない", async ({ page }) => {
  // レスポンシブ規則を screen 限定にしたことの回帰ガード。
  // 印刷のメディアクエリは紙面幅で評価されるので、screen を外すと
  // 「A4 縦なら 1 カラム / A3 なら 2 カラム」のように用紙で紙面が化ける。
  await page.clock.setFixedTime(GRID_DAY);
  await page.goto("/genekibu-kanri/");
  await expect(page.locator(".excel-grid-sections")).toBeVisible();
  await page.emulateMedia({ media: "print" });

  const sample = () =>
    page.evaluate(() => {
      const pick = (sel, props) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return Object.fromEntries(props.map((p) => [p, cs[p]]));
      };
      return {
        sections: pick(".excel-grid-sections", ["display", "gridTemplateColumns"]),
        h1: pick(".app-h1", ["fontSize"]),
        main: pick(".app-main", ["paddingLeft"]),
      };
    });

  await page.setViewportSize({ width: PRINT_PAGE_WIDTH, height: 1040 }); // A4 縦
  const a4 = await sample();
  await page.setViewportSize({ width: 1062, height: 1500 }); // A3 縦
  const a3 = await sample();

  expect(a4).toEqual(a3);
  // 中学/高校は紙面では必ず縦積み (popup 印刷と同じ紙面にする)
  expect(a4.sections.display).toBe("block");
});

test("イベントカレンダー: print で追加授業バッジが紙面に残る", async ({ page }) => {
  // 今月 15 日の追加授業を仕込み、visibility を ON にしておく (H1b)
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  await page.addInitScript(([ymArg]) => {
    localStorage.setItem(
      "genyakubu-extra-lessons",
      JSON.stringify([
        {
          id: 1,
          date: `${ymArg}-15`,
          time: "18:30-20:00",
          grade: "中3",
          cls: "A",
          room: "",
          subj: "プレップ個別指導",
          teacher: "香川·福江",
          label: "夏期講習",
          note: "",
        },
      ])
    );
    localStorage.setItem(
      "genyakubu-event-visibility",
      JSON.stringify({ extraLesson: true })
    );
  }, [ym]);

  await page.goto("/genekibu-kanri/");
  await page.getByRole("button", { name: /イベントカレンダー/ }).click();
  await expect(
    page.getByText(/18:30 中3A プレップ個別指導/).first()
  ).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expectPrintChromeHidden(page);
  await expect(
    page.getByText(/18:30 中3A プレップ個別指導/).first()
  ).toBeVisible();
  // 月送りボタンは消えるが、年月の見出しは紙面に残る
  await expect(
    page.getByText(`${now.getFullYear()}年${now.getMonth() + 1}月`, { exact: true })
  ).toBeVisible();
});

test("講師の個人予定 (既定は月間): print で操作 UI が消える", async ({ page }) => {
  await page.goto("/genekibu-kanri/");
  // サイドバーの講師リストから講師を選ぶ (奥村はデモデータの既定講師)
  await page.locator(".sidebar button").filter({ hasText: /^奥村/ }).first().click();
  await expect(page.locator(".app-h1")).toHaveText(/奥村/);

  await page.emulateMedia({ media: "print" });
  await expectPrintChromeHidden(page);
  await expect(page.locator(".app-h1")).toBeVisible();
});

test("タイムテーブル: popup 印刷に中学/高校のセクションヘッダが注入される", async ({
  page,
  context,
}) => {
  // popup 側の window.print() を止めて onafterprint → close を防ぐ
  await context.addInitScript(() => {
    window.print = () => {};
  });

  await page.clock.setFixedTime(GRID_DAY);
  await page.goto("/genekibu-kanri/");
  // Dashboard の既定は時間割モード (ExcelGridView)
  await expect(page.locator(".excel-grid-sections")).toBeVisible();

  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "現在のビューを印刷" }).click(),
  ]);

  // buildTimetableHeaderHtml が中学 / 高校の各セクション先頭に注入するヘッダ
  await expect(popup.locator(".excel-print-page-title").first()).toContainText(
    "中学の時間割"
  );
  await expect(popup.locator(".excel-print-page-title").nth(1)).toContainText(
    "高校の時間割"
  );
  // 対象日は和式 (E1h: formatPrintDate)
  await expect(popup.locator(".excel-print-page-title").first()).toContainText(
    /\d{4}年\d{2}月\d{2}日/
  );
  await expect(popup.locator(".excel-print-meta").first()).toContainText("印刷");
});

test("講習時間割作成: print で全列収め (横溢れなし) と日付単位の改ページが効く", async ({
  page,
}) => {
  // 「全クラス列が紙面幅に収まる」を実挙動で検証するため、列数の多いタブ
  // (中１・２ = 7クラス) を、その min-width 合計より狭い viewport で開く。
  // table-layout:fixed が無ければ横溢れする状況を作り、収まることを assert する。
  await page.setViewportSize({ width: 1000, height: 900 });

  await page.goto("/genekibu-kanri/");
  // サイドバーから講習時間割作成ビューへ (builder-worker.spec と同経路)
  await page.getByRole("button", { name: "🧩 講習時間割作成" }).click();
  await expect(page.getByRole("button", { name: /自動作成/ })).toBeVisible({
    timeout: 30_000,
  });
  // 列数の多いタブ (7クラス) へ切り替え
  await page.getByRole("tab", { name: /中１・２/ }).click();
  // スケジュール表 (.print-container) が出るまで待つ
  await expect(page.locator(".print-container table")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expectPrintChromeHidden(page);

  // (要件2) 全クラス列が紙面幅に収まる = コンテナ内で横溢れ (overflow) しない。
  // table-layout:fixed + width:100% + min-width:0 が外れると scrollWidth が
  // clientWidth を超える (=列が切れて 2 ページ目送りになる) ので、その回帰を捕捉。
  const fit = await page.locator(".print-container").evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth + 1);

  // 全日程が印刷される = アプリシェル (.app-main) のスクロールペインが
  // 印刷時に解除され、1 ページ (ビューポート高) でクリップされない。
  // 以前は .app-main{overflow:auto;height:100vh} が全内容を最初の1ページに
  // 切り落としていた (縦に長い時間割の 2 日目以降が印刷されない不具合)。
  const vscroll = await page.locator(".app-main").evaluate((el) => ({
    overflow: getComputedStyle(el).overflow,
    clips: el.scrollHeight > el.offsetHeight + 2,
  }));
  expect(vscroll.overflow).toBe("visible");
  expect(vscroll.clips).toBe(false);

  // 収める手段として table-layout: fixed が印刷時に効いていることも確認
  const tableLayout = await page
    .locator(".print-container table")
    .evaluate((el) => getComputedStyle(el).tableLayout);
  expect(tableLayout).toBe("fixed");

  // 列見出しを各ページ先頭に繰り返させるため、印刷では thead の sticky を
  // 静的化している (sticky のままだと Chromium の thead 自動繰り返しが阻害され、
  // A3縦で複数ページに跨ると 2 ページ目以降が見出し無しになる)。
  const theadPosition = await page
    .locator(".print-container thead")
    .evaluate((el) => getComputedStyle(el).position);
  expect(theadPosition).toBe("static");

  // (要件3) 1 日分 (tbody) はページ境界で分断しない (break-inside: avoid)。
  // 日付ごとに tbody.builder-day-group が分かれている前提。
  // 注: emulateMedia('print') では実ページボックスを観測できないため、ここは
  // CSS が当たっていることの検証まで。実際のページ分割が日境界に一致するかは
  // Chromium の table break-inside 対応に依存し、A3 縦 PDF の目視で担保する。
  const dayBodies = page.locator(".print-container tbody.builder-day-group");
  expect(await dayBodies.count()).toBeGreaterThan(0);
  const breakInside = await dayBodies
    .first()
    .evaluate((el) => getComputedStyle(el).breakInside);
  expect(breakInside).toBe("avoid");
});

// 通常時間割作成の紙面を、列数の違うセクション (中学部 3 列 / 高校部 8 列)
// が同居する形で検証する。時間列の幅は `table-layout: fixed` の等分に任せると
// **セクションの列数で変わる** (実測 A4 縦: 3 列で 171px / 8 列で 76px / 1 列で
// 343px) ため、曜日ごとに刷った紙で左端が揃わず、狭いほうでは時刻
// (「18:30-19:30」= 約 86px) が隣のクラス列へはみ出していた。CSS 文字列の
// 単体テスト (printStyle.test.js) では拾えない実挙動なのでここで測る。
test("通常時間割作成: 紙面の時間列が全セクションで同じ幅・時刻がはみ出さない", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("genyakubu-session-view", "regular-builder");
    const cell = { subj: "高松一文系数学", teacher: "堀上" };
    const fill = (periodIds, classIds) => {
      const out = {};
      for (const p of periodIds)
        for (const c of classIds) out[`水|${p}|${c}`] = { ...cell };
      return out;
    };
    localStorage.setItem(
      "genyakubu-regular-builder-project",
      JSON.stringify({
        version: 2,
        activeProjectId: 1,
        projects: [
          {
            id: 1,
            version: 1,
            name: "E2E 紙面",
            periods: [
              { id: 1, label: "", time: "18:00-18:45" },
              { id: 2, label: "", time: "18:55-19:40" },
              { id: 3, label: "", time: "18:30-19:30" },
              { id: 4, label: "", time: "19:40-20:40" },
            ],
            subjects: ["数学"],
            teachers: [{ name: "堀上" }],
            tabs: [
              {
                id: 1,
                name: "中3",
                grade: "中3",
                group: "中学部",
                classes: [1, 2, 3].map((id) => ({
                  id,
                  label: "SAB"[id - 1],
                  room: `50${id}`,
                })),
                days: ["水"],
                periodIds: [1, 2],
                schedule: fill([1, 2], [1, 2, 3]),
              },
              // 8 列 = 時間列が最も狭くなるセクション (高2 4 列 + 高3 4 列)
              ...[2, 3].map((tabId) => ({
                id: tabId,
                name: tabId === 2 ? "高2" : "高3",
                grade: tabId === 2 ? "高2" : "高3",
                group: "高校部・本校",
                classes: [1, 2, 3, 4].map((id) => ({
                  id,
                  label: "",
                  room: `${tabId === 2 ? 40 : 70}${id}`,
                })),
                days: ["水"],
                periodIds: [3, 4],
                schedule: fill([3, 4], [1, 2, 3, 4]),
              })),
            ],
          },
        ],
      })
    );
  });

  await page.goto("/genekibu-kanri/");
  await expect(page.locator(".regb-section")).toHaveCount(2, {
    timeout: 30_000,
  });

  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: PRINT_PAGE_WIDTH, height: 1040 });

  const measure = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".regb-section")].map((sec) => {
        const th = sec.querySelector("tbody .regb-timecol");
        const range = document.createRange();
        range.selectNodeContents(th);
        const rects = [...range.getClientRects()];
        return {
          cols: sec.querySelectorAll("thead tr")[1].children.length,
          // 見出し行の時間列 = 実際に列幅を決めているセル
          width: Math.round(
            sec
              .querySelector("thead .regb-timecol")
              .getBoundingClientRect().width
          ),
          // 時刻が 2 行に折り返していないか (= 幅が足りているか)
          lines: rects.length,
          textWidth: Math.round(Math.max(...rects.map((r) => r.width))),
          cellWidth: Math.round(th.getBoundingClientRect().width),
        };
      })
    );

  for (const compact of [false, true]) {
    if (compact) {
      // コンパクト表示は文字が小さいぶん時間列も詰める (別の固定幅)。
      // ツールバーを押すのは画面幅を戻してから (紙面幅ではモバイル扱いに
      // なり、サイドバーの backdrop がクリックを吸う)
      await page.emulateMedia({ media: "screen" });
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.getByRole("button", { name: /コンパクト/ }).click();
      await page.emulateMedia({ media: "print" });
      await page.setViewportSize({ width: PRINT_PAGE_WIDTH, height: 1040 });
    }
    const rows = await measure();
    expect(rows.map((r) => r.cols)).toEqual([3, 8]);
    // 列数が違っても時間列の幅は同じ (曜日をまたいでも同じ実寸になる)
    expect(new Set(rows.map((r) => r.width)).size).toBe(1);
    for (const r of rows) {
      // 時刻が隣のクラス列へはみ出さない (収まらなければ折り返す)
      expect(r.lines).toBe(1);
      expect(r.textWidth).toBeLessThan(r.cellWidth);
    }
  }
});

test("月次カレンダー: popup 印刷にタイトル・印刷日・凡例が注入される", async ({
  page,
  context,
}) => {
  // popup 側の window.print() を止めて onafterprint → close を防ぐ
  await context.addInitScript(() => {
    window.print = () => {};
  });

  await page.goto("/genekibu-kanri/");
  await page.locator(".sidebar button").filter({ hasText: /^奥村/ }).first().click();
  await page.getByRole("button", { name: "月間", exact: true }).click();
  await expect(page.locator(".month-print-root")).toBeVisible();

  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "現在のビューを印刷" }).click(),
  ]);

  // buildMonthHeaderHtml が注入するヘッダ 3 点セット
  await expect(popup.locator(".month-print-page-title")).toContainText("月");
  await expect(popup.locator(".month-print-page-title")).toContainText("奥村");
  await expect(popup.locator(".month-print-meta")).toContainText("印刷");
  await expect(popup.locator(".month-print-legend")).toContainText("代行");
  // 本文 (カレンダー) もコピーされている
  await expect(popup.locator(".month-print-root")).toHaveCount(1);
});

test("タイムテーブル: 全曜日まとめ印刷が曜日ごとの紙面を 1 つの popup に出す", async ({
  page,
  context,
}) => {
  // popup 側の window.print() を止めて onafterprint → close を防ぐ
  await context.addInitScript(() => {
    window.print = () => {};
  });

  await page.clock.setFixedTime(GRID_DAY);
  await page.goto("/genekibu-kanri/");
  // Dashboard の既定は時間割モード (ExcelGridView)
  await expect(page.locator(".excel-grid-sections")).toBeVisible();

  // 画面に出ている曜日 (木) を控えておく。印刷後に戻ることを確かめる。
  const activeDayBefore = await page
    .locator(".excel-print-day-body")
    .textContent();

  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "全曜日をまとめて印刷" }).click(),
  ]);

  // 曜日ブロックが複数枚 (デモデータは月〜土にコマがある)
  const days = popup.locator(".excel-print-day");
  await expect(days.first()).toBeAttached();
  expect(await days.count()).toBeGreaterThan(1);
  // 各ブロックに中学/高校のセクションヘッダが付く
  await expect(
    days.first().locator(".excel-print-page-title").first()
  ).toContainText("中学の時間割");
  // 曜日ごとに改ページ (先頭ブロックだけ auto)。改ページ規則は @media print
  // の中なので popup を print メディアにしてから読む。
  await popup.emulateMedia({ media: "print" });
  const breaks = await days.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).breakBefore)
  );
  expect(breaks[0]).toBe("auto");
  expect(breaks.slice(1).every((b) => b === "page")).toBe(true);

  // 画面側は元の曜日に戻っている (印刷用の差し替えが残らない)
  await expect(page.locator(".excel-print-day-body")).toHaveText(
    activeDayBefore
  );
});
