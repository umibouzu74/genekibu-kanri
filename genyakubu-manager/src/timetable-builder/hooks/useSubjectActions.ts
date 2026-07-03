import { useMemo } from 'react';
import type { Dispatch } from 'react';
import type { ProjectAction } from './projectReducer';

// 科目マスタアクションを dispatch でラップする。
// 削除時の 5 箇所 cascade (subjects / subjectCounts / schedule / teachers /
// subjectColors) は reducer の 'subject/remove' で集中管理。
export function useSubjectActions(dispatch: Dispatch<ProjectAction>) {
  return useMemo(() => ({
    addSubject: (name: string) => dispatch({ type: 'subject/add', payload: { name } }),
    // L4d/L4c: 複数科目の一括追加 (重複・空は reducer 側で除外、atomic)
    addSubjects: (names: string[]) => dispatch({ type: 'subject/addMany', payload: { names } }),
    removeSubject: (name: string) => dispatch({ type: 'subject/remove', payload: { name } }),
    reorderSubjects: (fromIdx: number, toIdx: number) =>
      dispatch({ type: 'subject/reorder', payload: { fromIdx, toIdx } }),
    updateSubjectColor: (subject: string, color: string) =>
      dispatch({ type: 'subject/setColor', payload: { subject, color } }),
    // L4a: タブ 1 列の全科目を同じコマ数に / タブの値を他タブへコピー
    fillSubjectCounts: (tabId: number, value: unknown) =>
      dispatch({ type: 'config/fillSubjectCounts', payload: { tabId, value } }),
    copySubjectCountsToOthers: (sourceTabId: number) =>
      dispatch({ type: 'config/copySubjectCountsToOthers', payload: { sourceTabId } }),
  }), [dispatch]);
}
