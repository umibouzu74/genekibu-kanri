/* eslint-disable react-refresh/only-export-components -- context provider pattern requires co-located exports */
import { createContext, useCallback, useContext, useRef, useState } from "react";

// ─── Toast context ─────────────────────────────────────────────────
// 軽量なインメモリ通知。auto-dismiss / hover pause / visibility pause
// は描画コンポーネント (ToastContainer) 側に委譲し、ここでは単に
// 「toast の発行と削除」のみを担う。

const ToastContext = createContext(null);

export function ToastProvider({ children, render }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, { tone = "info", duration = 2500, action } = {}) => {
      const id = ++idRef.current;
      // action は { label, onClick } 形式。onClick の throw / 多重押下に
      // 耐える wrapper を作って toast 値に格納する。
      let consumed = false;
      const wrappedAction = action
        ? {
            label: action.label,
            onClick: () => {
              if (consumed) return;
              consumed = true;
              try {
                action.onClick();
              } catch (e) {
                // ユーザーの onClick が例外を投げても toast の dismiss は確実
                // に行う。例外は再 throw せず console に出して握る — UI 全体
                // の破壊的失敗より、Undo 失敗を黙って通知する方が安全。
                console.error("toast action onClick threw:", e);
              } finally {
                remove(id);
              }
            },
          }
        : null;
      setToasts((prev) => [
        ...prev,
        { id, message, tone, action: wrappedAction, duration },
      ]);
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
