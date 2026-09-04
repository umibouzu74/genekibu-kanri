// Firebase 設定モジュールの認証初期化 (2026-09-04)。
// 永続化された管理者セッションを復元してから、誰もいないときだけ匿名
// サインインする。無条件に signInAnonymously を呼ぶとリロードのたびに
// 管理者ログインが匿名ユーザで置き換えられていた。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(() => Promise.resolve()),
}));

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({ __app: true })) }));
vi.mock("firebase/database", () => ({ getDatabase: vi.fn(() => ({ __db: true })) }));
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({ __auth: true })),
  onAuthStateChanged: authMocks.onAuthStateChanged,
  signInAnonymously: authMocks.signInAnonymously,
}));

let captured = null;
const unsubscribe = vi.fn();

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  captured = null;
  unsubscribe.mockClear();
  authMocks.signInAnonymously.mockReset();
  authMocks.signInAnonymously.mockImplementation(() => Promise.resolve());
  authMocks.onAuthStateChanged.mockReset();
  authMocks.onAuthStateChanged.mockImplementation((_auth, next, error) => {
    captured = { next, error };
    return unsubscribe;
  });
  vi.stubEnv("VITE_FIREBASE_API_KEY", "key");
  vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "x.firebaseapp.com");
  vi.stubEnv("VITE_FIREBASE_DATABASE_URL", "https://x.firebasedatabase.app");
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "x");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function loadConfig() {
  vi.resetModules();
  return import("./config");
}

describe("firebase/config の認証初期化", () => {
  it("永続化されたユーザ (管理者) が居れば匿名サインインしない", async () => {
    const mod = await loadConfig();
    expect(mod.isConfigured).toBe(true);
    expect(captured).not.toBeNull();
    captured.next({ uid: "admin", isAnonymous: false });
    await mod.authReady;
    expect(authMocks.signInAnonymously).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(mod.authFailed).toBe(false);
  });

  it("誰も居なければ匿名サインインを 1 回だけ行う", async () => {
    const mod = await loadConfig();
    captured.next(null);
    await mod.authReady;
    expect(authMocks.signInAnonymously).toHaveBeenCalledTimes(1);
    // 以後の auth 変化 (管理者ログイン / ログアウト) には反応しない
    captured.next(null);
    expect(authMocks.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("匿名サインインに失敗しても authReady は解決し authFailed が立つ", async () => {
    authMocks.signInAnonymously.mockImplementation(() =>
      Promise.reject(new Error("network"))
    );
    const mod = await loadConfig();
    captured.next(null);
    await mod.authReady;
    expect(mod.authFailed).toBe(true);
  });

  it("auth の監視自体がエラーになっても authReady は解決する", async () => {
    const mod = await loadConfig();
    captured.error(new Error("auth/internal"));
    await mod.authReady;
    expect(authMocks.signInAnonymously).not.toHaveBeenCalled();
    expect(mod.authFailed).toBe(true);
  });

  it("環境変数が無ければ何もせず authReady は即解決", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    const mod = await loadConfig();
    expect(mod.isConfigured).toBe(false);
    expect(mod.db).toBeNull();
    await mod.authReady;
    expect(authMocks.onAuthStateChanged).not.toHaveBeenCalled();
  });
});
