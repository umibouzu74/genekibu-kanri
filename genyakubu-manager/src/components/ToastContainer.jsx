// Renders the list of active toasts in a fixed container above all
// other content. Consumed from useToasts().
const TONE_STYLES = {
  success: { bg: "#e8f5e8", fg: "#2a7a2a", border: "#bde0bd" },
  error: { bg: "#fff5f5", fg: "#c44", border: "#fcc" },
  info: { bg: "#eef2ff", fg: "#1a1a6e", border: "#ccd6f5" },
};

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
      {toasts.map((t) => {
        const s = TONE_STYLES[t.tone] || TONE_STYLES.info;
        // action 付きの場合は toast 全体クリックで誤発火しないよう、ボタンに限定して操作させる。
        const hasAction = !!t.action;
        return (
          <div
            key={t.id}
            role="status"
            style={{
              background: s.bg,
              color: s.fg,
              border: `1px solid ${s.border}`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 4px 20px rgba(0,0,0,.08)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: hasAction ? "default" : "pointer",
            }}
            onClick={hasAction ? undefined : () => onDismiss(t.id)}
          >
            <span style={{ flex: 1 }}>{t.message}</span>
            {hasAction && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  t.action.onClick();
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
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(t.id);
              }}
              aria-label="通知を閉じる"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: s.fg,
                fontSize: 14,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
