// Renders the list of active toasts in a fixed container above all
// other content. Consumed from useToasts().
//
// 各 toast は ToastItem サブコンポーネントとして個別の auto-dismiss
// タイマーを持つ。マウスホバー中・タブ非アクティブ中はタイマーを
// 一時停止し、復帰時に「残り時間」から再開する。
import { useEffect, useRef, useState } from "react";
import { colors } from "../styles/tokens";

const TONE_STYLES = {
  success: { bg: colors.successSoft, fg: colors.success, border: colors.successBorder },
  error: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerBorder },
  info: { bg: colors.infoSoft, fg: colors.info, border: colors.infoBorder },
};

function ToastItem({ toast, onDismiss }) {
  const { id, message, tone, action, duration } = toast;
  const s = TONE_STYLES[tone] || TONE_STYLES.info;
  const hasAction = !!action;

  const [hoverPaused, setHoverPaused] = useState(false);
  const [docHidden, setDocHidden] = useState(
    typeof document !== "undefined" ? document.hidden : false
  );
  const paused = hoverPaused || docHidden;

  // タブ可視性の変化で hidden を追跡 (M6)
  useEffect(() => {
    const onVis = () => setDocHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // auto-dismiss タイマー: paused のあいだは setTimeout を張らず、
  // 残り時間を remainingRef に保存して unpause 時に再開する。
  const remainingRef = useRef(duration);
  useEffect(() => {
    if (duration <= 0) return undefined;
    if (paused) return undefined;
    const startedAt = Date.now();
    const handle = setTimeout(() => onDismiss(id), remainingRef.current);
    return () => {
      clearTimeout(handle);
      const elapsed = Date.now() - startedAt;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };
  }, [paused, duration, id, onDismiss]);

  return (
    <div
      role="status"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onClick={hasAction ? undefined : () => onDismiss(id)}
      style={{
        position: "relative",
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        borderRadius: 8,
        padding: "10px 14px 12px",
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 4px 20px rgba(0,0,0,.08)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: hasAction ? "default" : "pointer",
        overflow: "hidden",
        animation: "toast-in 0.18s ease-out",
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      {hasAction && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
          style={{
            background: s.fg,
            color: s.bg,
            border: "none",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            lineHeight: 1.4,
            marginRight: 4,
          }}
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(id);
        }}
        aria-label="通知を閉じる"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: s.fg,
          fontSize: 12,
          padding: 2,
          lineHeight: 1,
          opacity: 0.6,
        }}
      >
        ✕
      </button>
      {duration > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 2,
            background: "rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              height: "100%",
              background: s.fg,
              opacity: 0.55,
              animation: `chord-decay ${duration}ms linear forwards`,
              animationPlayState: paused ? "paused" : "running",
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: "min(90vw, 420px)",
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
