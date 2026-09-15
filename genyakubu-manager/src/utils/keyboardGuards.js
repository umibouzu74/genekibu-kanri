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
