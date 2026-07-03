import { useMemo } from 'react';
import type { Dispatch } from 'react';
import { makeKey } from '../utils/scheduleKey';
import type { ProjectAction } from './projectReducer';
import type { Schedule } from '../types';

type CellField = 'subject' | 'teacher';
type HeaderType = 'date' | 'period' | 'class';
type BulkActionKind = 'lock-all' | 'unlock-all' | 'clear-all';

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
export function useScheduleActions(dispatch: Dispatch<ProjectAction>, currentSchedule: Schedule) {
  return useMemo(() => ({
    handleAssign: (dateId: number, periodId: number, classId: number, type: CellField, val: string) =>
      dispatch({ type: 'cell/assign', payload: { dateId, periodId, classId, type, val } }),
    toggleLock: (dateId: number, periodId: number, classId: number) =>
      dispatch({ type: 'cell/toggleLock', payload: { dateId, periodId, classId } }),
    handleRenameHeader: (type: HeaderType, oldVal: string, newVal: string) =>
      dispatch({ type: 'schedule/renameHeader', payload: { type, oldVal, newVal } }),
    handleBulkAction: (action: BulkActionKind, type: HeaderType, val: string) =>
      dispatch({ type: 'schedule/bulkAction', payload: { action, type, val } }),
    handleCellCopy: (dateId: number, periodId: number, classId: number): { subject: string; teacher?: string } | null => {
      // 読み取り専用。dispatch しない。
      const k = makeKey(dateId, periodId, classId);
      const curr = currentSchedule[k] || {};
      if (curr.subject) return { subject: curr.subject, teacher: curr.teacher };
      return null;
    },
    handleCellPaste: (dateId: number, periodId: number, classId: number, clipboard: { subject?: string; teacher?: string } | null) =>
      dispatch({ type: 'cell/paste', payload: { dateId, periodId, classId, clipboard } }),
    handleCellClear: (dateId: number, periodId: number, classId: number) =>
      dispatch({ type: 'cell/clear', payload: { dateId, periodId, classId } }),
    // handleSetNg は useProject.js の composer 側で teacher/toggleNg のラッパとして
    // 定義する (cell 位置 → 講師名・date.label・period.label の解決が必要なため)。
    handleClearUnlocked: () =>
      dispatch({ type: 'schedule/clearUnlocked' }),
    // F2e: セル内容は渡さない。reducer が dispatch 時点の schedule から読む
    // (dragstart 時点の stale なデータで上書きしないため)。
    handleSwapCells: (sourceKey: string, targetKey: string) =>
      dispatch({ type: 'cell/swap', payload: { sourceKey, targetKey } }),
    // L2c: 起点セルの割当を使う全日の同じ時限・クラスへ適用
    applyToAllDates: (dateId: number, periodId: number, classId: number) =>
      dispatch({ type: 'cell/applyToAllDates', payload: { dateId, periodId, classId } }),
    // L2c: 1 日分の列を別の日へ複製
    copyDateColumn: (sourceDateId: number, targetDateId: number) =>
      dispatch({ type: 'schedule/copyDateColumn', payload: { sourceDateId, targetDateId } }),
    // tabId = 生成元タブ (省略時はアクティブタブ)。結果パネルはタブ切替後も
    // 残るため、必ず生成時に記録したタブへ適用する。
    applyPattern: (pat: Schedule, tabId?: number) =>
      dispatch({ type: 'schedule/applyPattern', payload: { pat, tabId } }),
    // K4a: 別タブの割当を現在のタブへ複製 (クラスは label 一致 > index)
    copyScheduleFromTab: (sourceTabId: number) =>
      dispatch({ type: 'schedule/copyFromTab', payload: { sourceTabId } }),
  }), [dispatch, currentSchedule]);
}
