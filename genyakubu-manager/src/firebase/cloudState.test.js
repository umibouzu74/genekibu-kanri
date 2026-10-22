// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bumpAuthGeneration,
  clearCloudReadError,
  getAuthGeneration,
  getCloudState,
  getLastCloudRead,
  reportAuthError,
  reportCloudRead,
  reportCloudReadError,
  resetCloudStateForTest,
  subscribeAuthGeneration,
  subscribeCloudState,
} from "./cloudState";
import { LS } from "../constants/storageKeys";

beforeEach(() => {
  localStorage.clear();
  resetCloudStateForTest();
});

describe("cloudState", () => {
  it("読めたら received、読めなかったらパスごとの code。同じ報告では知らせ直さない", () => {
    const fn = vi.fn();
    const unsub = subscribeCloudState(fn);
    reportCloudReadError("appData/a", { code: "PERMISSION_DENIED" });
    reportCloudReadError("appData/a", { code: "PERMISSION_DENIED" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getCloudState().readErrors.get("appData/a")).toBe("PERMISSION_DENIED");
    reportCloudRead("appData/a");
    expect(getCloudState().received).toBe(true);
    expect(getCloudState().readErrors.size).toBe(0);
    reportCloudRead("appData/b");
    expect(fn).toHaveBeenCalledTimes(2);
    reportCloudReadError("appData/c", new Error("boom"));
    clearCloudReadError("appData/c");
    expect(getCloudState().readErrors.size).toBe(0);
    unsub();
  });

  it("最後に読めた日時を端末に残す (読めたことが無ければ null)", () => {
    expect(getLastCloudRead()).toBeNull();
    reportCloudRead("appData/a");
    expect(getLastCloudRead()).toBe(Number(localStorage.getItem(LS.lastCloudRead)));
  });

  it("ログインの失敗と回復、世代の通知", () => {
    reportAuthError({ code: "auth/network-request-failed" });
    expect(getCloudState().authError).toBe("auth/network-request-failed");
    reportAuthError(null);
    expect(getCloudState().authError).toBeNull();
    const fn = vi.fn();
    const unsub = subscribeAuthGeneration(fn);
    bumpAuthGeneration();
    expect(getAuthGeneration()).toBe(1);
    expect(fn).toHaveBeenCalledWith(1);
    unsub();
  });
});
