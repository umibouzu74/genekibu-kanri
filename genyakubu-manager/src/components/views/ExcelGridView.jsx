import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  DAY_COLOR as DC,
  DAY_BG as DB,
  DAYS,
  DEPT_COLOR,
  gradeColor as GC,
  fmtDate,
} from "../../data";
import { getDashSections } from "../../constants/schedule";
import {
  formatBiweeklyTeacher,
  getSlotTeachers,
  getSlotWeekType,
  isBiweekly,
  formatCount,
  weightedSlotCount,
} from "../../utils/biweekly";
import {
  buildColumnDefs,
  buildTimeRows,
  findSlotForCell,
  findCombinedSlots,
  getCombinedSpan,
  splitTime,
} from "../../utils/excelGrid";
import { useTeacherGroups } from "../../hooks/useTeacherGroups";
import { StaffUnavailabilityPanel } from "../StaffUnavailabilityPanel";

// ─── ExcelCell ──────────────────────────────────────────────────────
const ExcelCell = memo(function ExcelCell({
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
  isUnavailable,
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
    ? getSlotWeekType(fmtDate(new Date()), slot, biweeklyAnchors)
    : null;

  return (
    <td
      colSpan={colSpan}
      draggable={isAdmin}
      onDragStart={isAdmin ? onDragStart : undefined}
      onDragOver={isAdmin ? onDragOver : undefined}
      onDragLeave={isAdmin ? onDragLeave : undefined}
      onDrop={isAdmin ? onDrop : undefined}
      onDragEnd={isAdmin ? onDragEnd : undefined}
      onDoubleClick={isAdmin && onEdit ? () => onEdit(slot) : undefined}
      style={{
        border: "1px solid #ccc",
        padding: "4px 6px",
        minWidth: 100,
        verticalAlign: "top",
        cursor: isAdmin ? "grab" : "default",
        background: isDragOver
          ? "#e8f4ff"
          : isUnavailable
            ? "#fff0f0"
            : "#fff",
        opacity: isDragSource ? 0.4 : 1,
        transition: "background .15s, opacity .15s",
        position: "relative",
        ...(isUnavailable && { borderLeft: "3px solid #c03030" }),
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
          <span>{slot.subj}</span>
          {biweekly && weekType && (
            <span
              style={{
                background: weekType === "A" ? "#2e6a9e" : "#c05030",
                color: "#fff",
                padding: "0 4px",
                borderRadius: 3,
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              {weekType}週
            </span>
          )}
          {isUnavailable && (
            <span
              style={{
                background: "#c03030",
                color: "#fff",
                padding: "0 4px",
                borderRadius: 3,
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              欠
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: isUnavailable ? "#c03030" : "#1a1a2e",
            marginTop: 2,
            textDecoration: isUnavailable ? "line-through" : "none",
          }}
        >
          {formatBiweeklyTeacher(slot.teacher, slot.note)}
        </div>
        {slot.note && !slot.note.startsWith("隔週") && slot.note !== "合同" && (
          <div style={{ fontSize: 10, color: "#a0331a", marginTop: 1 }}>
            {slot.note}
          </div>
        )}
      </div>
    </td>
  );
});

// ─── Excel Section (one table per department) ───────────────────────
function ExcelSection({
  label,
  headerColor,
  slots,
  day,
  sectionFilterFn,
  isAdmin,
  biweeklyAnchors,
  onEdit,
  saveSlots,
  allSlots,
  dragState,
  setDragState,
  unavailableTeachers,
}) {
  const { gradeGroups } = useMemo(
    () => buildColumnDefs(slots, day, sectionFilterFn),
    [slots, day, sectionFilterFn]
  );
  const timeRows = useMemo(
    () => buildTimeRows(slots, day, sectionFilterFn),
    [slots, day, sectionFilterFn]
  );

  const totalColumns = useMemo(
    () => gradeGroups.reduce((n, g) => n + g.columns.length, 0),
    [gradeGroups]
  );

  // Flat column list for rendering
  const allColumns = useMemo(
    () => gradeGroups.flatMap((g) => g.columns.map((c) => ({ ...c, grade: g.grade }))),
    [gradeGroups]
  );

  const sectionSlots = useMemo(
    () => slots.filter((s) => s.day === day && sectionFilterFn(s)),
    [slots, day, sectionFilterFn]
  );

  const handleDragStart = useCallback(
    (e, slot) => {
      e.dataTransfer.setData("text/plain", String(slot.id));
      e.dataTransfer.effectAllowed = "move";
      setDragState({ draggingId: slot.id, overCell: null });
    },
    [setDragState]
  );

  const handleDragOver = useCallback(
    (e, cellKey) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragState((prev) => ({ ...prev, overCell: cellKey }));
    },
    [setDragState]
  );

  const handleDragLeave = useCallback(() => {
    setDragState((prev) => ({ ...prev, overCell: null }));
  }, [setDragState]);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggingId: null, overCell: null });
  }, [setDragState]);

  const handleDrop = useCallback(
    (e, targetTime, targetGrade, targetCls, targetRoom) => {
      e.preventDefault();
      setDragState({ draggingId: null, overCell: null });
      const slotId = parseInt(e.dataTransfer.getData("text/plain"), 10);
      if (isNaN(slotId)) return;

      const slot = allSlots.find((s) => s.id === slotId);
      if (!slot) return;

      // No-op if same position
      if (
        slot.time === targetTime &&
        slot.grade === targetGrade &&
        slot.cls === targetCls &&
        slot.room === targetRoom
      ) {
        return;
      }

      const from = `${slot.grade}${slot.cls} ${slot.room} ${slot.time}`;
      const to = `${targetGrade}${targetCls} ${targetRoom} ${targetTime}`;
      if (!window.confirm(`このコマを移動しますか？\n${from} → ${to}`)) return;

      saveSlots(
        allSlots.map((s) =>
          s.id === slotId
            ? { ...s, time: targetTime, grade: targetGrade, cls: targetCls, room: targetRoom }
            : s
        )
      );
    },
    [allSlots, saveSlots, setDragState]
  );

  if (gradeGroups.length === 0 || timeRows.length === 0) return null;

  const slotCount = weightedSlotCount(sectionSlots);

  return (
    <div>
      <div
        style={{
          background: headerColor,
          color: "#fff",
          padding: "6px 14px",
          borderRadius: "8px 8px 0 0",
          fontWeight: 800,
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>
          {formatCount(slotCount)}コマ
        </span>
      </div>
      <div style={{ overflowX: "auto", border: "1px solid #ccc", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
        <table
          style={{
            borderCollapse: "collapse",
            fontSize: 13,
            width: "100%",
            minWidth: totalColumns * 110 + 80,
          }}
        >
          <thead>
            {/* Grade header row */}
            <tr>
              <th
                rowSpan={3}
                style={{
                  background: "#f5f5f5",
                  border: "1px solid #ccc",
                  padding: "4px 8px",
                  fontWeight: 700,
                  fontSize: 11,
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  minWidth: 70,
                  textAlign: "center",
                  verticalAlign: "middle",
                }}
              >
                時間
              </th>
              {gradeGroups.map((g) => {
                const gc = GC(g.grade);
                return (
                  <th
                    key={g.grade}
                    colSpan={g.columns.length}
                    style={{
                      background: gc.b,
                      color: gc.f,
                      border: "1px solid #ccc",
                      padding: "6px 8px",
                      fontSize: 14,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    {g.grade}
                  </th>
                );
              })}
            </tr>
            {/* Class header row */}
            <tr>
              {allColumns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    background: "#f0f0f0",
                    border: "1px solid #ccc",
                    padding: "3px 6px",
                    fontSize: 12,
                    fontWeight: 700,
                    textAlign: "center",
                  }}
                >
                  {col.cls === "-" ? "−" : col.cls}
                </th>
              ))}
            </tr>
            {/* Room header row */}
            <tr>
              {allColumns.map((col) => (
                <th
                  key={col.key + "_room"}
                  style={{
                    background: "#fafafa",
                    border: "1px solid #ccc",
                    padding: "2px 6px",
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: "center",
                    color: "#666",
                  }}
                >
                  {col.room}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeRows.map((time) => {
              const tp = splitTime(time);
              // Track which columns are consumed by combined slots
              const consumed = new Set();

              // Find combined slots for this time row, grouped by grade
              const combinedByGrade = new Map();
              for (const g of gradeGroups) {
                const combined = findCombinedSlots(sectionSlots, day, time, g.grade);
                if (combined.length > 0) {
                  combinedByGrade.set(g.grade, combined);
                }
              }

              // Pre-calculate which columns are consumed by combined slots
              const combinedCells = []; // { colIdx, span, slot }
              for (const [grade, combinedSlots] of combinedByGrade) {
                const gradeColumns = gradeGroups.find((g) => g.grade === grade)?.columns || [];
                for (const cs of combinedSlots) {
                  const spanInfo = getCombinedSpan(cs, gradeColumns);
                  if (spanInfo) {
                    // Find the absolute column index
                    let absStart = 0;
                    for (const g of gradeGroups) {
                      if (g.grade === grade) break;
                      absStart += g.columns.length;
                    }
                    const absIdx = absStart + spanInfo.startIdx;
                    combinedCells.push({ colIdx: absIdx, span: spanInfo.span, slot: cs });
                    for (let i = absIdx; i < absIdx + spanInfo.span; i++) {
                      consumed.add(i);
                    }
                  }
                }
              }

              return (
                <tr key={time}>
                  <td
                    style={{
                      background: "#f8f8f8",
                      border: "1px solid #ccc",
                      padding: "4px 6px",
                      fontWeight: 700,
                      fontSize: 11,
                      textAlign: "center",
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      whiteSpace: "nowrap",
                      lineHeight: 1.5,
                    }}
                  >
                    {tp.start}
                    <br />
                    <span style={{ fontSize: 9, color: "#999" }}>〜</span>
                    <br />
                    {tp.end}
                  </td>
                  {allColumns.map((col, colIdx) => {
                    // Skip columns consumed by a combined cell
                    if (consumed.has(colIdx)) {
                      // Check if this is the start of a combined cell
                      const combined = combinedCells.find((c) => c.colIdx === colIdx);
                      if (combined) {
                        const cellKey = `${time}_${col.grade}_${combined.slot.cls}_${combined.slot.room}`;
                        const cellUnavailable = unavailableTeachers.size > 0 &&
                          getSlotTeachers(combined.slot).some((t) => unavailableTeachers.has(t));
                        return (
                          <ExcelCell
                            key={cellKey}
                            slot={combined.slot}
                            colSpan={combined.span}
                            isAdmin={isAdmin}
                            isDragOver={dragState.overCell === cellKey}
                            isDragSource={dragState.draggingId === combined.slot.id}
                            onDragStart={(e) => handleDragStart(e, combined.slot)}
                            onDragOver={(e) => handleDragOver(e, cellKey)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, time, col.grade, combined.slot.cls, combined.slot.room)}
                            onDragEnd={handleDragEnd}
                            onEdit={onEdit}
                            biweeklyAnchors={biweeklyAnchors}
                            isUnavailable={cellUnavailable}
                          />
                        );
                      }
                      // This column is consumed by a prior combined cell (colSpan)
                      return null;
                    }

                    // Individual slot
                    const slot = findSlotForCell(sectionSlots, day, time, col.grade, col.cls, col.room);
                    const cellKey = `${time}_${col.grade}_${col.cls}_${col.room}`;
                    const cellUnavailable = slot && unavailableTeachers.size > 0 &&
                      getSlotTeachers(slot).some((t) => unavailableTeachers.has(t));
                    return (
                      <ExcelCell
                        key={cellKey}
                        slot={slot}
                        colSpan={1}
                        isAdmin={isAdmin}
                        isDragOver={dragState.overCell === cellKey}
                        isDragSource={slot ? dragState.draggingId === slot.id : false}
                        onDragStart={slot ? (e) => handleDragStart(e, slot) : undefined}
                        onDragOver={(e) => handleDragOver(e, cellKey)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, time, col.grade, col.cls, col.room)}
                        onDragEnd={handleDragEnd}
                        onEdit={onEdit}
                        biweeklyAnchors={biweeklyAnchors}
                        isUnavailable={cellUnavailable}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────
export function ExcelGridView({
  slots,
  saveSlots,
  onEdit,
  biweeklyAnchors,
  isAdmin,
  timetables,
  activeTimetableId,
  partTimeStaff,
  subjects,
}) {
  const [selectedDay, setSelectedDay] = useState("月");
  const [dragState, setDragState] = useState({ draggingId: null, overCell: null });
  const [unavailableTeachers, setUnavailableTeachers] = useState(new Set());
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Filter by active timetable
  const filteredSlots = useMemo(() => {
    if (!timetables || timetables.length <= 1) return slots;
    return slots.filter(
      (s) => (s.timetableId ?? 1) === (activeTimetableId || 1)
    );
  }, [slots, timetables, activeTimetableId]);

  // Check which days have slots
  const daysWithSlots = useMemo(() => {
    const days = new Set();
    for (const s of filteredSlots) days.add(s.day);
    return days;
  }, [filteredSlots]);

  // Teacher groups for the unavailability panel
  const teacherGroups = useTeacherGroups({
    slots: filteredSlots,
    partTimeStaff: partTimeStaff || [],
    subjects: subjects || [],
    search: "",
  });

  // Clear selection when day changes
  useEffect(() => {
    setUnavailableTeachers(new Set());
  }, [selectedDay]);

  const toggleTeacher = useCallback((name) => {
    setUnavailableTeachers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const clearAllUnavailable = useCallback(() => {
    setUnavailableTeachers(new Set());
  }, []);

  return (
    <div>
      {/* Day Tab Bar */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        {DAYS.map((d) => {
          const active = selectedDay === d;
          const hasSlotsForDay = daysWithSlots.has(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setSelectedDay(d)}
              style={{
                padding: "8px 18px",
                border: active ? `2px solid ${DC[d]}` : "1px solid #ddd",
                borderRadius: 8,
                background: active ? DC[d] : hasSlotsForDay ? DB[d] : "#f5f5f5",
                color: active ? "#fff" : hasSlotsForDay ? DC[d] : "#bbb",
                fontWeight: 800,
                fontSize: 15,
                cursor: hasSlotsForDay ? "pointer" : "default",
                opacity: hasSlotsForDay ? 1 : 0.5,
                transition: "all .15s",
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Guide */}
      <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
        {isAdmin
          ? "コマをドラッグして移動 / ダブルクリックで編集"
          : "時間割の閲覧モード"}
      </div>

      {/* Grid + Panel layout */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Sections */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!daysWithSlots.has(selectedDay) ? (
            <div
              style={{
                textAlign: "center",
                color: "#888",
                padding: 40,
                background: "#fff",
                borderRadius: 8,
                border: "1px solid #e0e0e0",
              }}
            >
              {selectedDay}曜日のコマがありません
            </div>
          ) : (
            <div
              className="excel-grid-sections"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                gap: 12,
                alignItems: "start",
              }}
            >
              {getDashSections(selectedDay).map((sec) => {
                const color =
                  sec.color || DEPT_COLOR[sec.dept] || { b: "#e8e8e8", f: "#444", accent: "#888" };
                return (
                  <ExcelSection
                    key={sec.key}
                    label={sec.label}
                    headerColor={color.accent}
                    slots={filteredSlots}
                    day={selectedDay}
                    sectionFilterFn={sec.filterFn}
                    isAdmin={isAdmin}
                    biweeklyAnchors={biweeklyAnchors}
                    onEdit={onEdit}
                    saveSlots={saveSlots}
                    allSlots={slots}
                    dragState={dragState}
                    setDragState={setDragState}
                    unavailableTeachers={unavailableTeachers}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Unavailability Panel */}
        <StaffUnavailabilityPanel
          teacherGroups={teacherGroups}
          unavailableTeachers={unavailableTeachers}
          onToggleTeacher={toggleTeacher}
          onClearAll={clearAllUnavailable}
          collapsed={panelCollapsed}
          onToggleCollapse={() => setPanelCollapsed((p) => !p)}
          slots={filteredSlots}
          selectedDay={selectedDay}
        />
      </div>
    </div>
  );
}
