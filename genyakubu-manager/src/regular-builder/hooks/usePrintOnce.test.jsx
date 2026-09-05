// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { usePrintOnce } from "./usePrintOnce";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("usePrintOnce", () => {
  it("true にすると描画待ちの後に window.print() を呼び、afterprint で false に戻る", () => {
    vi.useFakeTimers();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const { result } = renderHook(() => usePrintOnce());
    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(print).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(50));
    expect(print).toHaveBeenCalledTimes(1);

    act(() => window.dispatchEvent(new Event("afterprint")));
    expect(result.current[0]).toBe(false);
  });

  it("印刷前に false へ戻せば print は呼ばれない", () => {
    vi.useFakeTimers();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const { result } = renderHook(() => usePrintOnce());
    act(() => result.current[1](true));
    act(() => result.current[1](false));
    act(() => vi.advanceTimersByTime(100));
    expect(print).not.toHaveBeenCalled();
  });
});
