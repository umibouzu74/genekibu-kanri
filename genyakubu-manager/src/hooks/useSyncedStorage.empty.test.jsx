// @vitest-environment jsdom
// 「空」と「未初期化」の区別 (2026-09-04)。RTDB は [] / {} を書くとノードごと
// 消して他端末に null を届けるので、null を「初回 seed」と読むと最後の 1 件を
// 消した直後に他端末が古い配列を書き戻して削除が復活していた。
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

import {
  useSyncedStorage,
  isServerEmpty,
  encodeForServer,
  decodeFromServer,
} from "./useSyncedStorage";
import { onValue, set } from "firebase/database";

let serverCallback = null;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  set.mockImplementation(() => Promise.resolve());
  serverCallback = null;
  onValue.mockImplementation((_ref, cb) => {
    serverCallback = cb;
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const snap = (val) => ({ val: () => val });

describe("isServerEmpty / encodeForServer / decodeFromServer", () => {
  it("RTDB がノードごと消す値を空と判定する", () => {
    expect(isServerEmpty(null)).toBe(true);
    expect(isServerEmpty([])).toBe(true);
    expect(isServerEmpty({})).toBe(true);
    expect(isServerEmpty({ groups: [], cohorts: [] })).toBe(true);
    expect(isServerEmpty([{ id: 1 }])).toBe(false);
    expect(isServerEmpty({ a: 0 })).toBe(false);
    expect(isServerEmpty("")).toBe(false);
  });

  it("空はマーカーに包み、decode で元の形に戻る", () => {
    const shapes = [[], {}, { groups: [], cohorts: [] }];
    for (const v of shapes) {
      const encoded = encodeForServer(v);
      expect(encoded).toEqual({ __empty: JSON.stringify(v) });
      expect(decodeFromServer(encoded, [])).toEqual(v);
    }
  });

  it("空でない値はそのまま通る", () => {
    const v = [{ id: 1, teacher: "堀上" }];
    expect(encodeForServer(v)).toBe(v);
    expect(decodeFromServer(v, [])).toBe(v);
  });

  it("配列キーに RTDB がオブジェクトを返したら配列に直す", () => {
    expect(decodeFromServer({ 0: { id: 1 }, 2: { id: 3 } }, [])).toEqual([
      { id: 1 },
      { id: 3 },
    ]);
    // オブジェクトのキーはそのまま
    const obj = { 堀上: "ほりかみ" };
    expect(decodeFromServer(obj, {})).toBe(obj);
  });

  it("壊れたマーカーは初期値の形の空に倒す", () => {
    expect(decodeFromServer({ __empty: "{not-json" }, [])).toEqual([]);
    expect(decodeFromServer({ __empty: "{not-json" }, {})).toEqual({});
  });
});

describe("useSyncedStorage: 空マーカー", () => {
  it("最後の 1 件を消して [] を保存すると Firebase にはマーカーを書く", async () => {
    const { result } = renderHook(() => useSyncedStorage("e1", []));
    await flushMicrotasks();
    act(() => {
      result.current[1]([{ id: 1 }]);
    });
    act(() => {
      result.current[1]([]);
    });
    expect(set).toHaveBeenLastCalledWith({ __path: "appData/e1" }, { __empty: "[]" });
    expect(result.current[0]).toEqual([]);
  });

  it("他端末の空マーカーを受けたら state と localStorage を空にする", async () => {
    localStorage.setItem("e2", JSON.stringify([{ id: 1 }]));
    const { result } = renderHook(() => useSyncedStorage("e2", []));
    await flushMicrotasks();
    expect(result.current[0]).toEqual([{ id: 1 }]);
    act(() => {
      serverCallback(snap({ __empty: "[]" }));
    });
    expect(result.current[0]).toEqual([]);
    expect(localStorage.getItem("e2")).toBe("[]");
    // マーカーを受けただけでは書き戻さない
    expect(set).not.toHaveBeenCalled();
  });

  it("自分が書いたマーカーのエコーは無視する", async () => {
    const { result } = renderHook(() => useSyncedStorage("e3", []));
    await flushMicrotasks();
    act(() => {
      result.current[1]([{ id: 1 }]);
    });
    act(() => {
      result.current[1]([]);
    });
    const spy = vi.spyOn(Storage.prototype, "setItem");
    act(() => {
      serverCallback(snap({ __empty: "[]" }));
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useSyncedStorage: null (未初期化) の seed", () => {
  it("初回の null では localStorage から 1 回だけ seed する", async () => {
    localStorage.setItem("s1", JSON.stringify([{ id: 7 }]));
    renderHook(() => useSyncedStorage("s1", []));
    await flushMicrotasks();
    act(() => {
      serverCallback(snap(null));
    });
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ __path: "appData/s1" }, [{ id: 7 }]);
    // 2 回目の null (旧版のタブが [] を書いた等) では再 seed しない
    act(() => {
      serverCallback(snap(null));
    });
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("手元が空でも seed はマーカーで書き、以後 null が届かないようにする", async () => {
    localStorage.setItem("s2", "[]");
    renderHook(() => useSyncedStorage("s2", []));
    await flushMicrotasks();
    act(() => {
      serverCallback(snap(null));
    });
    expect(set).toHaveBeenCalledWith({ __path: "appData/s2" }, { __empty: "[]" });
  });

  it("値を受け取った後の null は無視し、state を保つ (他端末の削除で復活させない)", async () => {
    const { result } = renderHook(() => useSyncedStorage("s3", []));
    await flushMicrotasks();
    act(() => {
      serverCallback(snap([{ id: 1 }]));
    });
    expect(result.current[0]).toEqual([{ id: 1 }]);
    act(() => {
      serverCallback(snap(null));
    });
    expect(set).not.toHaveBeenCalled();
    expect(result.current[0]).toEqual([{ id: 1 }]);
  });
});

describe("useSyncedStorage: 配列がオブジェクトで届く", () => {
  it("{0: …, 2: …} を配列にして state と localStorage に入れる", async () => {
    const { result } = renderHook(() => useSyncedStorage("a1", []));
    await flushMicrotasks();
    act(() => {
      serverCallback(snap({ 0: { id: 1 }, 2: { id: 3 } }));
    });
    expect(result.current[0]).toEqual([{ id: 1 }, { id: 3 }]);
    expect(JSON.parse(localStorage.getItem("a1"))).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it("旧版のタブが localStorage に書いたマーカーも読み込み時に戻す", () => {
    localStorage.setItem("a2", JSON.stringify({ __empty: "[]" }));
    const { result } = renderHook(() => useSyncedStorage("a2", [{ id: 1 }]));
    expect(result.current[0]).toEqual([]);
  });
});
