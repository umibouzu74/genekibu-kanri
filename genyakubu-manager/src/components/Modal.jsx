import { useEffect, useId, useRef } from "react";
import { S } from "../styles/common";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  // Close on Escape, trap Tab within the dialog, focus the first
  // focusable element on open, and restore focus on unmount.
  useEffect(() => {
    const prevActive = document.activeElement;
    const root = dialogRef.current;
    // Defer so we pick up content inserted in the same render.
    const focusFirst = () => {
      if (!root) return;
      const focusables = root.querySelectorAll(FOCUSABLE);
      const first = focusables[0] || root;
      first.focus?.();
    };
    focusFirst();

    const handleKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const focusables = Array.from(root.querySelectorAll(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled")
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
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
  }, [onClose]);

  return (
    <div style={S.modal} onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="mobile-card-pad"
        style={S.card}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h3 id={titleId} style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
