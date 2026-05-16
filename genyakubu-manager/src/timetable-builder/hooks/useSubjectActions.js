import { useMemo } from 'react';

// 科目マスタアクションを dispatch でラップする。
// 削除時の 5 箇所 cascade (subjects / subjectCounts / schedule / teachers /
// subjectColors) は reducer の 'subject/remove' で集中管理。
export function useSubjectActions(dispatch) {
  return useMemo(() => ({
    addSubject: (name) => dispatch({ type: 'subject/add', payload: { name } }),
    removeSubject: (name) => dispatch({ type: 'subject/remove', payload: { name } }),
    reorderSubjects: (fromIdx, toIdx) =>
      dispatch({ type: 'subject/reorder', payload: { fromIdx, toIdx } }),
    updateSubjectColor: (subject, color) =>
      dispatch({ type: 'subject/setColor', payload: { subject, color } }),
  }), [dispatch]);
}
