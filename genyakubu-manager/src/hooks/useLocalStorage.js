import { useCallback, useEffect, useState } from "react";

const isQuotaError = (err) =>
  err &&
  (err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014);

// ─── useLocalStorage ───────────────────────────────────────────────
// Persists a React state value to localStorage, with JSON
// serialization. `migrate` can transform the stored payload before it
// becomes state (useful for adding defaults to old records).
// `onError(err, phase)` is called on load/save failures so the caller
// can surface a toast.
//
// Returns: [value, setValue]
// setValue behaves like useState's setter (accepts value or updater).
export function useLocalStorage(key, initialValue, { migrate, onError } = {}) {
  const [value, setValue] = useState(initialValue);

  // Load once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return;
      const parsed = JSON.parse(raw);
      setValue(migrate ? migrate(parsed) : parsed);
    } catch (err) {
      console.warn(`[useLocalStorage] failed to load "${key}":`, err);
      onError?.(err, "load");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch (err) {
          console.warn(`[useLocalStorage] failed to save "${key}":`, err);
          onError?.(err, isQuotaError(err) ? "quota" : "save");
        }
        return resolved;
      });
    },
    [key, onError]
  );

  return [value, update];
}

// ─── useLocalStorageRaw ────────────────────────────────────────────
// Same as above but stores a raw string (for values like a date key
// that shouldn't be JSON encoded).
export function useLocalStorageRaw(key, initialValue) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(raw);
    } catch (err) {
      console.warn(`[useLocalStorageRaw] failed to load "${key}":`, err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    (next) => {
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch (err) {
        console.warn(`[useLocalStorageRaw] failed to save "${key}":`, err);
      }
    },
    [key]
  );

  return [value, update];
}
