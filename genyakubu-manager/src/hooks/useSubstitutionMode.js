import { useCallback, useMemo, useState } from "react";
import { dateToDay } from "../data";
import { getSlotTeachers } from "../utils/biweekly";
import { needsSubstitute } from "../utils/substituteState";
import { filterSlotsForDate } from "../utils/timetable";
import { makeEventHelpers } from "../components/views/dashboardHelpers";
import {
  computeAvailableTeachers,
  suggestChainSubstitutions,
} from "../utils/chainSubstitution";

/**
 * Custom hook for managing substitution mode in the timetable view.
 * When subDate is set, the timetable enters "substitution mode" where
 * users can assign substitutes to unavailable/holiday-off cells.
 */
export function useSubstitutionMode({
  slots,
  subs,
  saveSubs,
  holidays,
  examPeriods,
  partTimeStaff,
  subjects,
  subjectCategories,
  timetables,
  biweeklyAnchors,
  teacherSubjects,
  unavailableTeachers,
}) {
  const [subDate, setSubDateRaw] = useState(null);
  const [pendingSubs, setPendingSubs] = useState([]);
  const [popoverTarget, setPopoverTarget] = useState(null);
  const [combineMode, setCombineMode] = useState(null); // { sourceSlotId }

  const dayOfDate = subDate ? dateToDay(subDate) : null;
  const isSubMode = subDate !== null;

  // Filtered slots for the specific date (timetable-aware)
  const dateFilteredSlots = useMemo(() => {
    if (!subDate) return slots;
    return filterSlotsForDate(slots, subDate, timetables);
  }, [slots, subDate, timetables]);

  // Holiday/exam-cancelled slots
  const holidayOffSlots = useMemo(() => {
    if (!subDate) return new Set();
    const { isOffForGrade } = makeEventHelpers(holidays, examPeriods);
    const offSet = new Set();
    for (const s of dateFilteredSlots) {
      if (s.day === dayOfDate && isOffForGrade(subDate, s.grade, s.subj)) {
        offSet.add(s.id);
      }
    }
    return offSet;
  }, [subDate, dayOfDate, dateFilteredSlots, holidays, examPeriods]);

  // Existing saved subs for this date
  const existingSubs = useMemo(() => {
    if (!subDate) return [];
    return subs.filter((s) => s.date === subDate);
  }, [subs, subDate]);

  // Map slotId -> Substitute[] (元講師ごとに 1 件なので、多担任コマは複数)。
  const existingSubMap = useMemo(() => {
    const m = new Map();
    for (const s of existingSubs) {
      if (!m.has(s.slotId)) m.set(s.slotId, []);
      m.get(s.slotId).push(s);
    }
    return m;
  }, [existingSubs]);

  // Map slotId -> pending sub for quick lookup
  const pendingSubMap = useMemo(() => {
    const m = new Map();
    for (const s of pendingSubs) m.set(s.slotId, s);
    return m;
  }, [pendingSubs]);

  // Available teachers (auto-detected from holidays, biweekly, etc.)
  const availableTeachers = useMemo(() => {
    if (!subDate) return [];
    return computeAvailableTeachers(
      subDate, dateFilteredSlots, holidays, examPeriods, subs,
      partTimeStaff, subjects, timetables, biweeklyAnchors,
      teacherSubjects || {}
    );
  }, [
    subDate, dateFilteredSlots, holidays, examPeriods, subs,
    partTimeStaff, subjects, timetables, biweeklyAnchors, teacherSubjects,
  ]);

  // All teachers who have any slot on this day (including busy ones).
  // Used by the "全員表示" toggle in the popover.
  const allTeachersForDay = useMemo(() => {
    if (!subDate || !dayOfDate) return [];
    const map = new Map(); // name -> { name, slotsToday, isPartTime, subjectIds }
    const staffNameSet = new Set(partTimeStaff.map((s) => s.name));
    for (const slot of dateFilteredSlots) {
      if (slot.day !== dayOfDate) continue;
      const names = getSlotTeachers(slot);
      for (const n of names) {
        if (!map.has(n)) {
          const isPartTime = staffNameSet.has(n);
          let subjectIds;
          if (teacherSubjects?.[n]?.length > 0) {
            subjectIds = teacherSubjects[n];
          } else if (isPartTime) {
            const staff = partTimeStaff.find((s) => s.name === n);
            subjectIds = staff ? staff.subjectIds : [];
          } else {
            subjectIds = [];
          }
          map.set(n, { name: n, slotsToday: [], isPartTime, subjectIds });
        }
        map.get(n).slotsToday.push(slot);
      }
    }
    return [...map.values()];
  }, [subDate, dayOfDate, dateFilteredSlots, partTimeStaff, teacherSubjects]);

  // Build uncovered slots from unavailableTeachers + holidayOff
  // (slots that need substitutes but don't have one yet)
  const uncoveredSlots = useMemo(() => {
    if (!subDate || !dayOfDate) return [];
    const result = [];
    for (const slot of dateFilteredSlots) {
      if (slot.day !== dayOfDate) continue;
      if (holidayOffSlots.has(slot.id)) continue; // cancelled, no sub needed
      if (pendingSubMap.has(slot.id)) continue; // pending assignment

      // 代行が要るかは**講師ごと**。代行者が入っているレコードだけが
      // 「対応済み」で、代行未定 (substitute: "") はまさに探している状態、
      // 代行なしで確定したものは探さない (残りの担当者で回す)。
      const forSlot = existingSubMap.get(slot.id) || [];
      const stateOf = new Map(forSlot.map((x) => [x.originalTeacher, x]));
      for (const t of getSlotTeachers(slot)) {
        if (!unavailableTeachers.has(t)) continue;
        const existing = stateOf.get(t);
        if (existing && !needsSubstitute(existing)) continue;
        result.push({ slotId: slot.id, originalTeacher: t, date: subDate });
      }
    }
    return result;
  }, [subDate, dayOfDate, dateFilteredSlots, holidayOffSlots, existingSubMap, pendingSubMap, unavailableTeachers]);

  // Chain suggestions
  const chainSuggestions = useMemo(() => {
    if (!subDate || uncoveredSlots.length === 0 || availableTeachers.length === 0) return [];
    return suggestChainSubstitutions(
      uncoveredSlots, availableTeachers, dateFilteredSlots,
      subjects, subjectCategories || [], partTimeStaff
    );
  }, [subDate, uncoveredSlots, availableTeachers, dateFilteredSlots, subjects, subjectCategories, partTimeStaff]);

  // Suggestion map for quick lookup
  const suggestionMap = useMemo(() => {
    const m = new Map();
    for (const s of chainSuggestions) m.set(s.slotId, s);
    return m;
  }, [chainSuggestions]);

  // --- Actions ---

  const setSubDate = useCallback((dateStr) => {
    setSubDateRaw(dateStr || null);
    setPendingSubs([]);
    setPopoverTarget(null);
    setCombineMode(null);
  }, []);

  const clearSubMode = useCallback(() => {
    setSubDateRaw(null);
    setPendingSubs([]);
    setPopoverTarget(null);
    setCombineMode(null);
  }, []);

  const assignSubstitute = useCallback((slotId, originalTeacher, substitute) => {
    setPendingSubs((prev) => {
      const next = prev.filter((s) => s.slotId !== slotId);
      next.push({ slotId, originalTeacher, substitute });
      return next;
    });
    setPopoverTarget(null);
  }, []);

  const removeAssignment = useCallback((slotId) => {
    setPendingSubs((prev) => prev.filter((s) => s.slotId !== slotId));
  }, []);

  const openPopover = useCallback((slotId, rect, originalTeacher, anchorEl) => {
    setPopoverTarget({ slotId, rect, originalTeacher, anchorEl: anchorEl || null });
  }, []);

  const closePopover = useCallback(() => {
    setPopoverTarget(null);
  }, []);

  const saveAll = useCallback(() => {
    if (pendingSubs.length === 0 || !subDate) return;
    const ts = new Date().toISOString();
    let nextId = subs.reduce((m, s) => Math.max(m, s.id || 0), 0) + 1;

    const updatedIds = new Set();
    const newRecords = [];
    for (const p of pendingSubs) {
      // Check if there's an existing record for this slot (replace if found)
      const existing = subs.find(
        (s) =>
          s.date === subDate &&
          s.slotId === p.slotId &&
          s.originalTeacher === p.originalTeacher
      );
      if (existing) updatedIds.add(existing.id);
      newRecords.push({
        id: existing ? existing.id : nextId++,
        date: subDate,
        slotId: p.slotId,
        originalTeacher: p.originalTeacher,
        substitute: p.substitute,
        status: "confirmed",
        memo: "",
        createdAt: existing?.createdAt || ts,
        updatedAt: ts,
      });
    }
    const kept = subs.filter((s) => !updatedIds.has(s.id));
    saveSubs([...kept, ...newRecords]);
    setPendingSubs([]);
  }, [pendingSubs, subDate, subs, saveSubs]);

  const discardAll = useCallback(() => {
    setPendingSubs([]);
  }, []);

  const startCombine = useCallback((sourceSlotId) => {
    setCombineMode({ sourceSlotId });
    setPopoverTarget(null);
  }, []);

  const completeCombine = useCallback((targetSlotId, onAddAdjustment) => {
    if (!combineMode || !subDate) return;
    if (onAddAdjustment) {
      onAddAdjustment({
        date: subDate,
        type: "combine",
        slotId: combineMode.sourceSlotId,
        combineSlotIds: [targetSlotId],
        memo: "",
      });
    }
    setCombineMode(null);
  }, [combineMode, subDate]);

  const cancelCombine = useCallback(() => {
    setCombineMode(null);
  }, []);

  return {
    subDate,
    dayOfDate,
    isSubMode,
    dateFilteredSlots,
    holidayOffSlots,
    existingSubMap,
    pendingSubMap,
    availableTeachers,
    allTeachersForDay,
    chainSuggestions,
    suggestionMap,
    uncoveredSlots,
    pendingSubs,
    popoverTarget,
    setSubDate,
    clearSubMode,
    assignSubstitute,
    removeAssignment,
    openPopover,
    closePopover,
    saveAll,
    discardAll,
    combineMode,
    startCombine,
    completeCombine,
    cancelCombine,
  };
}
