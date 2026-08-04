import { useEffect, useLayoutEffect, useRef } from "react";
import { formatCellShort } from "./historyFeedback";

// ─── コンテキストメニュー (通常時間割作成) ──────────────────────────
// 講習ビルダーの ContextMenu と同じ操作感 (画面内クランプ・開いたら先頭
// 項目へフォーカス・↑↓ で移動・Escape / スクロール / 外側クリックで閉じる)
// を、regular-builder のセル / ヘッダ向けに再構成した軽量版。
// メニューの実行は onAction(action) に委譲し、状態は持たない。
//
// menu = { kind: "cell", x, y, ref }
//      | { kind: "bulk", x, y, label, refs }   (時限行・クラス列の一括操作)

const ITEM_BASE = "block w-full text-left px-4 py-2 border-b border-builder-border last:border-b-0";

export function RegularContextMenu({
  menu,
  /** kind:"cell" のとき: 対象セルの中身 (null = 空セル) */
  cell,
  /** コピー済みのセル内容 (null = 未コピー) */
  clipboard,
  /** kind:"cell" のとき: このセルが関わる未承認の重複件数 */
  conflictCount = 0,
  /** kind:"bulk" のとき: refs のうち中身のあるセル数 */
  filledCount = 0,
  onAction,
  onClose,
}) {
  const menuRef = useRef(null);

  // スクロール / 外側クリックで閉じる
  useEffect(() => {
    if (!menu) return undefined;
    const handleScroll = () => onClose();
    const handlePointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [menu, onClose]);

  // キーボード対応 (講習 F2a と同じ): 開いたら先頭項目へフォーカス、
  // ↑↓ で disabled を飛ばして循環、Escape で閉じる
  useEffect(() => {
    if (!menu) return undefined;
    menuRef.current?.querySelector("button:not(:disabled)")?.focus();
    const handleKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = Array.from(
        menuRef.current?.querySelectorAll("button:not(:disabled)") || []
      );
      if (items.length === 0) return;
      const i = items.indexOf(document.activeElement);
      const next =
        e.key === "ArrowDown"
          ? (i + 1) % items.length
          : (i - 1 + items.length) % items.length;
      items[next].focus();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [menu, onClose]);

  // メニュー位置を画面内にクランプ (DOM 更新後に即調整)
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!menu || !el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8));
    const y = Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [menu]);

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={menu.kind === "cell" ? "セルの操作" : `${menu.label} の一括操作`}
      className="fixed bg-builder-surface border border-builder-border shadow-xl rounded z-50 text-sm overflow-hidden animate-fade-in"
      style={{ top: menu.y, left: menu.x }}
    >
      {menu.kind === "cell" ? (
        <>
          <button
            type="button"
            onClick={() => onAction("copy")}
            disabled={!cell}
            title={!cell ? "空のセルはコピーできません" : undefined}
            className={`${ITEM_BASE} ${!cell ? "text-builder-ink-ghost cursor-not-allowed" : "hover:bg-builder-bg text-builder-ink"}`}
          >
            📝 コピー
          </button>
          <button
            type="button"
            onClick={() => onAction("paste")}
            disabled={!clipboard}
            title={!clipboard ? "先にセルをコピーしてください" : undefined}
            className={`${ITEM_BASE} ${!clipboard ? "text-builder-ink-ghost cursor-not-allowed" : "hover:bg-builder-bg text-builder-ink"}`}
          >
            📋 貼り付け
            {clipboard ? ` (${formatCellShort(clipboard)})` : ""}
          </button>
          {conflictCount > 0 && (
            <button
              type="button"
              onClick={() => onAction("approve")}
              title="意図した重なりとして承認し、件数と赤枠から除外する"
              className={`${ITEM_BASE} hover:bg-builder-success-soft text-builder-green`}
            >
              ✅ この重なりを承認 ({conflictCount} 件)
            </button>
          )}
          <button
            type="button"
            onClick={() => onAction("clear")}
            disabled={!cell}
            className={`${ITEM_BASE} ${!cell ? "text-builder-ink-ghost cursor-not-allowed" : "hover:bg-builder-danger-soft text-builder-red"}`}
          >
            🗑️ クリア
          </button>
        </>
      ) : (
        <>
          <div className="px-4 py-2 bg-builder-surface-alt border-b border-builder-border font-bold text-builder-ink-muted text-xs">
            {menu.label} の一括操作
          </div>
          <button
            type="button"
            onClick={() => onAction("clear-bulk")}
            disabled={filledCount === 0}
            title={filledCount === 0 ? "クリアできるコマがありません" : undefined}
            className={`${ITEM_BASE} ${filledCount === 0 ? "text-builder-ink-ghost cursor-not-allowed" : "hover:bg-builder-danger-soft text-builder-red"}`}
          >
            🗑️ 一括クリア{filledCount > 0 ? ` (${filledCount} コマ)` : ""}
          </button>
        </>
      )}
    </div>
  );
}
