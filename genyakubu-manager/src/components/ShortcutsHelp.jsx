import { Modal } from "./Modal";
import { SHORTCUTS } from "../constants/shortcuts";

// キーボードショートカット ヘルプオーバーレイ
// `?` キーで開き、Modal 共通の focus trap / Esc / フォーカス復帰を利用する。
// 並べる一覧は constants/shortcuts.js。

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

function Gesture({ children }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: "#eef2ff",
        border: "1px solid #ccd6f5",
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 11,
        color: "#3a3a6e",
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

// キー列をセパレータ付きで描画する。sequential=true なら "→"、そうでなければ "+"。
function KeyCombo({ keys, sequential, keyPrefix }) {
  const separator = sequential ? "→" : "+";
  return keys.map((k, i) => (
    <span
      key={`${keyPrefix}-${i}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      {i > 0 && (
        <span
          aria-hidden="true"
          style={{ fontSize: 11, color: "#8a8aa0", fontWeight: 700 }}
        >
          {separator}
        </span>
      )}
      <Key>{k}</Key>
    </span>
  ));
}

function ItemRow({ item }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 0",
        fontSize: 13,
        color: "#333",
        borderBottom: "1px dashed #eee",
        gap: 12,
      }}
    >
      <span>{item.label}</span>
      <span
        style={{
          display: "flex",
          gap: 4,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {item.gesture ? (
          <Gesture>{item.gesture}</Gesture>
        ) : (
          <>
            <KeyCombo
              keys={item.keys}
              sequential={item.sequential}
              keyPrefix={item.label}
            />
            {item.alt && (
              <>
                <span style={{ fontSize: 10, color: "#aaa", margin: "0 4px" }}>/</span>
                <KeyCombo
                  keys={item.alt}
                  sequential={item.sequential}
                  keyPrefix={`${item.label}-alt`}
                />
              </>
            )}
          </>
        )}
      </span>
    </div>
  );
}

export function ShortcutsHelp({ open, onClose }) {
  if (!open) return null;
  return (
    <Modal title="キーボードショートカット" onClose={onClose} width={520}>
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
          {sec.sub && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 400,
                color: "#aaa",
                margin: "-2px 0 6px",
              }}
            >
              {sec.sub}
            </div>
          )}
          {sec.items.map((it) => (
            <ItemRow key={it.label} item={it} />
          ))}
        </div>
      ))}
    </Modal>
  );
}
