import { useMemo } from 'react';
import { makeKey } from '../utils/scheduleKey';

// セル操作アクションを dispatch でラップする。合同伝播・cleanup・並列更新は
// すべて projectReducer の各 case で処理されるため、ここは薄いラッパに留まる。
//
// currentSchedule は handleCellCopy が現状のセルを読むためだけに必要
// (state を変えない reader)。currentSchedule の identity が変わるたびに memo を
// 作り直すが、cell ops 自体は dispatch のみで stable。
export function useScheduleActions(dispatch, currentSchedule) {
  return useMemo(() => ({
    handleAssign: (dIdx, pIdx, cIdx, type, val) =>
      dispatch({ type: 'cell/assign', payload: { dIdx, pIdx, cIdx, type, val } }),
    toggleLock: (dIdx, pIdx, cIdx) =>
      dispatch({ type: 'cell/toggleLock', payload: { dIdx, pIdx, cIdx } }),
    handleRenameHeader: (type, oldVal, newVal) =>
      dispatch({ type: 'schedule/renameHeader', payload: { type, oldVal, newVal } }),
    handleBulkAction: (action, type, val) =>
      dispatch({ type: 'schedule/bulkAction', payload: { action, type, val } }),
    handleCellCopy: (dIdx, pIdx, cIdx) => {
      // 読み取り専用。dispatch しない。
      const k = makeKey(dIdx, pIdx, cIdx);
      const curr = currentSchedule[k] || {};
      if (curr.subject) return { subject: curr.subject, teacher: curr.teacher };
      return null;
    },
    handleCellPaste: (dIdx, pIdx, cIdx, clipboard) =>
      dispatch({ type: 'cell/paste', payload: { dIdx, pIdx, cIdx, clipboard } }),
    handleCellClear: (dIdx, pIdx, cIdx) =>
      dispatch({ type: 'cell/clear', payload: { dIdx, pIdx, cIdx } }),
    handleSetNg: (dIdx, pIdx, cIdx) =>
      dispatch({ type: 'cell/setNg', payload: { dIdx, pIdx, cIdx } }),
    handleClearUnlocked: () =>
      dispatch({ type: 'schedule/clearUnlocked' }),
    handleSwapCells: (sourceKey, sourceData, targetKey, targetData) =>
      dispatch({ type: 'cell/swap', payload: { sourceKey, sourceData, targetKey, targetData } }),
    applyPattern: (pat) =>
      dispatch({ type: 'schedule/applyPattern', payload: { pat } }),
  }), [dispatch, currentSchedule]);
}
