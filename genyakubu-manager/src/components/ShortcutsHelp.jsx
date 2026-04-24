import { Modal } from "./Modal";

// キーボードショートカット ヘルプオーバーレイ
// `?` キーで開き、Modal 共通の focus trap / Esc / フォーカス復帰を利用する。

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
    section: "ブラウザ",
    note: "アプリ固有ではなくブラウザ標準",
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
  if (!open) return null;
  return (
    <Modal title="キーボードショートカット" onClose={onClose} width={480}>
      {SHORTCUTS.map((sec) => (
        <div key={sec.section} style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#888",
              letterSpacing: 1,
              margin: "8px 0 6px",
              display: "flex",
              alignItems: "baseline",
              gap: 8,
            }}
          >
            <span>{sec.section}</span>
            {sec.note && (
              <span style={{ fontSize: 10, fontWeight: 400, color: "#aaa", letterSpacing: 0 }}>
                {sec.note}
              </span>
            )}
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
                    <span style={{ fontSize: 10, color: "#aaa", margin: "0 4px" }}>/</span>
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
    </Modal>
  );
}
