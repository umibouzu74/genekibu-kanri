// ─── Firebase Configuration ────────────────────────────────────────
// Initialises the Firebase app, Realtime Database, and Anonymous Auth.
// Config values are read from Vite environment variables
// (VITE_FIREBASE_*).  When these are missing the module exports
// `null` values so the app can fall back to pure-localStorage mode.

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { bumpAuthGeneration, reportAuthError } from "./cloudState";

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

const isConfigured = Boolean(apiKey && authDomain && databaseURL && projectId);

let app = null;
let db = null;
let auth = null;
let authReady = null;
let authFailed = false;

// 匿名サインインは同時に 1 本だけ (起動時・ログアウト後・セッションが消えた
// ときの入り直しが重なっても、匿名ユーザを 2 つ作らない)。失敗は authFailed と
// cloudState に残し、画面 (SyncStatus・CloudReadWarning) に出す
let anonInFlight = null;
function ensureAnonymousSession() {
  if (!auth) return Promise.resolve();
  if (auth.currentUser) return Promise.resolve();
  if (!anonInFlight) {
    anonInFlight = signInAnonymously(auth)
      .then(() => {
        authFailed = false;
        reportAuthError(null);
      })
      .catch((err) => {
        console.warn("[firebase] anonymous sign-in failed:", err);
        authFailed = true;
        reportAuthError(err);
      })
      .finally(() => {
        anonInFlight = null;
      });
  }
  return anonInFlight;
}

if (isConfigured) {
  app = initializeApp({ apiKey, authDomain, databaseURL, projectId });
  db = getDatabase(app);
  auth = getAuth(app);

  // 永続化されたセッション (管理者の password ログイン) の復元を待ち、
  // 誰もサインインしていないときだけ匿名サインインする。無条件に
  // signInAnonymously を呼ぶと SDK は「今のユーザが匿名でなければ新しい
  // 匿名ユーザで置き換える」ので、リロードのたびに管理者ログインが外れ、
  // 匿名ユーザも毎回 1 つ増えていた (2026-09-04 修正)。
  // `authReady` はどちらの経路でもセッションが確定した時点で解決する。
  authReady = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (settled) return;
        unsubscribe();
        if (user) {
          finish();
          return;
        }
        ensureAnonymousSession().finally(finish);
      },
      (err) => {
        console.warn("[firebase] auth state error:", err);
        authFailed = true;
        reportAuthError(err);
        finish();
      }
    );
  });

  // 確定した後の変化を見張る (2026-10-22)。
  //   - 誰もいなくなった (管理者のログアウト・サーバ側で消えた匿名セッション) →
  //     匿名で入り直す。以前は起動時の 1 回だけで、消えたセッションのまま
  //     読み取りを拒否され続けた
  //   - ユーザが変わった → 世代を進める。RTDB は権限が無くなった瞬間 (ログアウトの
  //     間) に購読を取り消して張り直さないので、useSyncedStorage などがこれを見て
  //     張り直す
  // 管理者のログインを匿名で置き換えることはしない (ユーザがいる間は何もしない)
  authReady.then(() => {
    let lastUid = auth.currentUser?.uid ?? null;
    onAuthStateChanged(auth, (user) => {
      const uid = user?.uid ?? null;
      if (uid === lastUid) return;
      lastUid = uid;
      if (user) {
        bumpAuthGeneration();
        return;
      }
      ensureAnonymousSession();
    });
  });
} else {
  authReady = Promise.resolve();
}

export { db, auth, authReady, authFailed, isConfigured, ensureAnonymousSession };
