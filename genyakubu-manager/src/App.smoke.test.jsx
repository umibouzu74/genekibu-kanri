// @vitest-environment jsdom
// App 全体のスモーク (2026-09-04)。App.jsx にはテストが無かったので、
// 「サイドバーから全ビューを開いてもクラッシュしない」ことだけを固定する。
// 各ビューの中身は個別のテストが担う。Firebase は未設定 (vite.config の
// test.env) なので localStorage だけで動く。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { ToastProvider } from "./hooks/useToasts";
import { ConfirmProvider } from "./hooks/useConfirm";
import { ErrorBoundary } from "./components/ErrorBoundary";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderApp() {
  return render(
    <ErrorBoundary>
      <ToastProvider render={() => null}>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

// サイドバーの全項目 (MENU_CONFIG の親 + 子)。ダイアログを開くもの
// (データ管理・日まるごと振替) は閲覧者には出ないか、ビューではないので除く
const VIEW_LABELS = [
  "ダッシュボード",
  "全講師一覧",
  "講師比較",
  "時間割管理",
  "休講・テスト期間・イベント",
  "イベントカレンダー",
  "講習時間割作成",
  "通常時間割作成",
  "欠勤組み換え",
  "授業管理",
  "代行確定一覧",
  "バイト管理",
  "コースマスター管理",
];

async function expectNoCrash() {
  // Suspense の読み込みが終わるまで待ち、境界のフォールバックが出ていないこと
  await waitFor(
    () => {
      expect(screen.queryByText("読み込み中...")).toBeNull();
    },
    { timeout: 10000 }
  );
  expect(screen.queryByTestId("error-boundary-view")).toBeNull();
  expect(screen.queryByTestId("error-boundary-app")).toBeNull();
  expect(screen.queryByTestId("error-boundary-chunk")).toBeNull();
}

describe("App smoke", () => {
  it("初期表示 (ダッシュボード) が描ける", async () => {
    renderApp();
    expect(await screen.findByRole("heading", { level: 1, name: /ダッシュボード/ })).toBeInTheDocument();
    await expectNoCrash();
  });

  it("サイドバーの全ビューを順に開いてもクラッシュしない", async () => {
    renderApp();
    const nav = await screen.findByRole("navigation", { hidden: true }).catch(() => null);
    const scope = nav ? within(nav) : screen;
    for (const label of VIEW_LABELS) {
      const btn = scope.getAllByRole("button", { name: new RegExp(`^\\S*\\s*${label}`) })[0];
      fireEvent.click(btn);
      await expectNoCrash();
    }
  }, 60000);

  it("講師を選ぶと月間 (既定) と週間が描ける", async () => {
    renderApp();
    await expectNoCrash();
    // 初期データ (INIT_SLOTS) の講師がサイドバーに並ぶ
    const teacherBtns = screen.getAllByRole("button", { name: /^[^\s]+\s*\d+(\.5)?$/ });
    expect(teacherBtns.length).toBeGreaterThan(0);
    fireEvent.click(teacherBtns[0]);
    await expectNoCrash();
    fireEvent.click(screen.getByRole("button", { name: "週間", exact: true }));
    await expectNoCrash();
    fireEvent.click(screen.getByRole("button", { name: "月間", exact: true }));
    await expectNoCrash();
  }, 60000);
});
