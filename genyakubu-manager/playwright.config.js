import { defineConfig } from "@playwright/test";
import fs from "node:fs";

// E3a: 実 Worker 経路の E2E 用設定。
//
// vitest (jsdom) では WebWorker が無く runGenerator は sync fallback しか
// 通らないため、実 Chromium で new Worker() → メッセージプロトコル →
// 結果適用までを検証する (`npm run test:e2e`)。
//
// ブラウザ解決: リモート実行環境には PLAYWRIGHT_BROWSERS_PATH に
// プリインストール Chromium があるが、@playwright/test の期待 revision と
// ずれていることがあるため、シンボリックリンクを executablePath で直接
// 指定する。ローカルで `npx playwright install chromium` 済みの環境では
// このパスが無いので通常解決に落ちる。
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  // dev server + Worker を使うため直列で回す (テスト数が少ないので十分速い)
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    ...(fs.existsSync(PREINSTALLED_CHROMIUM)
      ? { launchOptions: { executablePath: PREINSTALLED_CHROMIUM } }
      : {}),
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173/genekibu-kanri/",
    // ローカルは起動済み dev server を再利用 (高速)。CI では常に自前起動
    // (5173 に別物が居ても誤対象でテストしないための慣習)。
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
