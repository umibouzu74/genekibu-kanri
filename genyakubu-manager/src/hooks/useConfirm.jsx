/* eslint-disable react-refresh/only-export-components -- context provider pattern requires co-located exports */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Modal } from "../components/Modal";
import { S } from "../styles/common";
import { colors } from "../styles/tokens";

// ─── useConfirm ────────────────────────────────────────────────────
// Replaces window.confirm() with a promise-based Modal dialog that
// plays nicely with focus management and styling.
//
// Usage:
//   const confirm = useConfirm();
//   if (await confirm("このコマを削除しますか？")) ...
//
// choices を渡すと、メッセージの下に選択肢 (ラジオ) を出し、OK で選んだ値を
// 返す (キャンセルは false)。defaultChoice が無ければ選ぶまで OK を押せない
// (どちらにするかを人が明示的に選ぶ削除: 時間割の削除の「コマも一緒に削除 /
// デフォルト時間割へ移す」)。
//   const how = await confirm({ title, message, choices: [{value, label, description?}] });

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, okLabel, cancelLabel, tone, choices }
  const [choice, setChoice] = useState(null);
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
        const choices = Array.isArray(messageOrOpts.choices) ? messageOrOpts.choices : null;
        setChoice(choices ? (messageOrOpts.defaultChoice ?? null) : null);
        setState({
          title: messageOrOpts.title || "確認",
          message: messageOrOpts.message || "",
          okLabel: messageOrOpts.okLabel || "OK",
          cancelLabel: messageOrOpts.cancelLabel || "キャンセル",
          tone: messageOrOpts.tone || "default",
          choices,
        });
      }
    });
  }, []);

  const resolve = (result) => {
    const value = result && state?.choices ? choice : result;
    setState(null);
    setChoice(null);
    resolverRef.current?.(value);
    resolverRef.current = null;
  };
  const needsChoice = !!state?.choices && choice == null;

  const okStyle =
    state?.tone === "danger"
      ? { ...S.btn(true), background: colors.danger }
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
          {state.choices && (
            <div
              role="radiogroup"
              aria-label={state.title}
              style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: -8, marginBottom: 20 }}
            >
              {state.choices.map((c) => (
                <label
                  key={c.value}
                  style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="confirm-choice"
                    value={c.value}
                    checked={choice === c.value}
                    onChange={() => setChoice(c.value)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span style={{ fontWeight: 700 }}>{c.label}</span>
                    {c.description && (
                      <span
                        style={{
                          display: "block",
                          fontSize: 11,
                          color: c.warn ? "#a05a00" : "#666",
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {c.description}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
          <div
            style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
          >
            <button type="button" onClick={() => resolve(false)} style={S.btn(false)}>
              {state.cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => resolve(true)}
              disabled={needsChoice}
              style={needsChoice ? { ...okStyle, opacity: 0.5, cursor: "not-allowed" } : okStyle}
              autoFocus={!state.choices}
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
