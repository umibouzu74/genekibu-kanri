// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ToastProvider, useToasts } from "../hooks/useToasts";
import { ToastContainer } from "./ToastContainer";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderToasts() {
  const ref = { current: null };
  function Capture() {
    ref.current = useToasts();
    return null;
  }
  render(
    <ToastProvider
      render={(toasts, dismiss) => (
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      )}
    >
      <Capture />
    </ToastProvider>
  );
  return () => ref.current;
}

describe("ToastContainer + useToasts (auto-dismiss & pause)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("duration 経過で自動的に dismiss される", () => {
    const getApi = renderToasts();
    act(() => {
      getApi().push("hello", { duration: 2500 });
    });
    expect(screen.getByText("hello")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2499);
    });
    expect(screen.getByText("hello")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("hello")).not.toBeInTheDocument();
  });

  it("hover 中は auto-dismiss が一時停止し、離脱で再開する", () => {
    const getApi = renderToasts();
    act(() => {
      getApi().push("paused", { duration: 1000 });
    });
    const toast = screen.getByText("paused").closest("[role='status']");
    // 600ms 進めてから hover 開始 → 残り 400ms
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.mouseEnter(toast);
    // hover 中はいくら時間が経っても残らない
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("paused")).toBeInTheDocument();
    // 離脱後 399ms で残存、+1ms で消失
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(screen.getByText("paused")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("paused")).not.toBeInTheDocument();
  });

  it("action.onClick が throw しても toast は dismiss される (H4)", () => {
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const getApi = renderToasts();
    const onClick = vi.fn(() => {
      throw new Error("boom");
    });
    act(() => {
      getApi().push("with action", {
        duration: 99999,
        action: { label: "実行", onClick },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "実行" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("with action")).not.toBeInTheDocument();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it("action 付き toast はカード本体クリックで閉じない", () => {
    const getApi = renderToasts();
    const onClick = vi.fn();
    act(() => {
      getApi().push("with action", {
        duration: 99999,
        action: { label: "実行", onClick },
      });
    });
    const toast = screen.getByText("with action").closest("[role='status']");
    fireEvent.click(toast);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByText("with action")).toBeInTheDocument();
  });

  it("action 付きでも ✕ ボタンで dismiss できる", () => {
    const getApi = renderToasts();
    act(() => {
      getApi().push("with action", {
        duration: 99999,
        action: { label: "実行", onClick: () => {} },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "通知を閉じる" }));
    expect(screen.queryByText("with action")).not.toBeInTheDocument();
  });
});
