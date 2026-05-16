import { useCallback } from 'react';
import { makeKey, parseKey } from '../utils/scheduleKey';
import {
  cleanupOldCombined,
  propagateAssignment,
  propagateTeacherChange,
} from '../utils/combinedPropagation';
import { cleanSchedule } from '../utils/constants';

// セル単位のスケジュール操作 (cell ops) をまとめたフック。
// useProject から抽出。合同グループ伝播は utils/combinedPropagation に
// 委譲する (B1 で共通化済み)。
//
// 入力:
//   - project / pushHistory: 編集と履歴の基盤
//   - currentConfig / currentSchedule: アクティブタブの派生データ
//   - toggleTeacherNg: handleSetNg が呼ぶ teacher 系アクション (cross-cutting)
export function useScheduleActions({
  project,
  pushHistory,
  currentConfig,
  currentSchedule,
  toggleTeacherNg,
}) {
  const handleAssign = useCallback((dIdx, pIdx, cIdx, type, val) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    if (currentSchedule[k]?.locked) return;
    const e = { ...(currentSchedule[k] || {}) };
    if (type === 'subject') { e.subject = val; e.teacher = ''; } else { e[type] = val; }

    let newSchedule = { ...currentSchedule, [k]: e };
    const groups = project.combinedGroups;

    if (type === 'subject') {
      const oldSubject = (currentSchedule[k] || {}).subject;
      if (oldSubject && oldSubject !== val) {
        newSchedule = cleanupOldCombined(newSchedule, currentConfig, groups, dIdx, pIdx, cIdx, oldSubject);
      }
      newSchedule = propagateAssignment(newSchedule, currentConfig, groups, dIdx, pIdx, cIdx, e);
    } else if (type === 'teacher' && e.subject) {
      newSchedule = propagateTeacherChange(newSchedule, currentConfig, groups, dIdx, pIdx, cIdx, e.subject, val);
    }

    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: newSchedule } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, currentSchedule, currentConfig, pushHistory]);

  const toggleLock = useCallback((dIdx, pIdx, cIdx) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    const e = { ...(currentSchedule[k] || {}) };
    e.locked = !e.locked;
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: { ...t.schedule, [k]: e } } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, currentSchedule, pushHistory]);

  const handleRenameHeader = useCallback((type, oldVal, newVal) => {
    if (!newVal || newVal === oldVal) return;
    const newConfig = { ...currentConfig };
    if (type === 'date') newConfig.dates = newConfig.dates.map(d => d === oldVal ? newVal : d);
    else if (type === 'period') newConfig.periods = newConfig.periods.map(p => p === oldVal ? newVal : p);
    else if (type === 'class') newConfig.classes = newConfig.classes.map(c => c === oldVal ? newVal : c);

    // インデックスベースのキーは config の名称変更に影響されないため、
    // スケジュールキーの付け替えは不要。
    // ただし NG スロットの名称も更新する
    if (type === 'date' || type === 'period') {
      const newTeachers = project.teachers.map(t => {
        if (!t.ngSlots || t.ngSlots.length === 0) return t;
        const newNgSlots = t.ngSlots.map(slot => {
          if (type === 'date' && slot.startsWith(`${oldVal}-`)) {
            return slot.replace(`${oldVal}-`, `${newVal}-`);
          }
          if (type === 'period' && slot.endsWith(`-${oldVal}`)) {
            return slot.substring(0, slot.lastIndexOf(`-${oldVal}`)) + `-${newVal}`;
          }
          return slot;
        });
        return { ...t, ngSlots: newNgSlots };
      });
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, config: newConfig } : t);
      pushHistory({ ...project, teachers: newTeachers, tabs: newTabs });
    } else {
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, config: newConfig } : t);
      pushHistory({ ...project, tabs: newTabs });
    }
  }, [project, currentConfig, pushHistory]);

  const handleBulkAction = useCallback((action, type, val) => {
    const ns = { ...currentSchedule };
    let upd = false;
    currentConfig.dates.forEach((date, dIdx) => currentConfig.periods.forEach((per, pIdx) => currentConfig.classes.forEach((cls, cIdx) => {
      if ((type === 'date' && date === val) || (type === 'class' && cls === val) || (type === 'period' && per === val)) {
        const k = makeKey(dIdx, pIdx, cIdx);
        if (!ns[k]) ns[k] = {};
        if (action === 'lock-all') { ns[k] = { ...ns[k], locked: true }; upd = true; }
        if (action === 'unlock-all') { ns[k] = { ...ns[k], locked: false }; upd = true; }
        if (action === 'clear-all' && !ns[k].locked) { delete ns[k]; upd = true; }
      }
    })));
    if (upd) {
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      pushHistory({ ...project, tabs: newTabs });
    }
  }, [project, currentConfig, currentSchedule, pushHistory]);

  const handleCellCopy = useCallback((dIdx, pIdx, cIdx) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    const curr = currentSchedule[k] || {};
    if (curr.subject) return { subject: curr.subject, teacher: curr.teacher };
    return null;
  }, [currentSchedule]);

  const handleCellPaste = useCallback((dIdx, pIdx, cIdx, clipboard) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    const curr = currentSchedule[k] || {};
    if (!clipboard || curr.locked) return;

    let ns = { ...currentSchedule };
    const groups = project.combinedGroups;

    if (curr.subject && curr.subject !== clipboard.subject) {
      ns = cleanupOldCombined(ns, currentConfig, groups, dIdx, pIdx, cIdx, curr.subject);
    }

    const newEntry = { ...curr, subject: clipboard.subject, teacher: clipboard.teacher };
    ns[k] = newEntry;
    ns = propagateAssignment(ns, currentConfig, groups, dIdx, pIdx, cIdx, newEntry);

    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, currentSchedule, currentConfig, pushHistory]);

  const handleCellClear = useCallback((dIdx, pIdx, cIdx) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    const curr = currentSchedule[k] || {};
    if (curr.locked) return;

    let ns = cleanupOldCombined(currentSchedule, currentConfig, project.combinedGroups, dIdx, pIdx, cIdx, curr.subject);
    ns = { ...ns };
    delete ns[k];
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, currentSchedule, currentConfig, pushHistory]);

  const handleSetNg = useCallback((dIdx, pIdx, cIdx) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    const curr = currentSchedule[k] || {};
    if (curr.teacher && curr.teacher !== '未定') {
      const teacherIdx = project.teachers.findIndex(t => t.name === curr.teacher);
      if (teacherIdx >= 0) {
        const date = currentConfig.dates[dIdx];
        const period = currentConfig.periods[pIdx];
        toggleTeacherNg(teacherIdx, date, period);
      }
    }
  }, [currentSchedule, currentConfig, project.teachers, toggleTeacherNg]);

  const handleClearUnlocked = useCallback(() => {
    const ns = {};
    Object.keys(currentSchedule).forEach(k => { if (currentSchedule[k].locked) ns[k] = currentSchedule[k]; });
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, currentSchedule, pushHistory]);

  const handleSwapCells = useCallback((sourceKey, sourceData, targetKey, targetData) => {
    if (targetData.locked) return;
    const sParsed = parseKey(sourceKey);
    const tParsed = parseKey(targetKey);
    if (!sParsed || !tParsed) return;

    const groups = project.combinedGroups;
    let ns = { ...currentSchedule };

    // スワップ前: 両セルの旧合同グループ secondary をクリア
    ns = cleanupOldCombined(ns, currentConfig, groups, sParsed.dIdx, sParsed.pIdx, sParsed.cIdx, sourceData.subject);
    ns = cleanupOldCombined(ns, currentConfig, groups, tParsed.dIdx, tParsed.pIdx, tParsed.cIdx, targetData.subject);

    // スワップ実行 (locked は false に落とす)
    ns = { ...ns };
    ns[sourceKey] = { ...targetData, locked: false };
    ns[targetKey] = { ...sourceData, locked: false };

    // スワップ後: 新合同グループに伝播
    ns = propagateAssignment(ns, currentConfig, groups, sParsed.dIdx, sParsed.pIdx, sParsed.cIdx, ns[sourceKey]);
    ns = propagateAssignment(ns, currentConfig, groups, tParsed.dIdx, tParsed.pIdx, tParsed.cIdx, ns[targetKey]);

    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, currentSchedule, currentConfig, pushHistory]);

  // 自動生成パターン適用。pat は生成時の project スナップショットを前提にした
  // インデックスベースキーを持つ。生成中〜採用までに config 編集があると無効キー
  // が残るので cleanSchedule で範囲外キーを破棄する。
  const applyPattern = useCallback((pat) => {
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: pat } : t);
    pushHistory(cleanSchedule({ ...project, tabs: newTabs }));
  }, [project, pushHistory]);

  return {
    handleAssign,
    toggleLock,
    handleRenameHeader,
    handleBulkAction,
    handleCellCopy,
    handleCellPaste,
    handleCellClear,
    handleSetNg,
    handleClearUnlocked,
    handleSwapCells,
    applyPattern,
  };
}
