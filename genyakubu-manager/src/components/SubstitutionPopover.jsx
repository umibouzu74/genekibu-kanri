import { memo, useEffect, useRef, useState } from "react";
import { pickSubjectId } from "../utils/subjectMatch";
import { validateSubstituteChange } from "../utils/chainSubstitution";

function computePosition(anchorRect) {
  // Popover幅 280px、画面端から最低 8px のマージン。
  // 狭いスマホ (375px) でも完全に収まるよう Math.min/max でクランプ。
  const popoverWidth = Math.min(280, window.innerWidth - 16);
  const top = anchorRect.bottom + 4;
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - popoverWidth - 8));
  const maxTop = window.innerHeight - 400;
  return {
    top: top > maxTop ? anchorRect.top - 304 : top,
    left,
  };
}

export const SubstitutionPopover = memo(function SubstitutionPopover({
  anchorEl,
  anchorRect: initialRect,
  slot,
  originalTeacher,
  availableTeachers,
  allTeachersForDay,
  suggestion,
  subjects,
  pendingSub,
  onAssign,
  onRemoveAssignment,
  onCombine,
  onClose,
  slots,
  pendingSubs,
  partTimeStaff,
}) {
  const ref = useRef(null);
  const [showAll, setShowAll] = useState(false);

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

  // Track position on scroll (recalculate from anchor element)
  const [pos, setPos] = useState(() => computePosition(initialRect));
  useEffect(() => {
    const handler = () => {
      if (anchorEl) {
        setPos(computePosition(anchorEl.getBoundingClientRect()));
      }
    };
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [anchorEl]);

  const style = {
    position: "fixed",
    top: pos.top,
    left: pos.left,
    zIndex: 2000,
    width: "min(280px, calc(100vw - 16px))",
    maxHeight: "min(360px, calc(100vh - 24px))",
    overflowY: "auto",
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(0,0,0,.18)",
  };

  // Match slot's subject
  const slotSubjectId = pickSubjectId(slot.subj, subjects);

  // Filter and sort free candidates by relevance
  const freeCandidates = availableTeachers
    .filter((t) => {
      if (t.name === originalTeacher) return false;
      if (t.isFreeAllDay) return true;
      return t.freeTimeSlots.some((ft) => ft === slot.time);
    })
    .sort((a, b) => {
      const aMatch = a.subjectIds.includes(slotSubjectId) ? 1 : 0;
      const bMatch = b.subjectIds.includes(slotSubjectId) ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
      if (a.isPartTime !== b.isPartTime) return a.isPartTime ? 1 : -1;
      return (b.freeTimeSlots?.length || 0) - (a.freeTimeSlots?.length || 0);
    });

  // When "全員表示" is on, add busy teachers that weren't already included
  const freeNames = new Set(freeCandidates.map((t) => t.name));
  const busyCandidates = (allTeachersForDay || [])
    .filter((t) => t.name !== originalTeacher && !freeNames.has(t.name))
    .map((t) => ({
      name: t.name,
      isFreeAllDay: false,
      freeTimeSlots: [],
      subjectIds: t.subjectIds || [],
      isPartTime: t.isPartTime,
      isBusy: true,
    }))
    .sort((a, b) => {
      const aMatch = a.subjectIds.includes(slotSubjectId) ? 1 : 0;
      const bMatch = b.subjectIds.includes(slotSubjectId) ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
      if (a.isPartTime !== b.isPartTime) return a.isPartTime ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

  const candidates = showAll ? [...freeCandidates, ...busyCandidates] : freeCandidates;

  // Build pending assignments for conflict check
  const pendingAssignments = (pendingSubs || []).map((p) => ({
    slotId: p.slotId,
    suggestedSubstitute: p.substitute,
  }));

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${slot.time} ${slot.grade} ${slot.subj} の代行候補`}
      style={style}
    >
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
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: 2, gap: 6,
          }}
        >
          <span style={{ fontSize: 10, color: "#888" }}>
            担当: <b style={{ color: "#c03030" }}>{originalTeacher}</b>
          </span>
          <label
            style={{
              display: "flex", alignItems: "center", gap: 3,
              fontSize: 10, color: "#666", cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              style={{ margin: 0 }}
            />
            全員表示
          </label>
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
      <div
        role="listbox"
        aria-label="代行候補"
        style={{ maxHeight: 220, overflowY: "auto" }}
      >
        {candidates.length === 0 && !suggestion && (
          <div style={{ padding: "12px", fontSize: 11, color: "#888", textAlign: "center", lineHeight: 1.6 }}>
            この時間に空いている講師がいません
            {!showAll && (
              <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>
                「全員表示」をONで授業中の講師も表示されます
              </div>
            )}
          </div>
        )}
        {candidates.map((t) => {
          const subjectMatch = t.subjectIds.includes(slotSubjectId);
          const isSuggested = suggestion?.suggestedSubstitute === t.name;
          const conflict = (slots && partTimeStaff)
            ? validateSubstituteChange(t.name, slot.id, slots, pendingAssignments, subjects, partTimeStaff)
            : null;
          const hasConflict = conflict?.timeConflict;
          return (
            <div
              key={t.name}
              role="option"
              aria-selected={isSuggested}
              tabIndex={0}
              onClick={() => onAssign(t.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAssign(t.name);
                }
              }}
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
              {t.isBusy && (
                <span style={{ fontSize: 9, background: "#eeeeee", color: "#666", padding: "0 4px", borderRadius: 3, fontWeight: 700 }}>
                  授業中
                </span>
              )}
              {hasConflict && !t.isBusy && (
                <span style={{ fontSize: 9, background: "#fde4e4", color: "#c03030", padding: "0 4px", borderRadius: 3, fontWeight: 700 }}>
                  時間重複
                </span>
              )}
              <span style={{ fontSize: 9, color: "#888", marginLeft: "auto" }}>
                {t.isBusy ? "" : t.isFreeAllDay ? "全日" : t.freeTimeSlots.length + "コマ空"}
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
