import { useCallback, useEffect, useRef, useState } from "react";
import { db, authReady, isConfigured } from "../firebase/config";
import { ref, onValue, set, off } from "firebase/database";
import { stableStringify } from "../utils/stableStringify";

// ─── Pending sync activity counter ──────────────────────────────────
// Each in-flight Firebase write increments this counter. SyncStatus
// (or any other consumer) can subscribe to be notified when it changes.
let pendingWrites = 0;
const activityListeners = new Set();
const notifyActivity = () => {
  for (const fn of activityListeners) fn(pendingWrites);
};
export function subscribeSyncActivity(fn) {
  activityListeners.add(fn);
  fn(pendingWrites);
  return () => activityListeners.delete(fn);
}

// Firebase 書込 promise を pending カウンタに計上する。SyncStatus の
// 「保存中…」パルスは subscribeSyncActivity 経由でこのカウンタを見ているので、
// useSyncedStorage 以外の書込元 (timetable-builder の project 同期など) も
// これを通すとインジケータに反映される。rejection は握らず呼び出し側へ返す。
export function trackSyncActivity(promise) {
  pendingWrites++;
  notifyActivity();
  return promise.finally(() => {
    pendingWrites = Math.max(0, pendingWrites - 1);
    notifyActivity();
  });
}

// ─── helpers ────────────────────────────────────────────────────────

const isQuotaError = (err) =>
  err &&
  (err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014);

export const isPermissionError = (err) =>
  err &&
  (err.code === "PERMISSION_DENIED" ||
    err.code === "permission-denied" ||
    /permission[_ -]?denied/i.test(err.message || ""));

/** Firebase path: /appData/<key> */
const fbPath = (key) => `appData/${key}`;

// ─── 「空」と「未初期化」の区別 ──────────────────────────────────────
// RTDB は [] / {} (子がすべて空のオブジェクトも含む) を書くとノードごと
// 消し、他端末の onValue には null が届く。null を「Firebase 側が未初期化 =
// 自分の localStorage で seed する」と読むと、最後の 1 件を消した直後に
// 他端末が自分の古い配列を書き戻して削除が復活する (2026-09-04 修正)。
// そこで空の値は {__empty: "<JSON>"} のマーカーとして書き、null が届くのは
// 本当に一度も書かれていないときだけにする。マーカーの中身は元の JSON
// なので、[] と {groups: [], cohorts: []} のような形の違いもそのまま戻る。
const EMPTY_MARKER_KEY = "__empty";

/** RTDB がノードごと消してしまう値 (null / [] / {} / 子が全部空) か */
export function isServerEmpty(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.every(isServerEmpty);
  if (typeof v === "object") return Object.values(v).every(isServerEmpty);
  return false;
}

/** 書込前の変換。空なら削除されないようマーカーで包む */
export function encodeForServer(v) {
  return isServerEmpty(v) ? { [EMPTY_MARKER_KEY]: JSON.stringify(v ?? null) } : v;
}

const isEmptyMarker = (v) =>
  v != null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  typeof v[EMPTY_MARKER_KEY] === "string" &&
  Object.keys(v).length === 1;

/**
 * 受信後の変換。マーカーは元の空の値に戻す。配列のキーに RTDB が
 * オブジェクト ({0: …, 1: …}。疎な配列やコンソールで 1 件消したとき) を
 * 返した場合は配列に直す (そのまま state に入れると slots.filter が落ちて
 * 全画面クラッシュし、localStorage にも書かれてリロードで再現する)。
 */
export function decodeFromServer(serverVal, initialValue) {
  if (isEmptyMarker(serverVal)) {
    try {
      const parsed = JSON.parse(serverVal[EMPTY_MARKER_KEY]);
      if (parsed != null) return parsed;
    } catch {
      // 壊れたマーカーは下の既定の空値へ
    }
    return Array.isArray(initialValue) ? [] : {};
  }
  if (
    Array.isArray(initialValue) &&
    serverVal != null &&
    typeof serverVal === "object" &&
    !Array.isArray(serverVal)
  ) {
    return Object.values(serverVal);
  }
  return serverVal;
}

