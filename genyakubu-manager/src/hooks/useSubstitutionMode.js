import { useCallback, useMemo, useState } from "react";
import { activeTeachersOnDate } from "../utils/absenceHelpers";
import { dateToDay } from "../data";
import { needsSubstitute } from "../utils/substituteState";
import { filterSlotsForDate } from "../utils/timetable";
import { isSlotCancelledOnDate } from "../utils/slotCancel";
import { makeEventHelpers } from "../components/views/dashboardHelpers";
import { useOptionalToasts } from "./useToasts";
import {
  computeAvailableTeachers,
  suggestChainSubstitutions,
} from "../utils/chainSubstitution";

// 仮代行 (pendingSubs) の索引キー。欠勤・代行は「コマ × 講師」単位
// (CLAUDE.md) なので、コマ id だけで引くと多担任コマ (香川·福江·川井) で
// 2 人目の仮代行が 1 人目を黙って上書きする (2026-09-15)。
export const pendingKey = (slotId, originalTeacher) =>
  `${slotId}\u0000${originalTeacher || ""}`;

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
  // 特別時程の部分休講とコマ休講 (utils/slotCancel) も「代行の要らない
  // コマ」に含める
  daySchedules = [],
  adjustments = [],
}) {
  const toasts = useOptionalToasts();
  const [subDate, setSubDateRaw] = useState(null);
  const [pendingSubs, setPendingSubs] = useState([]);
  const [popoverTarget, setPopoverTarget] = useState(null);
  const [combineMode, setCombineMode] = useState(null); // { sourceSlotId }

  const dayOfDate = subDate ? dateToDay(subDate) : null;
  const isSubMode = subDate !== null;
  // 隔週の A/B (+ 休講・テスト期間による週送り) を解いて「その日に実際に
  // 担当する講師」を出すための材料。講師欄 (getSlotTeachers) をそのまま
  // 使うと B 週のコマに A 週の主担当で代行が付く
  const biweeklyCtx = useMemo(
    () => ({ biweeklyAnchors, holidays, examPeriods }),
    [biweeklyAnchors, holidays, examPeriods]
  );

  // Filtered slots for the specific date (timetable-aware)
  const dateFilteredSlots = useMemo(() => {
    if (!subDate) return slots;
    return filterSlotsForDate(slots, subDate, timetables);
  }, [slots, subDate, timetables]);

  // Holiday/exam-cancelled slots (+ 特別時程の部分休講・コマ休講)
  const holidayOffSlots = useMemo(() => {
    if (!subDate) return new Set();
    const { isOffForGrade } = makeEventHelpers(holidays, examPeriods);
    const cancelCtx = { daySchedules, adjustments };
    const offSet = new Set();
    for (const s of dateFilteredSlots) {
      if (s.day !== dayOfDate) continue;
      if (
        isOffForGrade(subDate, s.grade, s.subj) ||
        isSlotCancelledOnDate(s, subDate, cancelCtx)
      ) {
        offSet.add(s.id);
      }
    }
    return offSet;
  }, [subDate, dayOfDate, dateFilteredSlots, holidays, examPeriods, daySchedules, adjustments]);

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

  // Map slotId -> pending sub[] (元講師ごとに 1 件。existingSubMap と同じ形)。
  // 1 件だけ引く用途は getPendingSub(slotId, originalTeacher)
  const pendingSubMap = useMemo(() => {
    const m = new Map();
    for (const s of pendingSubs) {
      if (!m.has(s.slotId)) m.set(s.slotId, []);
      m.get(s.slotId).push(s);
    }
    return m;
  }, [pendingSubs]);
  const pendingByKey = useMemo(() => {
    const m = new Map();
    for (const s of pendingSubs) m.set(pendingKey(s.slotId, s.originalTeacher), s);
    return m;
  }, [pendingSubs]);
  const getPendingSub = useCallback(
    (slotId, originalTeacher) =>
      pendingByKey.get(pendingKey(slotId, originalTeacher)) || null,
    [pendingByKey]
  );

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
      const names = activeTeachersOnDate(slot, subDate, biweeklyCtx);
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
  }, [subDate, dayOfDate, dateFilteredSlots, partTimeStaff, teacherSubjects, biweeklyCtx]);

  // Build uncovered slots from unavailableTeachers + holidayOff
  // (slots that need substitutes but don't have one yet)
  const uncoveredSlots = useMemo(() => {
    if (!subDate || !dayOfDate) return [];
    const result = [];
    for (const slot of dateFilteredSlots) {
      if (slot.day !== dayOfDate) continue;
      if (holidayOffSlots.has(slot.id)) continue; // cancelled, no sub needed

      // 代行が要るかは**講師ごと**。代行者が入っているレコードだけが
      // 「対応済み」で、代行未定 (substitute: "") はまさに探している状態、
      // 代行なしで確定したものは探さない (残りの担当者で回す)。
      const forSlot = existingSubMap.get(slot.id) || [];
      const stateOf = new Map(forSlot.map((x) => [x.originalTeacher, x]));
      // 隔週は A/B を解いた「その日の担当」で見る (B 週なら note のパートナー)
      for (const t of activeTeachersOnDate(slot, subDate, biweeklyCtx)) {
        if (!unavailableTeachers.has(t)) continue;
        if (pendingByKey.has(pendingKey(slot.id, t))) continue; // 仮代行済み
        const existing = stateOf.get(t);
        if (existing && !needsSubstitute(existing)) continue;
        result.push({ slotId: slot.id, originalTeacher: t, date: subDate });
      }
    }
    return result;
  }, [subDate, dayOfDate, dateFilteredSlots, holidayOffSlots, existingSubMap, pendingByKey, unavailableTeachers, biweeklyCtx]);

  // Chain suggestions
  const chainSuggestions = useMemo(() => {
    if (!subDate || uncoveredSlots.length === 0 || availableTeachers.length === 0) return [];
    return suggestChainSubstitutions(
      uncoveredSlots, availableTeachers, dateFilteredSlots,
      subjects, subjectCategories || [], partTimeStaff
    );
  }, [subDate, uncoveredSlots, availableTeachers, dateFilteredSlots, subjects, subjectCategories, partTimeStaff]);

  // Suggestion map for quick lookup. uncoveredSlots / chainSuggestions は
  // (コマ, 元講師) 単位なので、コマ id だけで引くと多担任コマで 2 人目の
  // 提案が 1 人目を黙って上書きし、ポップオーバーが別人の提案を出す。
  // 索引は pendingByKey と同じ pendingKey (slotId, originalTeacher)
  const suggestionMap = useMemo(() => {
    const m = new Map();
    for (const s of chainSuggestions) m.set(pendingKey(s.slotId, s.originalTeacher), s);
    return m;
  }, [chainSuggestions]);
  const getSuggestion = useCallback(
    (slotId, originalTeacher) =>
      suggestionMap.get(pendingKey(slotId, originalTeacher)) || null,
    [suggestionMap]
  );

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

  // (コマ, 元講師) 単位で差し替える。同じコマの別講師の仮代行は残す
  const assignSubstitute = useCallback((slotId, originalTeacher, substitute) => {
    setPendingSubs((prev) => {
      const key = pendingKey(slotId, originalTeacher);
      const next = prev.filter((s) => pendingKey(s.slotId, s.originalTeacher) !== key);
      next.push({ slotId, originalTeacher, substitute });
      return next;
    });
    setPopoverTarget(null);
  }, []);

  // originalTeacher 省略 = そのコマの仮代行を全部消す (useAbsenceDraft.clearSub と同じ規約)
  const removeAssignment = useCallback((slotId, originalTeacher) => {
    setPendingSubs((prev) =>
      originalTeacher === undefined
        ? prev.filter((s) => s.slotId !== slotId)
        : prev.filter(
            (s) => pendingKey(s.slotId, s.originalTeacher) !== pendingKey(slotId, originalTeacher)
          )
    );
  }, []);

  const openPopover = useCallback((slotId, rect, originalTeacher, anchorEl) => {
    setPopoverTarget({ slotId, rect, originalTeacher, anchorEl: anchorEl || null });
  }, []);

  const closePopover = useCallback(() => {
    setPopoverTarget(null);
  }, []);

  // 仮代行を確定して保存する。同じ (日付, コマ, 元講師) のレコードがあれば
  // 置き換えるが、欠勤登録時に入れた理由メモは引き継ぐ (代行者を決めただけで
  // 「体調不良」が消えないように)。戻り値は保存件数
  const saveAll = useCallback(() => {
    if (pendingSubs.length === 0 || !subDate) return 0;
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
        memo: existing?.memo || "",
        createdAt: existing?.createdAt || ts,
        updatedAt: ts,
      });
    }
    const kept = subs.filter((s) => !updatedIds.has(s.id));
    saveSubs([...kept, ...newRecords]);
    setPendingSubs([]);
    setPopoverTarget(null);
    toasts?.success(`代行 ${newRecords.length} 件を保存しました`);
    return newRecords.length;
  }, [pendingSubs, subDate, subs, saveSubs, toasts]);

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
    getPendingSub,
    availableTeachers,
    allTeachersForDay,
    chainSuggestions,
    suggestionMap,
    getSuggestion,
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
