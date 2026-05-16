import { useMemo } from 'react';
import { makeKey } from '../utils/scheduleKey';

// セル操作アクションを dispatch でラップする。
//
// v3: 引数は ID ベース (dateId, periodId, classId)。UI 側は config.dates[i].id 等で
// 取得して渡す。合同伝播・cleanup・並列更新はすべて projectReducer の各 case で処理。
//
// currentSchedule は handleCellCopy が現状のセルを読むためだけに必要
// (state を変えない reader)。currentSchedule の identity が変わるたびに memo を
// 作り直すが、cell ops 自体は dispatch のみで stable。
export function useScheduleActions(dispatch, currentSchedule) {
  return useMemo(() => ({
    handleAssign: (dateId, periodId, classId, type, val) =>
      dispatch({ type: 'cell/assign', payload: { dateId, periodId, classId, type, val } }),
    toggleLock: (dateId, periodId, classId) =>
      dispatch({ type: 'cell/toggleLock', payload: { dateId, periodId, classId } }),
    handleRenameHeader: (type, oldVal, newVal) =>
      dispatch({ type: 'schedule/renameHeader', payload: { type, oldVal, newVal } }),
    handleBulkAction: (action, type, val) =>
      dispatch({ type: 'schedule/bulkAction', payload: { action, type, val } }),
    handleCellCopy: (dateId, periodId, classId) => {
      // 読み取り専用。dispatch しない。
      const k = makeKey(dateId, periodId, classId);
      const curr = currentSchedule[k] || {};
      if (curr.subject) return { subject: curr.subject, teacher: curr.teacher };
      return null;
    },
    handleCellPaste: (dateId, periodId, classId, clipboard) =>
      dispatch({ type: 'cell/paste', payload: { dateId, periodId, classId, clipboard } }),
    handleCellClear: (dateId, periodId, classId) =>
      dispatch({ type: 'cell/clear', payload: { dateId, periodId, classId } }),
    handleSetNg: (dateId, periodId, classId) =>
      dispatch({ type: 'cell/setNg', payload: { dateId, periodId, classId } }),
    handleClearUnlocked: () =>
      dispatch({ type: 'schedule/clearUnlocked' }),
    handleSwapCells: (sourceKey, sourceData, targetKey, targetData) =>
      dispatch({ type: 'cell/swap', payload: { sourceKey, sourceData, targetKey, targetData } }),
    applyPattern: (pat) =>
      dispatch({ type: 'schedule/applyPattern', payload: { pat } }),
  }), [dispatch, currentSchedule]);
}
