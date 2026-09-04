// ─── Firebase Configuration ────────────────────────────────────────
// Initialises the Firebase app, Realtime Database, and Anonymous Auth.
// Config values are read from Vite environment variables
// (VITE_FIREBASE_*).  When these are missing the module exports
// `null` values so the app can fall back to pure-localStorage mode.

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";

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
        signInAnonymously(auth)
          .catch((err) => {
            console.warn("[firebase] anonymous sign-in failed:", err);
            authFailed = true;
          })
          .finally(finish);
      },
      (err) => {
        console.warn("[firebase] auth state error:", err);
        authFailed = true;
        finish();
      }
    );
  });
} else {
  authReady = Promise.resolve();
}

export { db, auth, authReady, authFailed, isConfigured };
