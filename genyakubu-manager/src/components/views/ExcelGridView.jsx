import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DAY_COLOR as DC,
  DAY_BG as DB,
  DAYS,
  DEPT_COLOR,
  gradeColor as GC,
  fmtDate,
  dateToDay,
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
import { useSubstitutionMode } from "../../hooks/useSubstitutionMode";
import { StaffUnavailabilityPanel } from "../StaffUnavailabilityPanel";
import { SubstitutionPopover } from "../SubstitutionPopover";
import { S } from "../../styles/common";

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
  isHolidayOff,
  pendingSub,
  existingSub,
  isSubMode,
  isCombineTarget,
  onCellClick,
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

  const isClickable = isSubMode && (isUnavailable || pendingSub || isCombineTarget);

  const handleClick = (e) => {
    if (!isClickable || !onCellClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onCellClick(slot, rect);
  };

  return (
    <td
      colSpan={colSpan}
      draggable={isAdmin && !isSubMode}
      onDragStart={isAdmin && !isSubMode ? onDragStart : undefined}
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
        cursor: isClickable ? "pointer" : isAdmin && !isSubMode ? "grab" : "default",
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
          {formatBiweeklyTeacher(slot.teacher, slot.note)}
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
  isSubMode,
  holidayOffSlots,
  pendingSubMap,
  existingSubMap,
  onCellClick,
  combineMode,
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

  // Helper to compute cell props
  const getCellSubProps = (slot) => {
    if (!slot) return {};
    const isOff = holidayOffSlots.has(slot.id);
    const isUnavail = unavailableTeachers.size > 0 &&
      getSlotTeachers(slot).some((t) => unavailableTeachers.has(t));
    const isCombineTarget = combineMode && slot.id !== combineMode.sourceSlotId;
    return {
      isUnavailable: isUnavail && !isOff,
      isHolidayOff: isOff,
      pendingSub: pendingSubMap.get(slot.id) || null,
      existingSub: existingSubMap.get(slot.id) || null,
      isSubMode,
      isCombineTarget: !!isCombineTarget,
      onCellClick: onCellClick
        ? (s, rect) => {
            // In combine mode, any cell can be clicked
            if (combineMode) {
              onCellClick(s, rect, "");
              return;
            }
            const teachers = getSlotTeachers(s);
            const absent = teachers.find((t) => unavailableTeachers.has(t));
            if (absent) onCellClick(s, rect, absent);
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
                        const subProps = getCellSubProps(combined.slot);
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
                            {...subProps}
                          />
                        );
                      }
                      // This column is consumed by a prior combined cell (colSpan)
                      return null;
                    }

                    // Individual slot
                    const slot = findSlotForCell(sectionSlots, day, time, col.grade, col.cls, col.room);
                    const cellKey = `${time}_${col.grade}_${col.cls}_${col.room}`;
                    const subProps = getCellSubProps(slot);
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
  subs,
  saveSubs,
  holidays,
  examPeriods,
  subjectCategories,
  teacherSubjects,
  onAddAdjustment,
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

  // Substitution mode hook
  const subMode = useSubstitutionMode({
    slots: filteredSlots,
    subs: subs || [],
    saveSubs: saveSubs || (() => {}),
    holidays: holidays || [],
    examPeriods: examPeriods || [],
    partTimeStaff: partTimeStaff || [],
    subjects: subjects || [],
    subjectCategories: subjectCategories || [],
    timetables: timetables || [],
    biweeklyAnchors: biweeklyAnchors || [],
    teacherSubjects: teacherSubjects || {},
    unavailableTeachers,
  });

  // Clear unavailable selection when day changes
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

  // Destructure stable callbacks from subMode to avoid stale deps
  const {
    setSubDate, clearSubMode: clearSub, openPopover,
    combineMode, completeCombine, popoverTarget,
    startCombine, assignSubstitute, removeAssignment, closePopover,
    saveAll, discardAll,
  } = subMode;

  // Handle date change: set date and auto-select the day
  const handleDateChange = useCallback((dateStr) => {
    if (!dateStr) {
      clearSub();
      return;
    }
    // Validate: dateToDay returns null for days without slots (e.g. Sunday)
    const day = dateToDay(dateStr);
    if (!day) return;
    setSubDate(dateStr);
    setSelectedDay(day);
  }, [clearSub, setSubDate]);

  // Handle cell click in substitution mode
  const handleCellClick = useCallback((slot, rect, originalTeacher) => {
    // If in combine mode, complete the combine
    if (combineMode) {
      if (slot.id !== combineMode.sourceSlotId) {
        completeCombine(slot.id, onAddAdjustment);
      }
      return;
    }
    openPopover(slot.id, rect, originalTeacher);
  }, [combineMode, completeCombine, onAddAdjustment, openPopover]);

  // Popover slot lookup
  const popoverSlot = useMemo(() => {
    if (!popoverTarget) return null;
    return filteredSlots.find((s) => s.id === popoverTarget.slotId) || null;
  }, [popoverTarget, filteredSlots]);

  // Use dateFilteredSlots in sub mode, otherwise timetable-filtered slots
  const displaySlots = subMode.isSubMode ? subMode.dateFilteredSlots : filteredSlots;

  return (
    <div>
      {/* Date selector for substitution mode */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 10,
          flexWrap: "wrap",
          padding: "8px 12px",
          background: subMode.isSubMode ? "#f0f8ff" : "#f8f8f8",
          border: `1px solid ${subMode.isSubMode ? "#b0d0f0" : "#e0e0e0"}`,
          borderRadius: 8,
        }}
      >
        <label style={{ fontSize: 11, fontWeight: 700, color: "#555" }}>
          代行管理日付
        </label>
        <input
          type="date"
          value={subMode.subDate || ""}
          onChange={(e) => handleDateChange(e.target.value)}
          style={{ ...S.input, width: "auto", minWidth: 140 }}
        />
        {subMode.isSubMode && (
          <>
            <span style={{ fontSize: 11, color: "#3a6ea5", fontWeight: 700 }}>
              {subMode.dayOfDate}曜日 - 代行モード
            </span>
            <button
              onClick={() => handleDateChange("")}
              style={{ ...S.btn(false), fontSize: 10 }}
            >
              解除
            </button>
          </>
        )}
        {!subMode.isSubMode && (
          <span style={{ fontSize: 10, color: "#999" }}>
            日付を入力すると代行モードになります
          </span>
        )}
      </div>

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
          const isLocked = subMode.isSubMode && d !== subMode.dayOfDate;
          return (
            <button
              key={d}
              type="button"
              onClick={() => !isLocked && setSelectedDay(d)}
              style={{
                padding: "8px 18px",
                border: active ? `2px solid ${DC[d]}` : "1px solid #ddd",
                borderRadius: 8,
                background: active ? DC[d] : hasSlotsForDay ? DB[d] : "#f5f5f5",
                color: active ? "#fff" : hasSlotsForDay ? DC[d] : "#bbb",
                fontWeight: 800,
                fontSize: 15,
                cursor: isLocked ? "not-allowed" : hasSlotsForDay ? "pointer" : "default",
                opacity: isLocked ? 0.3 : hasSlotsForDay ? 1 : 0.5,
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
        {subMode.isSubMode
          ? "欠席講師を右パネルで選択 → 赤いセルをクリックして代行者を割り当て"
          : isAdmin
            ? "コマをドラッグして移動 / ダブルクリックで編集"
            : "時間割の閲覧モード"}
      </div>

      {/* Combine mode banner */}
      {combineMode && (
        <div
          style={{
            padding: "8px 14px",
            marginBottom: 10,
            background: "#fff8e0",
            border: "1px solid #e0c860",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: "#8a6000" }}>
            合同にするコマをクリックしてください
          </span>
          <button
            onClick={subMode.cancelCombine}
            style={{ ...S.btn(false), fontSize: 10 }}
          >
            キャンセル
          </button>
        </div>
      )}

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
                    slots={displaySlots}
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
                    isSubMode={subMode.isSubMode}
                    holidayOffSlots={subMode.holidayOffSlots}
                    pendingSubMap={subMode.pendingSubMap}
                    existingSubMap={subMode.existingSubMap}
                    onCellClick={subMode.isSubMode ? handleCellClick : undefined}
                    combineMode={combineMode}
                  />
                );
              })}
            </div>
          )}

          {/* Pending subs save bar */}
          {subMode.isSubMode && subMode.pendingSubs.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 16px",
                background: "#e8f5e8",
                border: "1px solid #b0d8b0",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "#2a7a2a" }}>
                仮代行: {subMode.pendingSubs.length}件
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={discardAll}
                  style={S.btn(false)}
                >
                  破棄
                </button>
                <button
                  onClick={saveAll}
                  style={{ ...S.btn(true), background: "#2a7a2a" }}
                >
                  確定して保存
                </button>
              </div>
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
          slots={displaySlots}
          selectedDay={selectedDay}
        />
      </div>

      {/* Substitution Popover */}
      {popoverTarget && popoverSlot && (
        <SubstitutionPopover
          anchorRect={popoverTarget.rect}
          slot={popoverSlot}
          originalTeacher={popoverTarget.originalTeacher}
          availableTeachers={subMode.availableTeachers}
          suggestion={subMode.suggestionMap.get(popoverSlot.id) || null}
          subjects={subjects || []}
          pendingSub={subMode.pendingSubMap.get(popoverSlot.id) || null}
          onAssign={(teacher) =>
            assignSubstitute(
              popoverSlot.id,
              popoverTarget.originalTeacher,
              teacher
            )
          }
          onRemoveAssignment={() => removeAssignment(popoverSlot.id)}
          onCombine={() => startCombine(popoverSlot.id)}
          onClose={closePopover}
        />
      )}
    </div>
  );
}
