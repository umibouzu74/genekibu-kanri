import { useCallback, useEffect, useRef, useState } from "react";
import { db, authReady, isConfigured } from "../firebase/config";
import { ref, onValue, set, off } from "firebase/database";

// ─── helpers ────────────────────────────────────────────────────────

const isQuotaError = (err) =>
  err &&
  (err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014);

/** Firebase path: /appData/<key> */
const fbPath = (key) => `appData/${key}`;

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

  // ── 1. Load from localStorage (instant, works offline) ──────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return;
      const parsed = JSON.parse(raw);
      const migrated = migrate ? migrate(parsed) : parsed;
      setValue(migrated);
      lastLocalJsonRef.current = JSON.stringify(migrated);
    } catch (err) {
      console.warn(`[useSyncedStorage] failed to load "${key}":`, err);
      onError?.(err, "load");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            // Firebase is empty for this key — seed from localStorage
            // if we have local data.
            const raw = localStorage.getItem(key);
            if (raw != null) {
              try {
                const parsed = JSON.parse(raw);
                set(dbRef, parsed).catch((e) =>
                  console.warn(`[useSyncedStorage] seed failed for "${key}":`, e)
                );
              } catch {
                // Ignore parse errors during seeding
              }
            }
            return;
          }

          const serverJson = JSON.stringify(serverVal);

          // Skip if this is our own echo
          if (serverJson === lastLocalJsonRef.current) return;

          // Apply migration if needed
          const migrated = migrate ? migrate(serverVal) : serverVal;
          const migratedJson = JSON.stringify(migrated);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 3. Setter: write to localStorage + Firebase ─────────────────
  const update = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        const json = JSON.stringify(resolved);
        lastLocalJsonRef.current = json;

        // Write to localStorage
        try {
          localStorage.setItem(key, json);
        } catch (err) {
          console.warn(`[useSyncedStorage] failed to save "${key}":`, err);
          onError?.(err, isQuotaError(err) ? "quota" : "save");
        }

        // Write to Firebase
        if (isConfigured && db) {
          const dbRef = ref(db, fbPath(key));
          set(dbRef, resolved).catch((err) => {
            console.warn(`[useSyncedStorage] firebase set failed "${key}":`, err);
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
export function useSyncedStorageRaw(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const lastLocalRef = useRef(null);

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            const raw = localStorage.getItem(key);
            if (raw != null) {
              set(dbRef, raw).catch((e) =>
                console.warn(`[useSyncedStorageRaw] seed failed "${key}":`, e)
              );
            }
            return;
          }

          const str = String(serverVal);
          if (str === lastLocalRef.current) return;

          setValue(str);
          lastLocalRef.current = str;
          try {
            localStorage.setItem(key, str);
          } catch {
            // ignore
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      }

      if (isConfigured && db) {
        const dbRef = ref(db, fbPath(key));
        set(dbRef, next).catch((err) => {
          console.warn(`[useSyncedStorageRaw] firebase set failed "${key}":`, err);
        });
      }
    },
    [key]
  );

  return [value, update];
}
