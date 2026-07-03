import { useMemo } from 'react';
import type { Dispatch } from 'react';
import type { ProjectAction } from './projectReducer';

// 科目マスタアクションを dispatch でラップする。
// 削除時の 5 箇所 cascade (subjects / subjectCounts / schedule / teachers /
// subjectColors) は reducer の 'subject/remove' で集中管理。
export function useSubjectActions(dispatch: Dispatch<ProjectAction>) {
  return useMemo(() => ({
    addSubject: (name: string) => dispatch({ type: 'subject/add', payload: { name } }),
    removeSubject: (name: string) => dispatch({ type: 'subject/remove', payload: { name } }),
    reorderSubjects: (fromIdx: number, toIdx: number) =>
      dispatch({ type: 'subject/reorder', payload: { fromIdx, toIdx } }),
    updateSubjectColor: (subject: string, color: string) =>
      dispatch({ type: 'subject/setColor', payload: { subject, color } }),
  }), [dispatch]);
}