// ─── useSyncedStorage ───────────────────────────────────────────────
// Drop-in replacement for useLocalStorage that additionally syncs data
// with Firebase Realtime Database.
//
// * On mount: reads localStorage first (fast / works offline), then
//   attaches a Firebase `onValue` listener.
// * On Firebase update: if the incoming value differs from local state
//   the hook updates both React state and localStorage.
// * On local write: writes to localStorage (immediate) and Firebase
//   (may queue if offline — the SDK handles this automatically).
// * When Firebase is not configured (env vars missing) the hook falls
//   back to pure-localStorage behaviour identical to useLocalStorage.
//
// Returns: [value, setValue]
export function useSyncedStorage(key, initialValue, { migrate, onError } = {}) {
  const [value, setValue] = useState(initialValue);

  // Ref that holds the latest JSON string we wrote locally so we can
  // skip the echo when Firebase fires onValue with our own write.
  const lastLocalJsonRef = useRef(null);
  // null (未初期化) を受けて localStorage から seed するのはセッション中
  // 1 回だけ。2 回目以降の null は (旧版のタブが [] を書いた等) 無視する。
  // 繰り返し seed すると端末同士で書き戻し合いになる。
  const seededRef = useRef(false);

  // ── 1. Load from localStorage (instant, works offline) ──────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return;
      // 旧版のタブが受信したマーカーをそのまま localStorage に書いている
      // ことがあるので、読み込み時にも decode を通す
      const parsed = decodeFromServer(JSON.parse(raw), initialValue);
      const migrated = migrate ? migrate(parsed) : parsed;
      setValue(migrated);
      lastLocalJsonRef.current = stableStringify(migrated);
    } catch (err) {
      console.warn(`[useSyncedStorage] failed to load "${key}":`, err);
      onError?.(err, "load");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: key/migrate are stable across renders
  }, []);

  // ── 2. Attach Firebase listener ─────────────────────────────────
  useEffect(() => {
    if (!isConfigured || !db) return;

    let unsubscribed = false;
    const dbRef = ref(db, fbPath(key));

    authReady.then(() => {
      if (unsubscribed) return;

      onValue(
        dbRef,
        (snapshot) => {
          const serverVal = snapshot.val();

          if (serverVal == null) {
            // Firebase にこのキーが一度も書かれていない — 手元の
            // localStorage があれば seed する。migrate を通してから書き込む
            // (K5b: raw のまま seed すると旧形式が Firebase に入り、他端末が
            // 毎回 migrate し直すことになる)。空の値もマーカーとして書き、
            // 以後 null が届かないようにする。
            if (seededRef.current) {
              console.warn(
                `[useSyncedStorage] "${key}" が再び null になりました (再 seed はしません)`
              );
              return;
            }
            seededRef.current = true;
            const raw = localStorage.getItem(key);
            if (raw != null) {
              try {
                const parsed = decodeFromServer(JSON.parse(raw), initialValue);
                const migrated = migrate ? migrate(parsed) : parsed;
                set(dbRef, encodeForServer(migrated)).catch((e) =>
                  console.warn(`[useSyncedStorage] seed failed for "${key}":`, e)
                );
              } catch {
                // Ignore parse errors during seeding
              }
            }
            return;
          }
          seededRef.current = true;

          const decoded = decodeFromServer(serverVal, initialValue);
          const serverJson = stableStringify(decoded);

          // Skip if this is our own echo
          if (serverJson === lastLocalJsonRef.current) return;

          // Apply migration if needed
          const migrated = migrate ? migrate(decoded) : decoded;
          const migratedJson = stableStringify(migrated);

          // Update React state + localStorage
          setValue(migrated);
          lastLocalJsonRef.current = migratedJson;
          try {
            localStorage.setItem(key, migratedJson);
          } catch (err) {
            console.warn(`[useSyncedStorage] ls write failed "${key}":`, err);
          }
        },
        (err) => {
          console.warn(`[useSyncedStorage] onValue error "${key}":`, err);
        }
      );
    });

    return () => {
      unsubscribed = true;
      off(dbRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: key/migrate are stable across renders
  }, []);

  // ── 3. Setter: write to localStorage + Firebase ─────────────────
  const update = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        const json = stableStringify(resolved);

        // Strict Mode の updater 二重呼び出しで副作用が 2 回走らないよう、
        // 既に同じ JSON を書き込み済みならスキップする。
        if (json === lastLocalJsonRef.current) return resolved;
        lastLocalJsonRef.current = json;

        // Write to localStorage
        try {
          localStorage.setItem(key, json);
        } catch (err) {
          console.warn(`[useSyncedStorage] failed to save "${key}":`, err);
          onError?.(err, isQuotaError(err) ? "quota" : "save");
        }

        // Write to Firebase (空はマーカーで書く。上の decode と対)
        if (isConfigured && db) {
          const dbRef = ref(db, fbPath(key));
          trackSyncActivity(set(dbRef, encodeForServer(resolved))).catch((err) => {
            console.warn(`[useSyncedStorage] firebase set failed "${key}":`, err);
            onError?.(err, isPermissionError(err) ? "sync-auth" : "sync");
          });
        }

        return resolved;
      });
    },
    [key, onError]
  );

  return [value, update];
}

