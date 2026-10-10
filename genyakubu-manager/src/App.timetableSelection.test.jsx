// @vitest-environment jsdom
// ヘッダの時間割セレクタ (集計ベースのビューの「現在の時間割」) の既定。
// 選択は端末ごとの localStorage。保存が無い端末 (初回 / 新しい端末) は固定の
// id=1 ではなく今日有効な時間割を表示し、保存がある端末は今日有効でなくても
// 勝手に切り替えない (注意書きのボタンで切り替える)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { ToastProvider } from "./hooks/useToasts";
import { ConfirmProvider } from "./hooks/useConfirm";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LS } from "./constants/storageKeys";

const TIMETABLES = [
  { id: 1, name: "1学期", type: "regular", startDate: "2026-04-01", endDate: "2026-08-31", grades: [] },
  { id: 2, name: "2学期", type: "regular", startDate: "2026-09-01", endDate: null, grades: [] },
];

beforeEach(() => {
  // Date だけを固定する (Suspense / waitFor が使うタイマーは本物のまま)
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 26, 12, 0, 0)); // 2026-09-26
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(LS.timetables, JSON.stringify(TIMETABLES));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
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

async function findSelector() {
  const select = await screen.findByTitle("表示する時間割を選択");
  // 読み込み待ち (ビューの lazy import) が終わってから見る
  await waitFor(() => expect(screen.queryByText("読み込み中...")).toBeNull(), { timeout: 10000 });
  return select;
}

describe("App の時間割セレクタ", () => {
  it("保存が無ければ今日有効な時間割 (2学期) を表示し、保存はしない", async () => {
    renderApp();
    const select = await findSelector();
    expect(select.value).toBe("2");
    expect(screen.queryByText(/で終了しています/)).toBeNull();
    // 導出した既定は保存しない (選んでいない端末は次の期にも追従する)
    expect(localStorage.getItem(LS.activeTimetableId)).toBeNull();
  });

  it("保存された選択は終了していても切り替えず、注意書きのボタンで切り替える", async () => {
    localStorage.setItem(LS.activeTimetableId, "1");
    renderApp();
    const select = await findSelector();
    expect(select.value).toBe("1");
    expect(screen.getByText(/表示中の「1学期」は 8\/31 で終了しています/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2学期 (今日有効) に切り替える" }));
    expect(select.value).toBe("2");
    expect(localStorage.getItem(LS.activeTimetableId)).toBe("2");
    expect(screen.queryByText(/で終了しています/)).toBeNull();
  });

  it("保存した時間割がもう無ければ (別の端末で削除等) 今日有効な時間割にフォールバックする", async () => {
    localStorage.setItem(LS.activeTimetableId, "7");
    renderApp();
    const select = await findSelector();
    expect(select.value).toBe("2");
  });
});
