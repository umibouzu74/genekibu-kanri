// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

vi.mock("firebase/database", () => ({
  ref: vi.fn((_db, path) => ({ __path: path })),
  onValue: vi.fn(),
  set: vi.fn(() => Promise.resolve()),
  off: vi.fn(),
}));
vi.mock("../firebase/config", () => ({
  db: { __mock: true },
  authReady: Promise.resolve(),
  isConfigured: true,
}));

import { useSyncedStorage } from "./useSyncedStorage";
import { onValue, set, off } from "firebase/database";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  set.mockImplementation(() => Promise.resolve());
  onValue.mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function flushMicrotasks() {
  // authReady.then(...) + any chained microtasks
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useSyncedStorage", () => {
  describe("Strict Mode dedup (lastLocalJsonRef)", () => {
    it("同一 JSON を連続 set しても localStorage.setItem は 1 回のみ", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem");
      const { result } = renderHook(() => useSyncedStorage("k1", []));
      act(() => {
        result.current[1]([{ id: 1 }]);
      });
      act(() => {
        result.current[1]([{ id: 1 }]);
      });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("キー順だけ違う object は stableStringify で dedup される", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem");
      const { result } = renderHook(() => useSyncedStorage("k2", {}));
      act(() => {
        result.current[1]({ a: 1, b: 2 });
      });
      act(() => {
        result.current[1]({ b: 2, a: 1 });
      });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("異なる値なら 2 回書き込まれる", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem");
      const { result } = renderHook(() => useSyncedStorage("k3", []));
      act(() => {
        result.current[1]([{ id: 1 }]);
      });
      act(() => {
        result.current[1]([{ id: 2 }]);
      });
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe("localStorage QuotaExceededError", () => {
    it('QuotaExceededError → onError(err, "quota")', () => {
      const err = new Error("quota");
      err.name = "QuotaExceededError";
      vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
        throw err;
      });
      const onError = vi.fn();
      const { result } = renderHook(() =>
        useSyncedStorage("k4", [], { onError })
      );
      act(() => {
        result.current[1]([{ id: 1 }]);
      });
      expect(onError).toHaveBeenCalledWith(err, "quota");
    });

    it("通常の Error は phase='save' として渡る", () => {
      const err = new Error("other");
      vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
        throw err;
      });
      const onError = vi.fn();
      const { result } = renderHook(() =>
        useSyncedStorage("k5", [], { onError })
      );
      act(() => {
        result.current[1]([{ id: 1 }]);
      });
      expect(onError).toHaveBeenCalledWith(err, "save");
    });
  });

  describe("Firebase 書込エラー分岐", () => {
    it('PERMISSION_DENIED → onError(err, "sync-auth")', async () => {
      const err = { code: "PERMISSION_DENIED", message: "denied" };
      set.mockImplementationOnce(() => Promise.reject(err));
      const onError = vi.fn();
      const { result } = renderHook(() =>
        useSyncedStorage("k6", [], { onError })
      );
      await act(async () => {
        result.current[1]([{ id: 1 }]);
      });
      await flushMicrotasks();
      expect(onError).toHaveBeenCalledWith(err, "sync-auth");
    });

    it('一般的な set() 失敗は phase="sync"', async () => {
      const err = new Error("boom");
      set.mockImplementationOnce(() => Promise.reject(err));
      const onError = vi.fn();
      const { result } = renderHook(() =>
        useSyncedStorage("k7", [], { onError })
      );
      await act(async () => {
        result.current[1]([{ id: 1 }]);
      });
      await flushMicrotasks();
      expect(onError).toHaveBeenCalledWith(err, "sync");
    });

    it('message が /permission.denied/ にマッチしても "sync-auth"', async () => {
      const err = new Error("Firebase: Permission denied");
      set.mockImplementationOnce(() => Promise.reject(err));
      const onError = vi.fn();
      const { result } = renderHook(() =>
        useSyncedStorage("k8", [], { onError })
      );
      await act(async () => {
        result.current[1]([{ id: 1 }]);
      });
      await flushMicrotasks();
      expect(onError).toHaveBeenCalledWith(err, "sync-auth");
    });
  });

  describe("onValue / off lifecycle", () => {
    it("mount → authReady 解決後に onValue が 1 回 attach される", async () => {
      renderHook(() => useSyncedStorage("k9", []));
      await flushMicrotasks();
      expect(onValue).toHaveBeenCalledTimes(1);
    });

    it("unmount → off が呼ばれる", async () => {
      const { unmount } = renderHook(() => useSyncedStorage("k10", []));
      await flushMicrotasks();
      unmount();
      expect(off).toHaveBeenCalled();
    });

    it("authReady 解決前に unmount すれば onValue は attach されない", async () => {
      const { unmount } = renderHook(() => useSyncedStorage("k11", []));
      unmount();
      await flushMicrotasks();
      expect(onValue).not.toHaveBeenCalled();
    });
  });

  describe("localStorage 初期ロード", () => {
    it("既存 localStorage 値をマウント時に反映する", () => {
      localStorage.setItem("k12", JSON.stringify([{ id: 99 }]));
      const { result } = renderHook(() => useSyncedStorage("k12", []));
      expect(result.current[0]).toEqual([{ id: 99 }]);
    });

    it("破損 JSON は onError(err, 'load') で通知される", () => {
      localStorage.setItem("k13", "{not-json");
      const onError = vi.fn();
      renderHook(() => useSyncedStorage("k13", [], { onError }));
      expect(onError).toHaveBeenCalledWith(expect.any(Error), "load");
    });
  });
});