// ─── useSyncedStorageRaw ────────────────────────────────────────────
// Same as useSyncedStorage but stores a raw string (no JSON encoding).
// Used for simple scalar values like biweeklyBase date strings.
export function useSyncedStorageRaw(key, initialValue, { onError } = {}) {
  const [value, setValue] = useState(initialValue);
  const lastLocalRef = useRef(null);
  // JSON 版と同じく、null からの seed はセッション中 1 回だけ
  // (文字列は "" でも RTDB に残るので、null は本当に未初期化のときだけ)
  const seededRef = useRef(false);

  // ── Load from localStorage ──────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        setValue(raw);
        lastLocalRef.current = raw;
      }
    } catch (err) {
      console.warn(`[useSyncedStorageRaw] failed to load "${key}":`, err);
      onError?.(err, "load");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: key/migrate are stable across renders
  }, []);

  // ── Firebase listener ───────────────────────────────────────────
  useEffect(() => {
    if (!isConfigured || !db) return;

    let unsubscribed = false;
    const dbRef = ref(db, fbPath(key));

    authReady.then(() => {
      if (unsubscribed) return;

      onValue(
        dbRef,
        (snapshot) => {
          const serverVal = snapshot.val();

          if (serverVal == null) {
            if (seededRef.current) return;
            seededRef.current = true;
            const raw = localStorage.getItem(key);
            if (raw != null) {
              set(dbRef, raw).catch((e) =>
                console.warn(`[useSyncedStorageRaw] seed failed "${key}":`, e)
              );
            }
            return;
          }
          seededRef.current = true;

          const str = String(serverVal);
          if (str === lastLocalRef.current) return;

          setValue(str);
          lastLocalRef.current = str;
          try {
            localStorage.setItem(key, str);
          } catch (err) {
            console.warn(`[useSyncedStorageRaw] ls write failed "${key}":`, err);
          }
        },
        (err) => {
          console.warn(`[useSyncedStorageRaw] onValue error "${key}":`, err);
        }
      );
    });

    return () => {
      unsubscribed = true;
      off(dbRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: key/migrate are stable across renders
  }, []);

  // ── Setter ──────────────────────────────────────────────────────
  const update = useCallback(
    (next) => {
      setValue(next);
      lastLocalRef.current = next;

      try {
        localStorage.setItem(key, next);
      } catch (err) {
        console.warn(`[useSyncedStorageRaw] failed to save "${key}":`, err);
        onError?.(err, isQuotaError(err) ? "quota" : "save");
      }

      if (isConfigured && db) {
        const dbRef = ref(db, fbPath(key));
        trackSyncActivity(set(dbRef, next)).catch((err) => {
          console.warn(`[useSyncedStorageRaw] firebase set failed "${key}":`, err);
          onError?.(err, isPermissionError(err) ? "sync-auth" : "sync");
        });
      }
    },
    [key, onError]
  );

  return [value, update];
}
