import { memo, useEffect, useRef } from "react";
import { pickSubjectId } from "../utils/subjectMatch";

export const SubstitutionPopover = memo(function SubstitutionPopover({
  anchorRect,
  slot,
  originalTeacher,
  availableTeachers,
  suggestion,
  subjects,
  pendingSub,
  onAssign,
  onRemoveAssignment,
  onCombine,
  onClose,
}) {
  const ref = useRef(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Position: below the anchor, clamp to viewport
  const style = (() => {
    const top = anchorRect.bottom + 4;
    const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 300));
    const maxTop = window.innerHeight - 400;
    return {
      position: "fixed",
      top: top > maxTop ? anchorRect.top - 304 : top,
      left,
      zIndex: 2000,
      width: 280,
      maxHeight: 360,
      overflowY: "auto",
      background: "#fff",
      border: "1px solid #ccc",
      borderRadius: 8,
      boxShadow: "0 8px 24px rgba(0,0,0,.18)",
    };
  })();

  // Match slot's subject
  const slotSubjectId = pickSubjectId(slot.subj, subjects);

  // Filter to teachers available at this time
  const candidates = availableTeachers.filter((t) => {
    if (t.name === originalTeacher) return false;
    if (t.isFreeAllDay) return true;
    return t.freeTimeSlots.some((ft) => ft === slot.time);
  });

  return (
    <div ref={ref} style={style}>
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #e0e0e0",
          background: "#f8f8fa",
          borderRadius: "8px 8px 0 0",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: "#555" }}>
          {slot.time} {slot.grade}
          {slot.cls && slot.cls !== "-" ? slot.cls : ""} {slot.subj}
        </div>
        <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
          元講師: <b style={{ color: "#c03030" }}>{originalTeacher}</b>
        </div>
      </div>

      {/* Pending assignment indicator */}
      {pendingSub && (
        <div
          style={{
            padding: "6px 12px",
            background: "#e8f5e8",
            borderBottom: "1px solid #c8e0c8",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 11, color: "#2a7a2a", fontWeight: 700 }}>
            仮割当: {pendingSub.substitute}
          </span>
          <button
            onClick={onRemoveAssignment}
            style={{
              border: "none",
              background: "none",
              color: "#c44",
              fontSize: 11,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            取消
          </button>
        </div>
      )}

      {/* Chain suggestion highlight */}
      {suggestion && !pendingSub && (
        <div
          style={{
            padding: "6px 12px",
            background: "#eef6ff",
            borderBottom: "1px solid #c0d8f0",
            cursor: "pointer",
          }}
          onClick={() => onAssign(suggestion.suggestedSubstitute)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 9,
                background: "#3a6ea5",
                color: "#fff",
                padding: "1px 5px",
                borderRadius: 3,
                fontWeight: 700,
              }}
            >
              提案
            </span>
            <b style={{ fontSize: 12, color: "#1a1a2e" }}>
              {suggestion.suggestedSubstitute}
            </b>
            {suggestion.isChain && (
              <span style={{ fontSize: 9, color: "#888" }}>
                (玉突き step {suggestion.chainStep})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Candidate list */}
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {candidates.length === 0 && !suggestion && (
          <div style={{ padding: "12px", fontSize: 11, color: "#888", textAlign: "center" }}>
            この時間に空いている講師がいません
          </div>
        )}
        {candidates.map((t) => {
          const subjectMatch = t.subjectIds.includes(slotSubjectId);
          const isSuggested = suggestion?.suggestedSubstitute === t.name;
          return (
            <div
              key={t.name}
              onClick={() => onAssign(t.name)}
              style={{
                padding: "5px 12px",
                borderBottom: "1px solid #f0f0f0",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: isSuggested ? "#f0f8ff" : "transparent",
                fontSize: 12,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f5f5f5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isSuggested ? "#f0f8ff" : "transparent";
              }}
            >
              <b style={{ color: "#1a1a2e", minWidth: 48 }}>{t.name}</b>
              {subjectMatch ? (
                <span
                  style={{
                    fontSize: 9,
                    background: "#e0f2e4",
                    color: "#2a7a2a",
                    padding: "0 4px",
                    borderRadius: 3,
                    fontWeight: 700,
                  }}
                >
                  教科一致
                </span>
              ) : t.subjectIds.length > 0 ? (
                <span
                  style={{
                    fontSize: 9,
                    background: "#fff8e0",
                    color: "#b8860b",
                    padding: "0 4px",
                    borderRadius: 3,
                  }}
                >
                  別教科
                </span>
              ) : null}
              <span style={{ fontSize: 9, color: "#888", marginLeft: "auto" }}>
                {t.isFreeAllDay ? "全日" : t.freeTimeSlots.length + "コマ空"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div
        style={{
          padding: "6px 12px",
          borderTop: "1px solid #e0e0e0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {onCombine && !pendingSub ? (
          <button
            onClick={onCombine}
            style={{
              border: "1px solid #d8a030",
              background: "#fff8e0",
              color: "#8a6000",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              padding: "3px 8px",
              borderRadius: 4,
            }}
          >
            合同にする
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={onClose}
          style={{
            border: "none",
            background: "none",
            color: "#888",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
});
