import { memo } from "react";
import { DAY_COLOR as DC, gradeColor as GC } from "../data";
import { formatBiweeklyNote } from "../utils/biweekly";
import { formatSessionNumber } from "../utils/sessionCount";

// 右上の ✏️ 🗑 (12px + 余白 2px × 2 ずつ + 間 2px) の幅
const ICONS_WIDTH = 42;

function SlotCardImpl({
  slot,
  compact,
  sessionNum,
  onEdit,
  onDel,
  displaySubject,
  hideNote,
}) {
  const gc = GC(slot.grade);
  const hasSessionBadge = typeof sessionNum === "number" && sessionNum > 0;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderLeft: `4px solid ${DC[slot.day]}`,
        borderRadius: 8,
        padding: compact ? "8px 10px" : "10px 14px",
        lineHeight: 1.5,
        position: "relative",
        transition: "box-shadow .15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,.1)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          flexWrap: "wrap",
          fontSize: 10,
          color: "#888",
          // 右上の編集・削除のアイコンの幅ぶん空ける (回数 + 学年 + 時刻が 1 行に
          // 入る狭いカードで「19:00-2✏0」のように時刻に重なっていた。P3-10)。
          // 入りきらなければ折り返す
          paddingRight: onEdit ? ICONS_WIDTH : 0,
        }}
      >
        {hasSessionBadge && (
          <span
            title={`第${sessionNum}回`}
            aria-label={`第${sessionNum}回`}
            style={{
              background: "#3a6ea5",
              color: "#fff",
              borderRadius: 3,
              padding: "0 4px",
              fontSize: 10,
              fontWeight: 800,
              lineHeight: "14px",
              minWidth: 16,
              textAlign: "center",
              flexShrink: 0,
            }}
          >
            {formatSessionNumber(sessionNum)}
          </span>
        )}
        <span
          style={{
            background: gc.b,
            color: gc.f,
            borderRadius: 4,
            padding: "1px 6px",
            fontWeight: 700,
          }}
        >
          {slot.grade}
          {slot.cls && slot.cls !== "-" ? slot.cls : ""}
        </span>
        <span>{slot.time}</span>
        {slot.room && <span>/ {slot.room}</span>}
        {slot.note && !hideNote && <span style={{ color: "#e67a00" }}>({formatBiweeklyNote(slot.teacher, slot.note)})</span>}
      </div>
      <div
        style={{
          fontSize: compact ? 16 : 18,
          fontWeight: 800,
          color: "#1a1a2e",
          marginTop: 4,
        }}
      >
        {displaySubject ?? slot.subj}
      </div>
      {onEdit && (
        <div style={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 2 }}>
          <button
            type="button"
            onClick={() => onEdit(slot)}
            aria-label={`${slot.subj} を編集`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              padding: 2,
            }}
          >
            ✏️
          </button>
          <button
            type="button"
            onClick={() => onDel(slot.id)}
            aria-label={`${slot.subj} を削除`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              padding: 2,
            }}
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}

export const SlotCard = memo(SlotCardImpl);
