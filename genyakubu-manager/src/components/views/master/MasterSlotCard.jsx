import { memo, useState } from "react";
import { gradeColor as GC } from "../../../data";
import { formatBiweeklyNote, formatBiweeklyTeacher } from "../../../utils/biweekly";

// Extracted to its own component so that hover state is scoped to a
// single card instead of requiring DOM querySelector manipulation.
export const MasterSlotCard = memo(function MasterSlotCard({
  s,
  newGradeRow,
  onEdit,
  onDel,
  isAdmin,
}) {
  const [hover, setHover] = useState(false);
  const gc = GC(s.grade);
  return (
    <div
      style={{
        background: "#fff",
        padding: "8px 6px",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 96,
        position: "relative",
        ...(newGradeRow ? { gridColumnStart: 1 } : null),
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ lineHeight: 1.4 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 4,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              background: gc.b,
              color: gc.f,
              borderRadius: 3,
              padding: "1px 4px",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {s.grade}
            {s.cls && s.cls !== "-" ? s.cls : ""}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#444" }}>{s.subj}</span>
        </div>
        {(s.room || s.note) && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              marginTop: 2,
              flexWrap: "wrap",
            }}
          >
            {s.room && (
              <span style={{ fontSize: 18, fontWeight: 700, color: "#555" }}>{s.room}</span>
            )}
            {s.note && (
              <span style={{ fontSize: 13, fontWeight: 600, color: "#a0331a" }}>
                ({formatBiweeklyNote(s.teacher, s.note)})
              </span>
            )}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: "#1a1a2e",
          lineHeight: 1.1,
          marginTop: 6,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {formatBiweeklyTeacher(s.teacher, s.note)}
      </div>
      {isAdmin && (
        <div
          className="master-slot-actions"
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            display: "flex",
            gap: 1,
            opacity: hover ? 1 : 0,
            transition: "opacity .15s",
          }}
        >
          <button
            type="button"
            onClick={() => onEdit(s)}
            aria-label={`${s.subj} を編集`}
            style={{
              background: "rgba(255,255,255,0.9)",
              border: "1px solid #ddd",
              borderRadius: 3,
              cursor: "pointer",
              fontSize: 11,
              padding: "1px 3px",
              lineHeight: 1,
            }}
          >
            ✏️
          </button>
          <button
            type="button"
            onClick={() => onDel(s.id)}
            aria-label={`${s.subj} を削除`}
            style={{
              background: "rgba(255,255,255,0.9)",
              border: "1px solid #ddd",
              borderRadius: 3,
              cursor: "pointer",
              fontSize: 11,
              padding: "1px 3px",
              lineHeight: 1,
            }}
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
});
