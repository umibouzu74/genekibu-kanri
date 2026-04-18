import { useEffect, useRef } from "react";

// ─── 汎用コンテキストメニュー ──────────────────────────────────
// 右クリックで出す小さなポップオーバー。クリック外で自動クローズ。
// items は [{ label, onClick, danger?, disabled? }, ...] の配列。

export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: 6,
        boxShadow: "0 4px 16px rgba(0,0,0,.18)",
        zIndex: 2000,
        minWidth: 180,
        padding: "4px 0",
        fontSize: 13,
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          disabled={!!item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onClick();
            onClose();
          }}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "8px 14px",
            border: "none",
            background: "none",
            cursor: item.disabled ? "not-allowed" : "pointer",
            fontSize: 13,
            color: item.disabled ? "#aaa" : item.danger ? "#c44" : "#333",
          }}
          onMouseEnter={(e) => {
            if (!item.disabled) e.target.style.background = "#f0f0f0";
          }}
          onMouseLeave={(e) => (e.target.style.background = "none")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
