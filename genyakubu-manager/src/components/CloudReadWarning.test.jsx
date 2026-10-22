// @vitest-environment jsdom
// クラウドのデータを読めていないときの警告。読めないまま古いデータ・見本の
// データを黙って出し続けない (2026-10-22: 閲覧用の PC で代行が抜けていた)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

vi.mock("../firebase/config", () => ({ isConfigured: true }));

import { CloudReadWarning } from "./CloudReadWarning";
import {
  reportAuthError,
  reportCloudRead,
  reportCloudReadError,
  resetCloudStateForTest,
} from "../firebase/cloudState";
import { LS } from "../constants/storageKeys";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 22, 9, 0, 0));
  localStorage.clear();
  resetCloudStateForTest();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const denied = () => Object.assign(new Error("permission_denied"), { code: "PERMISSION_DENIED" });

describe("CloudReadWarning", () => {
  it("一度も読めていない端末で応答が無ければ、見本のデータだと知らせる", () => {
    render(<CloudReadWarning />);
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => vi.advanceTimersByTime(20000));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("クラウドのデータを読み込めていません");
    expect(alert.textContent).toContain("アプリに組み込まれた見本のデータ");
    expect(alert.textContent).toContain("応答がありません");
  });

  it("読めれば出さない", () => {
    render(<CloudReadWarning />);
    act(() => reportCloudRead("appData/genyakubu-slots"));
    act(() => vi.advanceTimersByTime(30000));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("読み取りを拒否されたら、最後に読めた日時と拒否されたデータを出す", () => {
    localStorage.setItem(LS.lastCloudRead, String(new Date(2026, 9, 16, 14, 2).getTime()));
    render(<CloudReadWarning />);
    act(() => {
      reportCloudReadError("appData/genyakubu-substitutions", denied());
      reportCloudReadError("appData/genyakubu-slots", denied());
    });
    // ログアウトの瞬間のような一時的な拒否ではすぐには出さない
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("2026/10/16 14:02 時点のデータ");
    expect(alert.textContent).toContain(
      "読み取りを拒否されました（PERMISSION_DENIED: genyakubu-substitutions、genyakubu-slots）"
    );
  });

  it("張り直して読めたら消える", () => {
    render(<CloudReadWarning />);
    act(() => reportCloudReadError("appData/genyakubu-slots", denied()));
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("alert")).toBeTruthy();
    act(() => reportCloudRead("appData/genyakubu-slots"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("匿名ログインに失敗したら理由 (エラーの code) を出す", () => {
    render(<CloudReadWarning />);
    act(() => reportAuthError(Object.assign(new Error("x"), { code: "auth/operation-not-allowed" })));
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("alert").textContent).toContain(
      "ログインの準備に失敗しました（auth/operation-not-allowed）"
    );
  });
});
