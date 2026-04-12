/* eslint-disable react-refresh/only-export-components -- context provider pattern requires co-located exports */
import { createContext, useCallback, useContext, useRef, useState } from "react";

// ─── Toast context ─────────────────────────────────────────────────
// A very small in-memory toast system. Kept intentionally minimal:
// no queueing, no variants other than tone; auto-dismiss after 2.5s.

const ToastContext = createContext(null);

export function ToastProvider({ children, render }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, { tone = "info", duration = 2500 } = {}) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, tone }]);
      if (duration > 0) {
        setTimeout(() => remove(id), duration);
      }
      return id;
    },
    [remove]
  );

  const api = {
    push,
    success: (m, opts) => push(m, { ...opts, tone: "success" }),
    error: (m, opts) => push(m, { ...opts, tone: "error", duration: 4500 }),
    info: (m, opts) => push(m, { ...opts, tone: "info" }),
    remove,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {render ? render(toasts, remove) : null}
    </ToastContext.Provider>
  );
}

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToasts must be used within a ToastProvider");
  return ctx;
}
