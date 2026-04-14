import { memo, useMemo, useCallback } from "react";
import { getSlotTeachers } from "../utils/biweekly";

const SUBJECT_COLORS = {
  バイト: "#d4a84a",
  英語: "#2e6a9e",
  数学: "#c05030",
  国語: "#6a3d8e",
  理科: "#3d7a4a",
  社会: "#9e6a2e",
  その他: "#888",
};

export const StaffUnavailabilityPanel = memo(function StaffUnavailabilityPanel({
  teacherGroups,
  unavailableTeachers,
  onToggleTeacher,
  onBulkToggle,
  onClearAll,
  collapsed,
  onToggleCollapse,
  slots,
  selectedDay,
}) {
  // Count slots per teacher for the selected day
  const dayCounts = useMemo(() => {
    const m = new Map();
    for (const s of slots) {
      if (s.day !== selectedDay) continue;
      for (const t of getSlotTeachers(s)) {
        m.set(t, (m.get(t) || 0) + 1);
      }
    }
    return m;
  }, [slots, selectedDay]);

  // Filter groups to only teachers with slots on the selected day
  const dayGroups = useMemo(() => {
    return teacherGroups
      .map((g) => ({
        ...g,
        teachers: g.teachers.filter((t) => dayCounts.has(t)),
      }))
      .filter((g) => g.teachers.length > 0);
  }, [teacherGroups, dayCounts]);

  const selectedCount = unavailableTeachers.size;

  const handleGroupToggle = useCallback(
    (teachers) => {
      const allSelected = teachers.every((t) => unavailableTeachers.has(t));
      if (onBulkToggle) {
        onBulkToggle(teachers, !allSelected);
      } else {
        for (const t of teachers) onToggleTeacher(t);
      }
    },
    [unavailableTeachers, onToggleTeacher, onBulkToggle]
  );

  if (collapsed) {
    return (
      <div
        style={{
          width: 32,
          minWidth: 32,
          background: "#f0f1f3",
          border: "1px solid #ddd",
          borderRadius: 8,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "12px 0",
          position: "sticky",
          top: 0,
          alignSelf: "flex-start",
        }}
        onClick={onToggleCollapse}
        title="欠席選択パネルを開く"
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "#666" }}>◂</span>
        <span
          style={{
            writingMode: "vertical-rl",
            fontSize: 11,
            fontWeight: 700,
            color: "#555",
            letterSpacing: 2,
          }}
        >
          欠席選択
        </span>
        {selectedCount > 0 && (
          <span
            style={{
              background: "#c03030",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 8,
              padding: "1px 5px",
              minWidth: 16,
              textAlign: "center",
            }}
          >
            {selectedCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        width: 200,
        minWidth: 200,
        background: "#f8f9fa",
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        maxHeight: "calc(100vh - 140px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid #e0e0e0",
          background: "#f0f1f3",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 12, color: "#333" }}>
            欠席選択
          </span>
          {selectedCount > 0 && (
            <span
              style={{
                background: "#c03030",
                color: "#fff",
                fontSize: 9,
                fontWeight: 700,
                borderRadius: 8,
                padding: "1px 6px",
              }}
            >
              {selectedCount}名
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {selectedCount > 0 && (
            <button
              onClick={onClearAll}
              style={{
                border: "none",
                background: "none",
                color: "#888",
                fontSize: 10,
                cursor: "pointer",
                padding: "2px 4px",
                fontWeight: 600,
              }}
              title="全解除"
            >
              クリア
            </button>
          )}
          <button
            onClick={onToggleCollapse}
            style={{
              border: "none",
              background: "none",
              color: "#888",
              fontSize: 13,
              cursor: "pointer",
              padding: "0 2px",
              fontWeight: 700,
            }}
            title="パネルを閉じる"
          >
            ▸
          </button>
        </div>
      </div>

      {/* Teacher list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 0" }}>
        {dayGroups.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "#999",
              padding: "20px 10px",
              fontSize: 11,
            }}
          >
            この曜日に授業のある
            <br />
            講師はいません
          </div>
        )}
        {dayGroups.map((group) => {
          const color = SUBJECT_COLORS[group.label] || "#888";
          const selectedInGroup = group.teachers.filter((t) => unavailableTeachers.has(t)).length;
          const allSelected = selectedInGroup === group.teachers.length;
          const someSelected = selectedInGroup > 0;

          return (
            <div key={group.key}>
              {/* Group header */}
              <div
                onClick={() => handleGroupToggle(group.teachers)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 10px 4px",
                  marginTop: 4,
                  borderLeft: `3px solid ${color}`,
                  background: "#eef0f2",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      border: `2px solid ${color}`,
                      borderRadius: 3,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: allSelected ? "#fff" : color,
                      background: allSelected
                        ? color
                        : someSelected
                          ? `${color}30`
                          : "transparent",
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    {allSelected ? "✓" : someSelected ? "−" : ""}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#555",
                      letterSpacing: 0.5,
                    }}
                  >
                    {group.label}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    color: "#999",
                    fontWeight: 600,
                  }}
                >
                  {selectedInGroup > 0
                    ? `${selectedInGroup}/`
                    : ""}
                  {group.teachers.length}
                </span>
              </div>
              {/* Teacher rows */}
              {group.teachers.map((t) => {
                const isSelected = unavailableTeachers.has(t);
                const cnt = dayCounts.get(t) || 0;
                return (
                  <button
                    key={t}
                    onClick={() => onToggleTeacher(t)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "5px 10px",
                      border: "none",
                      background: isSelected ? "#fde4e4" : "transparent",
                      color: isSelected ? "#c03030" : "#444",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: isSelected ? 700 : 400,
                      transition: "background .12s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected)
                        e.currentTarget.style.background = "#f0f0f0";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          border: `2px solid ${isSelected ? "#c03030" : "#bbb"}`,
                          borderRadius: 3,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 8,
                          fontWeight: 700,
                          color: "#fff",
                          background: isSelected ? "#c03030" : "transparent",
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                      >
                        {isSelected ? "✓" : ""}
                      </span>
                      <span>{t}</span>
                    </div>
                    <span
                      style={{
                        fontSize: 9,
                        background: isSelected ? "#c03030" : "#e4e4e8",
                        color: isSelected ? "#fff" : "#666",
                        borderRadius: 8,
                        padding: "1px 5px",
                        fontWeight: 700,
                      }}
                    >
                      {cnt}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
});
