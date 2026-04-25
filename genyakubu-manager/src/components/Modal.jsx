import { useId, useRef } from "react";
import { S } from "../styles/common";
import { useFocusTrap } from "../hooks/useFocusTrap";

export function Modal({ title, onClose, children, width }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useFocusTrap(dialogRef, { onClose });

  return (
    <div style={S.modal} onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="mobile-card-pad"
        style={{ ...S.card, ...(width ? { width } : null) }}
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
