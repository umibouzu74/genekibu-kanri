import { memo } from "react";
import { fmtDate } from "../../../data";
import {
  formatBiweeklyTeacher,
  getSlotWeekType,
  isBiweekly,
} from "../../../utils/biweekly";
import { formatSessionNumber } from "../../../utils/sessionCount";
import { BiweeklyWeekBadge } from "../../BiweeklyWeekBadge";

// ─── ExcelCell ──────────────────────────────────────────────────────
// Single cell in the Excel-like timetable grid. Highly memoised because
// the parent re-renders on every drag/hover state update.
export const ExcelCell = memo(function ExcelCell({
  slot,
  colSpan,
  isAdmin,
  isDragOver,
  isDragSource,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onEdit,
  biweeklyAnchors,
  subDate,
  isUnavailable,
  isHolidayOff,
  pendingSub,
  existingSub,
  isSubMode,
  isCombineTarget,
  onCellClick,
  sessionNumber,
  teacherOverride,
  dashboardMode = false,
}) {
  if (!slot) {
    // Empty droppable cell
    return (
      <td
        colSpan={colSpan}
        onDragOver={isAdmin ? onDragOver : undefined}
        onDragLeave={isAdmin ? onDragLeave : undefined}
        onDrop={isAdmin ? onDrop : undefined}
        style={{
          border: "1px solid #ddd",
          padding: 4,
          minWidth: 100,
          height: 60,
          verticalAlign: "top",
          background: isDragOver ? "#e8f4ff" : "#fafafa",
          transition: "background .15s",
          ...(isAdmin && {
            borderStyle: isDragOver ? "solid" : "dashed",
            borderColor: isDragOver ? "#4a90d9" : "#ddd",
          }),
        }}
      />
    );
  }

  const biweekly = isBiweekly(slot.note);
  const weekType = biweekly
    ? getSlotWeekType(subDate || fmtDate(new Date()), slot, biweeklyAnchors)
    : null;

  // ダッシュボード時のみ: 単独教科の隔週 ("隔週(partner)") は、その日に
  // 授業がある側だけ表示して "(隔週)" を付ける。アンカー未設定 (weekType null)
  // や複合教科隔週は従来通り両者併記のまま。
  const biweeklyPartnerMatch =
    biweekly && dashboardMode ? slot.note.match(/隔週\(([^)]+)\)/) : null;
  const activeBiweeklyTeacher =
    biweeklyPartnerMatch && weekType
      ? weekType === "A"
        ? slot.teacher
        : biweeklyPartnerMatch[1]
      : null;

  // Determine cell visual state (priority order)
  let bg = "#fff";
  let borderLeft = undefined;
  let badge = null;
  let teacherColor = "#1a1a2e";
  let teacherDecor = "none";
  let subDisplay = null;

  if (isDragOver) {
    bg = "#e8f4ff";
  } else if (pendingSub) {
    bg = "#e0f5e0";
    borderLeft = "3px solid #2a7a4a";
    badge = (
      <span style={{ background: "#2a7a4a", color: "#fff", padding: "0 4px", borderRadius: 3, fontSize: 9, fontWeight: 700 }}>
        仮
      </span>
    );
    teacherColor = "#888";
    teacherDecor = "line-through";
    subDisplay = (
      <div style={{ fontSize: 12, fontWeight: 800, color: "#2a7a4a", marginTop: 1 }}>
        ← {pendingSub.substitute}
      </div>
    );
  } else if (existingSub && existingSub.substitute) {
    bg = "#e8f0ff";
    borderLeft = "3px solid #3a6ea5";
    badge = (
      <span style={{ background: "#3a6ea5", color: "#fff", padding: "0 4px", borderRadius: 3, fontSize: 9, fontWeight: 700 }}>
        代
      </span>
    );
    teacherColor = "#888";
    teacherDecor = "line-through";
    subDisplay = (
      <div style={{ fontSize: 12, fontWeight: 800, color: "#3a6ea5", marginTop: 1 }}>
        ← {existingSub.substitute}
      </div>
    );
  } else if (isHolidayOff) {
    bg = "#f5f0e0";
    borderLeft = "3px solid #b8860b";
    badge = (
      <span style={{ background: "#b8860b", color: "#fff", padding: "0 4px", borderRadius: 3, fontSize: 9, fontWeight: 700 }}>
        休
      </span>
    );
    teacherColor = "#aaa";
  } else if (isUnavailable) {
    bg = "#fff0f0";
    borderLeft = "3px solid #c03030";
    badge = (
      <span style={{ background: "#c03030", color: "#fff", padding: "0 4px", borderRadius: 3, fontSize: 9, fontWeight: 700 }}>
        欠
      </span>
    );
    teacherColor = "#c03030";
    teacherDecor = "line-through";
  }

  // In sub mode, all cells with a teacher are clickable (for chain substitutions)
  const isClickable = isSubMode && (slot.teacher || pendingSub || isCombineTarget);

  const handleClick = (e) => {
    if (!isClickable || !onCellClick) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    onCellClick(slot, rect, el);
  };

  // In sub mode, cells are draggable for swap-based substitution
  const subModeDraggable = isSubMode && isAdmin && slot.teacher && !isHolidayOff;

  return (
    <td
      colSpan={colSpan}
      draggable={subModeDraggable || (isAdmin && !isSubMode)}
      onDragStart={isAdmin ? onDragStart : undefined}
      onDragOver={isAdmin ? onDragOver : undefined}
      onDragLeave={isAdmin ? onDragLeave : undefined}
      onDrop={isAdmin ? onDrop : undefined}
      onDragEnd={isAdmin ? onDragEnd : undefined}
      onDoubleClick={isAdmin && onEdit && !isSubMode ? () => onEdit(slot) : undefined}
      onClick={handleClick}
      style={{
        border: "1px solid #ccc",
        padding: "4px 6px",
        minWidth: 100,
        verticalAlign: "top",
        cursor: isClickable ? "pointer" : subModeDraggable ? "grab" : isAdmin && !isSubMode ? "grab" : "default",
        background: bg,
        opacity: isDragSource ? 0.4 : 1,
        transition: "background .15s, opacity .15s",
        position: "relative",
        ...(borderLeft && { borderLeft }),
        ...(isCombineTarget && {
          outline: "2px dashed #d4a020",
          outlineOffset: -2,
        }),
      }}
    >
      <div style={{ lineHeight: 1.3 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#444",
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexWrap: "wrap",
          }}
        >
          {sessionNumber > 0 && (
            <span
              title={`第${sessionNumber}回`}
              aria-label={`第${sessionNumber}回`}
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#fff",
                background: "#3a6ea5",
                borderRadius: 4,
                padding: "0 5px",
                lineHeight: "18px",
                minWidth: 20,
                textAlign: "center",
                boxShadow: "0 1px 2px rgba(0,0,0,.12)",
                flexShrink: 0,
              }}
            >
              {formatSessionNumber(sessionNumber)}
            </span>
          )}
          <span>{slot.subj}</span>
          {biweekly && <BiweeklyWeekBadge weekType={weekType} />}
          {badge}
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: teacherColor,
            marginTop: 2,
            textDecoration: teacherDecor,
          }}
        >
          {teacherOverride ??
            (activeBiweeklyTeacher
              ? `${activeBiweeklyTeacher} (隔週)`
              : formatBiweeklyTeacher(slot.teacher, slot.note))}
        </div>
        {subDisplay}
        {slot.note && !slot.note.startsWith("隔週") && slot.note !== "合同" && (
          <div style={{ fontSize: 10, color: "#a0331a", marginTop: 1 }}>
            {slot.note}
          </div>
        )}
      </div>
    </td>
  );
});
