// ─── Firebase Configuration ────────────────────────────────────────
// Initialises the Firebase app, Realtime Database, and Anonymous Auth.
// Config values are read from Vite environment variables
// (VITE_FIREBASE_*).  When these are missing the module exports
// `null` values so the app can fall back to pure-localStorage mode.

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

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

  // Sign in anonymously.  The returned promise resolves once the
  // session is established — callers can await `authReady` before
  // reading/writing if they need to ensure auth is done.
  authReady = signInAnonymously(auth).catch((err) => {
    console.warn("[firebase] anonymous sign-in failed:", err);
    authFailed = true;
  });
} else {
  authReady = Promise.resolve();
}

export { db, auth, authReady, authFailed, isConfigured };
