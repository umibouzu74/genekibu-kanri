import { useMemo } from 'react';
import { makeKey } from '../utils/scheduleKey';

// セル操作アクションを dispatch でラップする。
//
// v3: 引数は ID ベース (dateId, periodId, classId)。UI 側は config.dates[i].id 等で
// 取得して渡す。合同伝播・cleanup・並列更新はすべて projectReducer の各 case で処理。
//
// メモ化の説明:
//   - handleCellCopy は currentSchedule を読む読み取り専用関数で、最新の
//     schedule を見る必要があるため currentSchedule に依存する。
//   - dispatch-only な cell ops は dispatch のみ参照で本来は stable にできるが、
//     handleCellCopy と一緒にひとつの object に詰めているため、結局
//     currentSchedule 変化で memo が invalidate される。
//   - 実用上、currentSchedule が変わるのは schedule 変更時 (= project state
//     変化時) で、ProjectContext.value の memo も同じタイミングで invalidate
//     されるため、ここで個別 callback を stable にしても context consumer
//     の re-render 回避には繋がらない。よって 1 つの memo に束ねている。
//   - 仮に handleCellCopy 不要になれば deps を [dispatch] のみにして本当に
//     stable にできる。
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
    // handleSetNg は useProject.js の composer 側で teacher/toggleNg のラッパとして
    // 定義する (cell 位置 → 講師名・date.label・period.label の解決が必要なため)。
    handleClearUnlocked: () =>
      dispatch({ type: 'schedule/clearUnlocked' }),
    // F2e: セル内容は渡さない。reducer が dispatch 時点の schedule から読む
    // (dragstart 時点の stale なデータで上書きしないため)。
    handleSwapCells: (sourceKey, targetKey) =>
      dispatch({ type: 'cell/swap', payload: { sourceKey, targetKey } }),
    // tabId = 生成元タブ (省略時はアクティブタブ)。結果パネルはタブ切替後も
    // 残るため、必ず生成時に記録したタブへ適用する。
    applyPattern: (pat, tabId) =>
      dispatch({ type: 'schedule/applyPattern', payload: { pat, tabId } }),
  }), [dispatch, currentSchedule]);
}
