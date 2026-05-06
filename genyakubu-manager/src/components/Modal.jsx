import { useCallback, useId, useRef } from "react";
import { S } from "../styles/common";
import { useFocusTrap } from "../hooks/useFocusTrap";

// closeDisabled=true のとき、× ボタン・背景クリック・Esc のすべてを
// 無効化する。一括印刷のように「処理中だから閉じさせたくない」モーダル
// から渡される。視覚上も × ボタンを薄く / not-allowed にする。
export function Modal({ title, onClose, children, width, closeDisabled = false }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  const handleClose = useCallback(() => {
    if (closeDisabled) return;
    onClose?.();
  }, [closeDisabled, onClose]);

  useFocusTrap(dialogRef, { onClose: handleClose });

  return (
    <div style={S.modal} onClick={handleClose} role="presentation">
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
            onClick={handleClose}
            aria-label="閉じる"
            disabled={closeDisabled}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              opacity: closeDisabled ? 0.4 : 1,
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
