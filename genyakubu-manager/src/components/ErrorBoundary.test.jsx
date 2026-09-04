// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ErrorBoundary, isChunkLoadError } from "./ErrorBoundary";

function Boom({ error }) {
  throw error;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("isChunkLoadError", () => {
  it("lazy import のチャンク取得失敗を判別する", () => {
    expect(
      isChunkLoadError(
        new TypeError("Failed to fetch dynamically imported module: https://x/assets/MonthView-abc.js")
      )
    ).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(
      isChunkLoadError(new Error("Unable to preload CSS for /genekibu-kanri/assets/tailwind-abc.css"))
    ).toBe(true);
    const named = new Error("x");
    named.name = "ChunkLoadError";
    expect(isChunkLoadError(named)).toBe(true);
  });

  it("通常の描画エラーは判別しない", () => {
    expect(isChunkLoadError(new TypeError("slots.filter is not a function"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("ErrorBoundary", () => {
  it("チャンク読込失敗は「更新されました」+ 再読込だけを出し、初期化ボタンを出さない", () => {
    render(
      <ErrorBoundary>
        <Boom error={new TypeError("Failed to fetch dynamically imported module")} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId("error-boundary-chunk")).toBeTruthy();
    expect(screen.getByText("再読込")).toBeTruthy();
    expect(screen.queryByText(/初期化/)).toBeNull();
  });

  it("app scope の通常エラーは初期化ボタンまで出す", () => {
    render(
      <ErrorBoundary>
        <Boom error={new Error("boom")} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId("error-boundary-app")).toBeTruthy();
    expect(screen.getByText("保存データを初期化して再読込")).toBeTruthy();
  });

  it("view scope は初期化ボタンを出さず、再試行で描き直す", () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error("view boom");
      return <div>復帰した</div>;
    }
    render(
      <ErrorBoundary scope="view" resetKey="dash">
        <Flaky />
      </ErrorBoundary>
    );
    expect(screen.getByTestId("error-boundary-view")).toBeTruthy();
    expect(screen.queryByText(/初期化/)).toBeNull();
    shouldThrow = false;
    fireEvent.click(screen.getByText("再試行"));
    expect(screen.getByText("復帰した")).toBeTruthy();
  });

  it("resetKey (ビュー) が変われば自動で復帰する", () => {
    function Harness() {
      const [view, setView] = useState("broken");
      return (
        <>
          <button type="button" onClick={() => setView("ok")}>
            移動
          </button>
          <ErrorBoundary scope="view" resetKey={view}>
            {view === "broken" ? <Boom error={new Error("view boom")} /> : <div>別の画面</div>}
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByTestId("error-boundary-view")).toBeTruthy();
    fireEvent.click(screen.getByText("移動"));
    expect(screen.getByText("別の画面")).toBeTruthy();
    expect(screen.queryByTestId("error-boundary-view")).toBeNull();
  });
});
