import { useCallback, useMemo } from "react";
import { gradeColor as GC } from "../../../data";
import {
  formatCount,
  getSlotTeachers,
  weightedSlotCount,
} from "../../../utils/biweekly";
import {
  buildColumnDefs,
  buildTimeRows,
  findCombinedSlots,
  findSlotForCell,
  getCombinedSpan,
  splitTime,
} from "../../../utils/excelGrid";
import { ExcelCell } from "./ExcelCell";

// ─── Excel Section (one table per department) ───────────────────────
export function ExcelSection({
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
  isSubMode,
  subDate,
  holidayOffSlots,
  pendingSubMap,
  existingSubMap,
  onCellClick,
  combineMode,
  onSubDrop,
  sessionCountMap,
  groupTeacherMap,
  dashboardMode = false,
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
    () =>
      gradeGroups.flatMap((g) =>
        g.columns.map((c) => ({ ...c, grade: g.grade }))
      ),
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
      const sourceSlotId = parseInt(e.dataTransfer.getData("text/plain"), 10);
      if (isNaN(sourceSlotId)) return;

      const sourceSlot = allSlots.find((s) => s.id === sourceSlotId);
      if (!sourceSlot) return;

      // In substitution mode: swap teachers (create mutual substitutions)
      if (isSubMode && onSubDrop) {
        const targetSlot = sectionSlots.find(
          (s) =>
            s.time === targetTime &&
            s.grade === targetGrade &&
            s.cls === targetCls &&
            s.room === targetRoom
        );
        if (targetSlot && targetSlot.id !== sourceSlotId) {
          onSubDrop(sourceSlot, targetSlot);
        }
        return;
      }

      // Template mode: move slot position
      if (
        sourceSlot.time === targetTime &&
        sourceSlot.grade === targetGrade &&
        sourceSlot.cls === targetCls &&
        sourceSlot.room === targetRoom
      ) {
        return;
      }

      const from = `${sourceSlot.grade}${sourceSlot.cls} ${sourceSlot.room} ${sourceSlot.time}`;
      const to = `${targetGrade}${targetCls} ${targetRoom} ${targetTime}`;
      if (!window.confirm(`このコマを移動しますか？\n${from} → ${to}`)) return;

      saveSlots(
        allSlots.map((s) =>
          s.id === sourceSlotId
            ? {
                ...s,
                time: targetTime,
                grade: targetGrade,
                cls: targetCls,
                room: targetRoom,
              }
            : s
        )
      );
    },
    [allSlots, saveSlots, setDragState, isSubMode, onSubDrop, sectionSlots]
  );

  if (gradeGroups.length === 0 || timeRows.length === 0) return null;

  const slotCount = weightedSlotCount(sectionSlots);

  // Helper to compute cell props
  const getCellSubProps = (slot) => {
    if (!slot) return {};
    const isOff = holidayOffSlots.has(slot.id);
    const isUnavail =
      unavailableTeachers.size > 0 &&
      getSlotTeachers(slot).some((t) => unavailableTeachers.has(t));
    const isCombineTarget =
      combineMode && slot.id !== combineMode.sourceSlotId;
    return {
      isUnavailable: isUnavail && !isOff,
      isHolidayOff: isOff,
      pendingSub: pendingSubMap.get(slot.id) || null,
      existingSub: existingSubMap.get(slot.id) || null,
      isSubMode,
      subDate,
      isCombineTarget: !!isCombineTarget,
      onCellClick: onCellClick
        ? (s, rect, el) => {
            // In combine mode, any cell can be clicked
            if (combineMode) {
              onCellClick(s, rect, "", el);
              return;
            }
            // Find the teacher for this cell: prefer absent teacher, fall back to first
            const teachers = getSlotTeachers(s);
            const absent = teachers.find((t) => unavailableTeachers.has(t));
            const teacher = absent || teachers[0] || "";
            if (teacher) onCellClick(s, rect, teacher, el);
          }
        : undefined,
    };
  };

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
      <div
        style={{
          overflowX: "auto",
          border: "1px solid #ccc",
          borderTop: "none",
          borderRadius: "0 0 8px 8px",
        }}
      >
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
                const combined = findCombinedSlots(
                  sectionSlots,
                  day,
                  time,
                  g.grade
                );
                if (combined.length > 0) {
                  combinedByGrade.set(g.grade, combined);
                }
              }

              // Pre-calculate which columns are consumed by combined slots
              const combinedCells = []; // { colIdx, span, slot }
              for (const [grade, combinedSlots] of combinedByGrade) {
                const gradeColumns =
                  gradeGroups.find((g) => g.grade === grade)?.columns || [];
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
                    combinedCells.push({
                      colIdx: absIdx,
                      span: spanInfo.span,
                      slot: cs,
                    });
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
                      const combined = combinedCells.find(
                        (c) => c.colIdx === colIdx
                      );
                      if (combined) {
                        const cellKey = `${time}_${col.grade}_${combined.slot.cls}_${combined.slot.room}`;
                        const subProps = getCellSubProps(combined.slot);
                        return (
                          <ExcelCell
                            key={cellKey}
                            slot={combined.slot}
                            colSpan={combined.span}
                            isAdmin={isAdmin}
                            isDragOver={dragState.overCell === cellKey}
                            isDragSource={
                              dragState.draggingId === combined.slot.id
                            }
                            onDragStart={(e) =>
                              handleDragStart(e, combined.slot)
                            }
                            onDragOver={(e) => handleDragOver(e, cellKey)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) =>
                              handleDrop(
                                e,
                                time,
                                col.grade,
                                combined.slot.cls,
                                combined.slot.room
                              )
                            }
                            onDragEnd={handleDragEnd}
                            onEdit={onEdit}
                            biweeklyAnchors={biweeklyAnchors}
                            sessionNumber={
                              sessionCountMap
                                ? sessionCountMap.get(combined.slot.id) || 0
                                : 0
                            }
                            teacherOverride={groupTeacherMap?.get(combined.slot.id)}
                            dashboardMode={dashboardMode}
                            {...subProps}
                          />
                        );
                      }
                      // This column is consumed by a prior combined cell (colSpan)
                      return null;
                    }

                    // Individual slot
                    const slot = findSlotForCell(
                      sectionSlots,
                      day,
                      time,
                      col.grade,
                      col.cls,
                      col.room
                    );
                    const cellKey = `${time}_${col.grade}_${col.cls}_${col.room}`;
                    const subProps = getCellSubProps(slot);
                    return (
                      <ExcelCell
                        key={cellKey}
                        slot={slot}
                        colSpan={1}
                        isAdmin={isAdmin}
                        isDragOver={dragState.overCell === cellKey}
                        isDragSource={
                          slot ? dragState.draggingId === slot.id : false
                        }
                        onDragStart={
                          slot ? (e) => handleDragStart(e, slot) : undefined
                        }
                        onDragOver={(e) => handleDragOver(e, cellKey)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) =>
                          handleDrop(e, time, col.grade, col.cls, col.room)
                        }
                        onDragEnd={handleDragEnd}
                        onEdit={onEdit}
                        biweeklyAnchors={biweeklyAnchors}
                        sessionNumber={
                          slot && sessionCountMap
                            ? sessionCountMap.get(slot.id) || 0
                            : 0
                        }
                        teacherOverride={slot ? groupTeacherMap?.get(slot.id) : undefined}
                        dashboardMode={dashboardMode}
                        {...subProps}
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
