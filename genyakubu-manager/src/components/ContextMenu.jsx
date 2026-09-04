import { useEffect, useRef } from "react";
import { colors } from "../styles/tokens";

// ─── 汎用コンテキストメニュー ──────────────────────────────────
// 右クリックで出す小さなポップオーバー。クリック外・Esc で自動クローズ。
// items は [{ label, onClick, danger?, disabled? }, ...] の配列。
//
// キーボード (2026-09-04): 開いたら先頭項目にフォーカスし、↑↓ / Home / End
// で移動、Enter / Space で実行、Esc で閉じる。role="menu" / "menuitem" を
// 付けて支援技術にメニューとして伝える (regular-builder の
// RegularContextMenu と同じ作法)。画面端では中身がはみ出さないよう位置を
// クランプする。

export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  // 開いたら先頭の有効な項目へフォーカス。画面端のクランプも同時に行う。
  // 閉じたら開く前にフォーカスしていた要素 (カード等) へ戻す — 戻さないと
  // Shift+F10 で開いたキーボード利用者が <body> に落ち、時間割を Tab で
  // 辿り直すことになる
  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener && typeof opener.focus === "function" && document.contains(opener)) {
        opener.focus();
      }
    };
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const overX = rect.right - (window.innerWidth - pad);
    const overY = rect.bottom - (window.innerHeight - pad);
    if (overX > 0) el.style.left = `${Math.max(pad, x - overX)}px`;
    if (overY > 0) el.style.top = `${Math.max(pad, y - overY)}px`;
    const first = el.querySelector('[role="menuitem"]:not([disabled])');
    first?.focus();
  }, [x, y]);

  const focusables = () =>
    ref.current
      ? [...ref.current.querySelectorAll('[role="menuitem"]:not([disabled])')]
      : [];

  const onKeyDown = (e) => {
    const list = focusables();
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (list.length === 0) return;
    const idx = list.indexOf(document.activeElement);
    let next = null;
    if (e.key === "ArrowDown") next = list[(idx + 1 + list.length) % list.length];
    else if (e.key === "ArrowUp") next = list[(idx - 1 + list.length) % list.length];
    else if (e.key === "Home") next = list[0];
    else if (e.key === "End") next = list[list.length - 1];
    else if (e.key === "Tab") {
      // メニューの外へ Tab で抜けたら閉じる (フォーカスが迷子にならない)
      onClose();
      return;
    }
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      /* 開いたまま印刷すると紙面に浮いたメニューが写り込む */
      className="no-print"
      onKeyDown={onKeyDown}
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
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
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
            color: item.disabled ? "#aaa" : item.danger ? colors.danger : "#333",
          }}
          onMouseEnter={(e) => {
            if (!item.disabled) e.currentTarget.style.background = "#f0f0f0";
          }}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          onFocus={(e) => {
            if (!item.disabled) e.currentTarget.style.background = "#f0f0f0";
          }}
          onBlur={(e) => (e.currentTarget.style.background = "none")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
