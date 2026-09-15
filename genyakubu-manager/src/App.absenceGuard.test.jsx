// @vitest-environment jsdom
// 欠勤組み換えの下書きは、ビューを離れる (lazy なビューがアンマウントされる)
// と無言で消えていた。App はビューから onDirtyChange で「未保存の下書きあり」
// を受け取り、別ビューへ移る前に確認を出す (サイドバー / chord / Cmd+K /
// 講師選択は全部 navigateGuarded を通る)。
// AbsenceWorkflowView 本体は差し替え、下書きの有無を報告するだけのスタブに
// する (今日の日付にどのコマがあるかに依存しないため)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { ToastProvider } from "./hooks/useToasts";
import { ConfirmProvider } from "./hooks/useConfirm";

vi.mock("./hooks/useAuth", () => ({
  useAuth: () => ({
    user: { email: "admin@example.com", isAnonymous: false },
    isAdmin: true,
    loading: false,
    signIn: vi.fn(),
    signOutAdmin: vi.fn(),
  }),
}));

vi.mock("./components/views/AbsenceWorkflowView", () => ({
  AbsenceWorkflowView: ({ onDirtyChange }) => (
    <div>
      <p>欠勤組み換えスタブ</p>
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        下書きを作る
      </button>
      <button type="button" onClick={() => onDirtyChange?.(false)}>
        下書きを消す
      </button>
    </div>
  ),
}));

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
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ToastProvider>
  );
}

async function openAbsenceFlowWithDraft() {
  renderApp();
  const nav = await screen.findByRole("navigation", { hidden: true }).catch(() => null);
  const scope = nav ? within(nav) : screen;
  fireEvent.click(scope.getAllByRole("button", { name: /^\S*\s*欠勤組み換え/ })[0]);
  await screen.findByText("欠勤組み換えスタブ");
  fireEvent.click(screen.getByRole("button", { name: "下書きを作る" }));
  return scope;
}

describe("App: 欠勤組み換えの下書きを守るビュー移動ガード", () => {
  it("下書きがあるとサイドバーの移動で確認が出て、キャンセルなら留まる", async () => {
    const scope = await openAbsenceFlowWithDraft();
    fireEvent.click(scope.getAllByRole("button", { name: /^\S*\s*ダッシュボード/ })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/欠勤組み換えの下書きが保存されていません/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("欠勤組み換えスタブ")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("欠勤組み換え");

    // OK なら移動する
    fireEvent.click(scope.getAllByRole("button", { name: /^\S*\s*ダッシュボード/ })[0]);
    const dialog2 = await screen.findByRole("dialog");
    fireEvent.click(within(dialog2).getByRole("button", { name: "破棄して移動" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ダッシュボード")
    );
    expect(screen.queryByText("欠勤組み換えスタブ")).toBeNull();
  });

  it("講師を選んで月間へ移る経路も同じ確認を通る", async () => {
    await openAbsenceFlowWithDraft();
    const teacherBtns = screen.getAllByRole("button", { name: /^[^\s]+\s*\d+(\.5)?$/ });
    expect(teacherBtns.length).toBeGreaterThan(0);
    fireEvent.click(teacherBtns[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("欠勤組み換えスタブ")).toBeInTheDocument();
  });

  it("下書きが無ければ (保存・破棄で false が来たあと) 確認なしで移動する", async () => {
    const scope = await openAbsenceFlowWithDraft();
    fireEvent.click(screen.getByRole("button", { name: "下書きを消す" }));
    fireEvent.click(scope.getAllByRole("button", { name: /^\S*\s*ダッシュボード/ })[0]);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ダッシュボード")
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
