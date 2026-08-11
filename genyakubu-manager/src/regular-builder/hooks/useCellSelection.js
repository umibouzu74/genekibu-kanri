import { useCallback, useEffect, useRef, useState } from "react";

// ─── セルの複数選択 (Ctrl+クリックでトグル / Shift+クリックで矩形) ───
// 講習 N2a と同じ操作感。選択はセル ref の集合で持ち、矩形の計算は
// セクション構造を知る RegularGrid 側が行う (onRectSelect に結果が届く)。
// アンカー (直近にトグルしたセル) は Shift+クリックの基準点。

/**
 * @param {{resetKey: string, ctxMenuOpen: boolean}} opts
 *   resetKey: 変わったら選択を捨てる (曜日・プロジェクト・表示モードなど。
 *     見えていないセルへ一括操作が飛ぶのを防ぐ)
 *   ctxMenuOpen: コンテキストメニューが開いている間は Escape で選択を
 *     解除しない (メニューの Escape も window リスナーのため
 *     stopPropagation では止まらず、「メニューを閉じるだけ」のつもりの
 *     Escape で選択まで消えてしまう)
 */
export function useCellSelection({ resetKey, ctxMenuOpen }) {
  const [selectedRefs, setSelectedRefs] = useState(() => new Set());
  const anchorRef = useRef(null);

  const toggleSelect = useCallback((ref) => {
    anchorRef.current = ref;
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }, []);

  const rectSelect = useCallback((refs) => {
    if (refs.length) setSelectedRefs(new Set(refs));
  }, []);

  const clearSelection = useCallback(() => {
    anchorRef.current = null;
    setSelectedRefs((prev) => (prev.size ? new Set() : prev));
  }, []);

  useEffect(() => {
    clearSelection();
  }, [resetKey, clearSelection]);

  useEffect(() => {
    if (selectedRefs.size === 0) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !e.isComposing && !ctxMenuOpen) clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedRefs.size, clearSelection, ctxMenuOpen]);

  return { selectedRefs, anchorRef, toggleSelect, rectSelect, clearSelection };
}
