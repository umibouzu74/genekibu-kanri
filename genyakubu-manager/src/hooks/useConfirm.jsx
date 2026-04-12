/* eslint-disable react-refresh/only-export-components -- context provider pattern requires co-located exports */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Modal } from "../components/Modal";
import { S } from "../styles/common";

// ─── useConfirm ────────────────────────────────────────────────────
// Replaces window.confirm() with a promise-based Modal dialog that
// plays nicely with focus management and styling.
//
// Usage:
//   const confirm = useConfirm();
//   if (await confirm("このコマを削除しますか？")) ...

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, okLabel, cancelLabel, tone }
  const resolverRef = useRef(null);

  const confirm = useCallback((messageOrOpts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      if (typeof messageOrOpts === "string") {
        setState({
          title: "確認",
          message: messageOrOpts,
          okLabel: "OK",
          cancelLabel: "キャンセル",
          tone: "default",
        });
      } else {
        setState({
          title: messageOrOpts.title || "確認",
          message: messageOrOpts.message || "",
          okLabel: messageOrOpts.okLabel || "OK",
          cancelLabel: messageOrOpts.cancelLabel || "キャンセル",
          tone: messageOrOpts.tone || "default",
        });
      }
    });
  }, []);

  const resolve = (result) => {
    setState(null);
    resolverRef.current?.(result);
    resolverRef.current = null;
  };

  const okStyle =
    state?.tone === "danger"
      ? { ...S.btn(true), background: "#c44" }
      : S.btn(true);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.title} onClose={() => resolve(false)}>
          <div
            style={{
              fontSize: 13,
              color: "#333",
              marginBottom: 20,
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {state.message}
          </div>
          <div
            style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
          >
            <button type="button" onClick={() => resolve(false)} style={S.btn(false)}>
              {state.cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => resolve(true)}
              style={okStyle}
              autoFocus
            >
              {state.okLabel}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
