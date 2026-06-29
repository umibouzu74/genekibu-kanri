import { useMemo } from 'react';

// 講師管理アクションを dispatch でラップする。
// dispatch は useReducer から得られる安定参照なので、返り値の関数群も
// re-render で identity が変わらない。
export function useTeacherActions(dispatch) {
  return useMemo(() => ({
    addTeacher: (name) => dispatch({ type: 'teacher/add', payload: { name } }),
    importTeachers: (teachers, mode) =>
      dispatch({ type: 'teacher/import', payload: { teachers, mode } }),
    removeTeacher: (idx) => dispatch({ type: 'teacher/remove', payload: { idx } }),
    renameTeacher: (idx, newName) =>
      dispatch({ type: 'teacher/rename', payload: { idx, newName } }),
    toggleTeacherSubject: (idx, subject) =>
      dispatch({ type: 'teacher/toggleSubject', payload: { idx, subject } }),
    toggleTeacherNg: (idx, date, period) =>
      dispatch({ type: 'teacher/toggleNg', payload: { idx, date, period } }),
    setNgBatch: (idxs, dateLabels, periodLabels, value) =>
      dispatch({ type: 'teacher/setNgBatch', payload: { idxs, dateLabels, periodLabels, value } }),
    importNgSlots: (entries) =>
      dispatch({ type: 'teacher/importNg', payload: { entries } }),
    toggleTeacherClassPriority: (idx, className) =>
      dispatch({ type: 'teacher/toggleClassPriority', payload: { idx, className } }),
    handleExternalCountChange: (date, teacherName, value) =>
      dispatch({ type: 'teacher/setExternalCount', payload: { date, teacherName, value } }),
    addExternalSession: (date, teacherName, label, memo, startTime, endTime) =>
      dispatch({
        type: 'teacher/addExternalSession',
        payload: { date, teacherName, label, memo, startTime, endTime },
      }),
    addExternalSessions: (items) =>
      dispatch({ type: 'teacher/addExternalSessions', payload: { items } }),
    removeExternalSession: (id) =>
      dispatch({ type: 'teacher/removeExternalSession', payload: { id } }),
    // 他学年セッション登録プリセット (時刻 / 期間 / メモ の頻出パターン)
    addExternalSessionPreset: (preset) =>
      dispatch({ type: 'preset/add', payload: preset }),
    updateExternalSessionPreset: (id, updates) =>
      dispatch({ type: 'preset/update', payload: { id, updates } }),
    removeExternalSessionPreset: (id) =>
      dispatch({ type: 'preset/remove', payload: { id } }),
  }), [dispatch]);
}
