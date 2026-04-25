import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DAY_COLOR as DC,
  DAY_BG as DB,
  DAYS,
  DEPT_COLOR,
  fmtDate,
  dateToDay,
} from "../../data";
import { getDashSections } from "../../constants/schedule";
import { getSlotTeachers } from "../../utils/biweekly";
import { groupParallelSlots } from "../../utils/parallelSlots";
import { useTeacherGroups } from "../../hooks/useTeacherGroups";
import { useSubstitutionMode } from "../../hooks/useSubstitutionMode";
import { StaffUnavailabilityPanel } from "../StaffUnavailabilityPanel";
import { SubstitutionPopover } from "../SubstitutionPopover";
import { S } from "../../styles/common";
import { buildSessionCountMap } from "../../utils/sessionCount";
import { filterSlotsByActiveTimetable } from "../../utils/timetable";
import { useSessionCtx } from "../../hooks/useSessionCtx";
import { ExcelSection } from "./excelGrid/ExcelSection";

// DAYS = ["月","火","水","木","金","土"]。viewDate を含む週の月曜日を起点に
// 各曜日の日付 (YYYY-MM-DD) を算出して返す。viewDate 未指定時は空 Map。
function computeWeekDates(viewDate) {
  const out = new Map();
  if (!viewDate) return out;
  const [y, m, d] = viewDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  // getDay: 日=0, 月=1, ..., 土=6。日曜日を基準に月曜までの差分を引く。
  const dow = dt.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(dt);
  monday.setDate(dt.getDate() + mondayOffset);
  for (let i = 0; i < DAYS.length; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    out.set(DAYS[i], fmtDate(cur));
  }
  return out;
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
  classSets,
  displayCutoff,
  viewDate,
  onViewDateChange,
  onAddAdjustment,
  enableSubMode = false,
  adjustments = [],
  sessionOverrides = [],
  dashboardMode = false,
}) {
  const [selectedDay, setSelectedDay] = useState("月");
  const [dragState, setDragState] = useState({ draggingId: null, overCell: null });
  const [unavailableTeachers, setUnavailableTeachers] = useState(new Set());
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Filter by active timetable
  const filteredSlots = useMemo(
    () => filterSlotsByActiveTimetable(slots, timetables, activeTimetableId),
    [slots, timetables, activeTimetableId]
  );

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

  const bulkToggleTeachers = useCallback((names, selected) => {
    setUnavailableTeachers((prev) => {
      const next = new Set(prev);
      for (const n of names) {
        if (selected) next.add(n);
        else next.delete(n);
      }
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

  // Handle drag-and-drop swap in substitution mode
  const handleSubDrop = useCallback((sourceSlot, targetSlot) => {
    const sourceTeachers = getSlotTeachers(sourceSlot);
    const targetTeachers = getSlotTeachers(targetSlot);
    // Prefer absent teacher, fall back to first
    const sourceTeacher = sourceTeachers.find((t) => unavailableTeachers.has(t)) || sourceTeachers[0];
    const targetTeacher = targetTeachers.find((t) => unavailableTeachers.has(t)) || targetTeachers[0];
    if (!sourceTeacher || !targetTeacher) return;
    if (sourceTeacher === targetTeacher) return;

    // Assign source teacher's slot to target teacher (and vice versa)
    assignSubstitute(sourceSlot.id, sourceTeacher, targetTeacher);
    assignSubstitute(targetSlot.id, targetTeacher, sourceTeacher);
  }, [assignSubstitute, unavailableTeachers]);

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
  const handleCellClick = useCallback((slot, rect, originalTeacher, anchorEl) => {
    // If in combine mode, complete the combine
    if (combineMode) {
      if (slot.id !== combineMode.sourceSlotId) {
        completeCombine(slot.id, onAddAdjustment);
      }
      return;
    }
    openPopover(slot.id, rect, originalTeacher, anchorEl);
  }, [combineMode, completeCombine, onAddAdjustment, openPopover]);

  // Popover slot lookup
  const popoverSlot = useMemo(() => {
    if (!popoverTarget) return null;
    return filteredSlots.find((s) => s.id === popoverTarget.slotId) || null;
  }, [popoverTarget, filteredSlots]);

  // Use dateFilteredSlots in sub mode, otherwise timetable-filtered slots
  const rawDisplaySlots = subMode.isSubMode ? subMode.dateFilteredSlots : filteredSlots;

  // 同一コホートで担任だけ異なる並列スロット (例: 中3 火 確認テスト 藤田 + 大屋敷)
  // を 1 コマにまとめる。groupTeacherMap は代表スロットに「藤田・大屋敷」を割当。
  const grouped = useMemo(
    () => groupParallelSlots(rawDisplaySlots),
    [rawDisplaySlots]
  );
  // 集約は閲覧用途限定。管理モード (スロット編集) および代行モード (個別
  // スロットに対する欠席/代行割当) では個別スロット情報を保つ必要があるため
  // 元配列をそのまま使う。セッション回数のカウントは sessionCount 内部で
  // 並列スロットを重複除去するため、どちらのパスでも正しく集計される。
  const shouldGroup = !isAdmin && !subMode.isSubMode;
  const displaySlots = shouldGroup ? grouped.representativeSlots : rawDisplaySlots;
  const groupTeacherMap = shouldGroup ? grouped.groupTeacherMap : null;

  // viewDate を含む週の月〜土の日付を曜日→"YYYY-MM-DD" で保持。
  const weekDates = useMemo(() => computeWeekDates(viewDate), [viewDate]);

  // viewDate が指定されたらその曜日に selectedDay を自動同期
  useEffect(() => {
    if (!viewDate) return;
    const day = dateToDay(viewDate);
    if (day && day !== selectedDay) setSelectedDay(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  // ─── Session count (第 N 回) 計算 ──────────────────────────────
  // 対象日の決定優先順位:
  //   1. 代行モードの subDate
  //   2. viewDate (ダッシュボードの日付ピッカー等) — 曜日が一致する時
  //   3. selectedDay の直近発生日 (今日以前) — フォールバック
  // 注: `new Date()` は useMemo deps に含めていないため、タブを開いた
  // まま深夜0時を跨ぐと値が更新されない。再計算にはリロードが必要。
  const sessionTargetDate = useMemo(() => {
    if (subMode.subDate) return subMode.subDate;
    if (viewDate && dateToDay(viewDate) === selectedDay) return viewDate;
    if (!selectedDay) return null;
    const d = new Date();
    for (let i = 0; i < 14; i++) {
      const dateStr = fmtDate(d);
      if (dateToDay(dateStr) === selectedDay) return dateStr;
      d.setDate(d.getDate() - 1);
    }
    return null;
  }, [subMode.subDate, viewDate, selectedDay]);

  const { sessionCtx, isOffForGrade, holidaysFor } = useSessionCtx({
    classSets,
    slots: displaySlots,
    displayCutoff,
    holidays,
    examPeriods,
    biweeklyAnchors,
    sessionOverrides,
  });

  const sessionCountMap = useMemo(() => {
    if (!sessionTargetDate || !sessionCtx.displayCutoff) return new Map();
    const daySlots = displaySlots.filter((s) => s.day === selectedDay);
    return buildSessionCountMap(daySlots, sessionTargetDate, sessionCtx);
  }, [sessionTargetDate, selectedDay, displaySlots, sessionCtx]);

  // 表示中の日付。代行モード中は subDate、そうでなければ選択曜日に対応する
  // 実日付 (sessionTargetDate を流用)。隔週 weekType 計算とダッシュボードの
  // 代行表示の両方で使う。
  const displayDate = subMode.subDate || sessionTargetDate;

  // ダッシュボード表示用: 表示中日付の代行を slotId → Substitute でマップ化。
  // 代行モード中は subMode.existingSubMap を優先する (下で分岐)。
  const dashboardSubMap = useMemo(() => {
    if (!dashboardMode || !displayDate) return new Map();
    const m = new Map();
    for (const sub of subs || []) {
      if (sub.date === displayDate) m.set(sub.slotId, sub);
    }
    return m;
  }, [dashboardMode, displayDate, subs]);

  const effectiveSubMap = subMode.isSubMode
    ? subMode.existingSubMap
    : dashboardSubMap;

  // ダッシュボード表示モードでも休講・試験期間の対象スロットをセル側で
  // ハイライトできるよう holidayOffSlots を組み立てる。代行モード中は
  // subMode.holidayOffSlots を優先するので干渉しない。
  const dashboardHolidayOffSlots = useMemo(() => {
    if (!dashboardMode || !displayDate || !isOffForGrade) return new Set();
    const offSet = new Set();
    for (const s of displaySlots) {
      if (s.day !== selectedDay) continue;
      if (isOffForGrade(displayDate, s.grade, s.subj)) offSet.add(s.id);
    }
    return offSet;
  }, [dashboardMode, displayDate, displaySlots, selectedDay, isOffForGrade]);

  const effectiveHolidayOffSlots = subMode.isSubMode
    ? subMode.holidayOffSlots
    : dashboardHolidayOffSlots;

  // ダッシュボード表示モードのみ: 表示日に該当する休講をヘッダで一覧表示。
  const dashboardHolidaysForDay = useMemo(() => {
    if (!dashboardMode || !displayDate || !holidaysFor) return [];
    return holidaysFor(displayDate);
  }, [dashboardMode, displayDate, holidaysFor]);

  return (
    <div>
      {/* Date selector for substitution mode (only when enabled) */}
      {enableSubMode && (
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
              {subMode.uncoveredSlots.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#c03030",
                  background: "#fde4e4", padding: "2px 8px", borderRadius: 10,
                }}>
                  未割当: {subMode.uncoveredSlots.length}件
                </span>
              )}
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
      )}

      {/* Day Tab Bar */}
      <div
        className="no-print"
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
          const dateStr = weekDates.get(d);
          const mdLabel = dateStr
            ? (() => {
                const [, mm, dd] = dateStr.split("-");
                return `${Number(mm)}/${Number(dd)}`;
              })()
            : null;
          const handleClick = () => {
            if (isLocked) return;
            setSelectedDay(d);
            if (dateStr && onViewDateChange) onViewDateChange(dateStr);
          };
          return (
            <button
              key={d}
              type="button"
              onClick={handleClick}
              style={{
                padding: "6px 14px",
                border: active ? `2px solid ${DC[d]}` : "1px solid #ddd",
                borderRadius: 8,
                background: active ? DC[d] : hasSlotsForDay ? DB[d] : "#f5f5f5",
                color: active ? "#fff" : hasSlotsForDay ? DC[d] : "#bbb",
                fontWeight: 800,
                fontSize: 15,
                cursor: isLocked ? "not-allowed" : hasSlotsForDay ? "pointer" : "default",
                opacity: isLocked ? 0.3 : hasSlotsForDay ? 1 : 0.5,
                transition: "all .15s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                lineHeight: 1.15,
                minWidth: 52,
              }}
            >
              <span>{d}</span>
              {mdLabel && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    opacity: 0.85,
                    marginTop: 2,
                  }}
                >
                  {mdLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Guide */}
      <div className="no-print" style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
        {subMode.isSubMode
          ? "欠席講師を右パネルで選択 → セルをクリックして代行者を割り当て / ドラッグで入れ替え"
          : isAdmin
            ? "コマをドラッグして移動 / ダブルクリックで編集"
            : "時間割の閲覧モード"}
      </div>

      {/* Holiday banner (dashboard mode): 表示日に該当する休講をまとめて表示 */}
      {dashboardMode && dashboardHolidaysForDay.length > 0 && (
        <div
          style={{
            padding: "8px 12px",
            marginBottom: 10,
            background: "#fff5e0",
            border: "1px solid #e0b860",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 800, color: "#8a5a10" }}>
            🚫 休講
          </span>
          {dashboardHolidaysForDay.map((h) => {
            const sc = h.scope || ["全部"];
            const tg = h.targetGrades || [];
            const sk = h.subjKeywords || [];
            const parts = [];
            if (sc.length > 0) parts.push(sc.join("・"));
            if (tg.length > 0) parts.push(tg.join("・"));
            if (sk.length > 0) parts.push(sk.join("・"));
            return (
              <span
                key={h.id}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: "#fff",
                  color: "#8a5a10",
                  border: "1px solid #e0b860",
                  padding: "2px 8px",
                  borderRadius: 10,
                }}
              >
                {parts.join(" / ")}
                {h.label ? ` (${h.label})` : ""}
              </span>
            );
          })}
        </div>
      )}

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
      <div className="mobile-stack" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Sections */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!daysWithSlots.has(selectedDay) ? (
            <div
              style={{
                textAlign: "center",
                color: "#666",
                padding: "40px 20px",
                background: "#fff",
                borderRadius: 8,
                border: "1px solid #e0e0e0",
                lineHeight: 1.7,
              }}
            >
              <div aria-hidden="true" style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>
                📭
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                {selectedDay}曜日のコマがありません
              </div>
              {daysWithSlots.size > 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "#888",
                    display: "flex",
                    gap: 6,
                    justifyContent: "center",
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginTop: 6,
                  }}
                >
                  <span>コマのある曜日:</span>
                  {DAYS.filter((d) => daysWithSlots.has(d)).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDay(d)}
                      style={{
                        background: "#3a6ea5",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        padding: "3px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#888" }}>
                  コースマスターからコマを登録してください
                </div>
              )}
            </div>
          ) : (
            (() => {
              const sections = getDashSections(selectedDay);
              const leftCol = [];
              const rightCol = [];
              const otherCol = [];
              for (const sec of sections) {
                if (sec.dept === "中学部") leftCol.push(sec);
                else if (sec.dept === "高校部") rightCol.push(sec);
                else otherCol.push(sec);
              }
              const renderSection = (sec) => {
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
                    subDate={displayDate}
                    holidayOffSlots={effectiveHolidayOffSlots}
                    pendingSubMap={subMode.pendingSubMap}
                    existingSubMap={effectiveSubMap}
                    onCellClick={subMode.isSubMode ? handleCellClick : undefined}
                    combineMode={combineMode}
                    onSubDrop={subMode.isSubMode ? handleSubDrop : undefined}
                    sessionCountMap={sessionCountMap}
                    groupTeacherMap={groupTeacherMap}
                    dashboardMode={dashboardMode}
                    adjustments={dashboardMode || subMode.isSubMode ? adjustments : []}
                  />
                );
              };
              return (
                <div
                  className="excel-grid-sections"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div
                    className="excel-print-col-ms"
                    style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}
                  >
                    {leftCol.map(renderSection)}
                  </div>
                  <div
                    className="excel-print-col-hs"
                    style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}
                  >
                    {[...rightCol, ...otherCol].map(renderSection)}
                  </div>
                </div>
              );
            })()
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
                  onClick={() => window.confirm("仮代行をすべて破棄しますか？") && discardAll()}
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

        {/* Unavailability Panel (only in substitution-enabled views) */}
        {enableSubMode && (
          <StaffUnavailabilityPanel
            teacherGroups={teacherGroups}
            unavailableTeachers={unavailableTeachers}
            onToggleTeacher={toggleTeacher}
            onBulkToggle={bulkToggleTeachers}
            onClearAll={clearAllUnavailable}
            collapsed={panelCollapsed}
            onToggleCollapse={() => setPanelCollapsed((p) => !p)}
            slots={displaySlots}
            selectedDay={selectedDay}
          />
        )}
      </div>

      {/* Substitution Popover */}
      {popoverTarget && popoverSlot && (
        <SubstitutionPopover
          anchorEl={popoverTarget.anchorEl}
          anchorRect={popoverTarget.rect}
          slot={popoverSlot}
          originalTeacher={popoverTarget.originalTeacher}
          availableTeachers={subMode.availableTeachers}
          allTeachersForDay={subMode.allTeachersForDay}
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
          slots={displaySlots}
          pendingSubs={subMode.pendingSubs}
          partTimeStaff={partTimeStaff}
        />
      )}
    </div>
  );
}
