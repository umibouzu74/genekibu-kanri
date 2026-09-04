/* eslint-disable react-refresh/only-export-components -- context provider pattern requires co-located exports */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

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

  // context value は安定させる。毎レンダー新しいオブジェクトだと toast が
  // 出る / 消えるたびに useToasts() の全消費者 (App・各 CRUD フック) が
  // 再レンダーされ、[toasts] を deps に持つ useCallback も作り直される
  const api = useMemo(
    () => ({
      push,
      success: (m, opts) => push(m, { ...opts, tone: "success" }),
      // 要対応のメッセージ (クラウド書込の拒否など) が席を外している間に
      // 消えないよう、エラーは長めに出す (ホバーで一時停止は ToastContainer)
      error: (m, opts) => push(m, { duration: 8000, ...opts, tone: "error" }),
      info: (m, opts) => push(m, { ...opts, tone: "info" }),
      remove,
    }),
    [push, remove]
  );

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

// Provider の外でも動く版 (無ければ null)。toast が「あれば出す」程度の
// 補助的な通知でしかないコンポーネントが、Provider 無しの単体テストで
// 描画できるようにするためのもの。通常は useToasts を使うこと。
export function useOptionalToasts() {
  return useContext(ToastContext);
}
