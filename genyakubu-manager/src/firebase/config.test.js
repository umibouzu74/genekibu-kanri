// Firebase 設定モジュールの認証初期化 (2026-09-04)。
// 永続化された管理者セッションを復元してから、誰もいないときだけ匿名
// サインインする。無条件に signInAnonymously を呼ぶとリロードのたびに
// 管理者ログインが匿名ユーザで置き換えられていた。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(() => Promise.resolve()),
  // getAuth が返すオブジェクト (currentUser を書き換えてログイン状態を表す)
  authObj: { __auth: true, currentUser: null },
}));

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({ __app: true })) }));
vi.mock("firebase/database", () => ({ getDatabase: vi.fn(() => ({ __db: true })) }));
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => authMocks.authObj),
  onAuthStateChanged: authMocks.onAuthStateChanged,
  signInAnonymously: authMocks.signInAnonymously,
}));

let captured = null;
const unsubscribe = vi.fn();

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  captured = null;
  unsubscribe.mockClear();
  authMocks.authObj.currentUser = null;
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

  // 2026-10-22: 確定した後も見張り、誰もいなくなったら匿名で入り直す。
  // ユーザが変わったら世代を進め、購読する側 (useSyncedStorage) が張り直す
  describe("確定した後の見張り", () => {
    let anonCount = 0;
    beforeEach(() => {
      anonCount = 0;
      // 本物と同じく、サインインが済むまで currentUser は変わらない
      authMocks.signInAnonymously.mockImplementation(() => {
        anonCount += 1;
        const n = anonCount;
        return Promise.resolve().then(() => {
          authMocks.authObj.currentUser = { uid: `anon${n}`, isAnonymous: true };
        });
      });
    });

    async function settleAsAnonymous() {
      const mod = await loadConfig();
      const cloud = await import("./cloudState");
      captured.next(null);
      await mod.authReady;
      // authReady の後に常駐の見張りが登録される (captured はそれに置き換わる)
      return { mod, cloud, watch: captured };
    }

    it("誰もいなくなったら (ログアウト・消えたセッション) 匿名で入り直す。同時に 2 本は走らせない", async () => {
      const { mod, watch } = await settleAsAnonymous();
      expect(authMocks.signInAnonymously).toHaveBeenCalledTimes(1);
      authMocks.authObj.currentUser = null;
      watch.next(null);
      // useAuth.signOutAdmin も同じ関数で入り直す。見張りの 1 本が走っている間は
      // それを待つだけ
      await mod.ensureAnonymousSession();
      expect(authMocks.signInAnonymously).toHaveBeenCalledTimes(2);
      expect(authMocks.authObj.currentUser.uid).toBe("anon2");
    });

    it("ユーザが変わったら世代を進める。管理者のログインは匿名で置き換えない", async () => {
      const { cloud, watch } = await settleAsAnonymous();
      expect(cloud.getAuthGeneration()).toBe(0);
      // 起動時と同じユーザの通知は無視する
      watch.next({ uid: "anon1", isAnonymous: true });
      expect(cloud.getAuthGeneration()).toBe(0);
      authMocks.authObj.currentUser = { uid: "admin", isAnonymous: false };
      watch.next({ uid: "admin", isAnonymous: false });
      expect(cloud.getAuthGeneration()).toBe(1);
      expect(authMocks.signInAnonymously).toHaveBeenCalledTimes(1);
    });

    it("匿名サインインの失敗は画面用の状態に残り、入り直せたら消える", async () => {
      authMocks.signInAnonymously.mockImplementationOnce(() => {
        const err = new Error("disabled");
        err.code = "auth/operation-not-allowed";
        return Promise.reject(err);
      });
      const { mod, cloud } = await settleAsAnonymous();
      expect(mod.authFailed).toBe(true);
      expect(cloud.getCloudState().authError).toBe("auth/operation-not-allowed");
      await mod.ensureAnonymousSession();
      expect(cloud.getCloudState().authError).toBeNull();
    });
  });
});
