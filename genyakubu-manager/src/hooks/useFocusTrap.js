import { useEffect } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Trap Tab focus within `containerRef`, focus the first focusable
// element on mount, restore previously-focused element on cleanup,
// and call onClose when Escape is pressed.
//
// Intended for true modal dialogs. Skip for transient popovers
// anchored to a trigger (the user may want Tab to leave the popover).
//
// `enabled=false` makes the hook a no-op; flipping it back to true
// re-initializes focus and listeners.
export function useFocusTrap(containerRef, { onClose, enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    const root = containerRef.current;
    if (!root) return undefined;
    const prevActive = document.activeElement;

    const focusables = () =>
      Array.from(root.querySelectorAll(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled")
      );

    const initial = focusables()[0] || root;
    initial.focus?.();

    const handleKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (prevActive && "focus" in prevActive) prevActive.focus?.();
    };
    // containerRef は ref オブジェクト (識別子安定) なので依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, onClose]);
}
