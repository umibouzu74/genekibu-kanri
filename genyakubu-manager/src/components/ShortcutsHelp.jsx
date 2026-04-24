import { useEffect } from "react";

// キーボードショートカット ヘルプオーバーレイ
// `?` キーで開き、`Esc` で閉じる。App.jsx のグローバル keydown ハンドラから制御。

const SHORTCUTS = [
  {
    section: "全般",
    items: [
      { keys: ["Ctrl", "K"], alt: ["⌘", "K"], label: "コマンドパレット" },
      { keys: ["?"], label: "このヘルプを表示" },
      { keys: ["Esc"], label: "モーダル / ヘルプを閉じる" },
    ],
  },
  {
    section: "コマンドパレット内",
    items: [
      { keys: ["↑"], label: "前の候補に移動" },
      { keys: ["↓"], label: "次の候補に移動" },
      { keys: ["Enter"], label: "選択" },
    ],
  },
  {
    section: "印刷",
    items: [
      { keys: ["Ctrl", "P"], alt: ["⌘", "P"], label: "現在のビューを印刷" },
    ],
  },
];

function Key({ children }) {
  return (
    <kbd
      style={{
        display: "inline-block",
        background: "#f3f4f8",
        border: "1px solid #d6d8e0",
        borderBottomWidth: 2,
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "#333",
        minWidth: 20,
        textAlign: "center",
      }}
    >
      {children}
    </kbd>
  );
}

export function ShortcutsHelp({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="キーボードショートカット"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        zIndex: 10001,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "100%",
          maxWidth: 480,
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,.25)",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #e0e0e0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 800, color: "#1a1a2e" }}>
            キーボードショートカット
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              color: "#888",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "12px 20px 20px" }}>
          {SHORTCUTS.map((sec) => (
            <div key={sec.section} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#888",
                  letterSpacing: 1,
                  margin: "8px 0 6px",
                }}
              >
                {sec.section}
              </div>
              {sec.items.map((it) => (
                <div
                  key={it.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    fontSize: 13,
                    color: "#333",
                    borderBottom: "1px dashed #eee",
                  }}
                >
                  <span>{it.label}</span>
                  <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {it.keys.map((k, i) => (
                      <Key key={`${it.label}-${i}`}>{k}</Key>
                    ))}
                    {it.alt && (
                      <>
                        <span style={{ fontSize: 10, color: "#aaa", margin: "0 4px" }}>
                          /
                        </span>
                        {it.alt.map((k, i) => (
                          <Key key={`${it.label}-alt-${i}`}>{k}</Key>
                        ))}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
