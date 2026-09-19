// グローバルなキーボードショートカット (Cmd+K / ? / g チョード / ← → t) が
// 「今は効かせない」と判断する条件。3 つのリスナーで同じ判定を使うため
// 1 か所に置く (別々に持つと、片方だけ直して発火条件が食い違う)。

/** フォーカスが文字入力の要素にあるか (input / textarea / select / contentEditable) */
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el.isContentEditable;
}

/** aria-modal なダイアログ (Modal / CommandPalette / 確認ダイアログ) が開いているか */
export function hasOpenDialog() {
  return (
    typeof document !== "undefined" &&
    !!document.querySelector('[role="dialog"][aria-modal="true"]')
  );
}

// 矢印キーを自前で使うウィジェットの role。フォーカスがこれら (またはその
// 子孫) にある間は、日付移動 (useDateKeyNav) の ← / → を握らない。
// 例: 代行登録フォームの role=radio 群、Cmd+K / 代行ピッカーの listbox、
// 通常時間割作成の tab、右クリックメニューの menuitem。
// isTypingTarget とは別物 (Cmd+K や g チョードは文字入力だけを避ければよい)
export const ARROW_KEY_OWNER_ROLES = Object.freeze([
  "radio",
  "radiogroup",
  "option",
  "listbox",
  "tab",
  "tablist",
  "gridcell",
  "grid",
  "slider",
  "menuitem",
  "menu",
  "combobox",
  "treeitem",
]);

const ARROW_KEY_OWNER_SELECTOR = ARROW_KEY_OWNER_ROLES.map((r) => `[role="${r}"]`).join(",");

/** フォーカス要素 (またはその祖先) が矢印キーを自前で扱う role を持つか */
export function hasArrowKeyOwnerFocus() {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest(ARROW_KEY_OWNER_SELECTOR);
}
