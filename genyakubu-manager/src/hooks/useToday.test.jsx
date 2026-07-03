// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useToday } from "./useToday";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useToday (H2c)", () => {
  it('現在日付を "YYYY-MM-DD" で返す', () => {
    vi.setSystemTime(new Date(2026, 6, 3, 12, 0, 0)); // 2026-07-03 12:00
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-07-03");
  });

  it("深夜 0 時を跨ぐと値が翌日に更新される", () => {
    vi.setSystemTime(new Date(2026, 6, 3, 23, 59, 0)); // 23:59
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-07-03");
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000); // +2 分 → 0:01 (0:00:01 のタイマーが発火)
    });
    expect(result.current).toBe("2026-07-04");
  });

  it("さらに次の日跨ぎでも再アームされて更新され続ける", () => {
    vi.setSystemTime(new Date(2026, 6, 3, 23, 59, 0));
    const { result } = renderHook(() => useToday());
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000); // → 7/4
    });
    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000); // → 7/5
    });
    expect(result.current).toBe("2026-07-05");
  });

  it("アンマウントでタイマーを掃除する", () => {
    vi.setSystemTime(new Date(2026, 6, 3, 12, 0, 0));
    const { unmount } = renderHook(() => useToday());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
