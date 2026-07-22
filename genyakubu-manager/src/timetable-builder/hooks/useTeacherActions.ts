import { useMemo } from 'react';
import type { Dispatch } from 'react';
import type { ProjectAction } from './projectReducer';
import type { ExternalSessionPreset } from '../types';

// 講師管理アクションを dispatch でラップする。
// dispatch は useReducer から得られる安定参照なので、返り値の関数群も
// re-render で identity が変わらない。
export function useTeacherActions(dispatch: Dispatch<ProjectAction>) {
  return useMemo(() => ({
    addTeacher: (name: string) => dispatch({ type: 'teacher/add', payload: { name } }),
    importTeachers: (teachers: Array<{ name: string; subjects?: string[] }>, mode?: 'append' | 'replace') =>
      dispatch({ type: 'teacher/import', payload: { teachers, mode } }),
    removeTeacher: (idx: number) => dispatch({ type: 'teacher/remove', payload: { idx } }),
    renameTeacher: (idx: number, newName: string) =>
      dispatch({ type: 'teacher/rename', payload: { idx, newName } }),
    toggleTeacherSubject: (idx: number, subject: string) =>
      dispatch({ type: 'teacher/toggleSubject', payload: { idx, subject } }),
    setTeacherLimit: (idx: number, key: 'maxDailyHours' | 'maxTotalHours' | 'maxConsecutivePeriods', value: unknown) =>
      dispatch({ type: 'teacher/setLimit', payload: { idx, key, value } }),
    toggleTeacherNg: (idx: number, date: string, period: string) =>
      dispatch({ type: 'teacher/toggleNg', payload: { idx, date, period } }),
    setNgBatch: (idxs: number[], dateLabels: string[], periodLabels: string[], value: boolean) =>
      dispatch({ type: 'teacher/setNgBatch', payload: { idxs, dateLabels, periodLabels, value } }),
    importNgSlots: (entries: Array<{ name: string; date: string; period: string }>) =>
      dispatch({ type: 'teacher/importNg', payload: { entries } }),
    clearAllManualNg: () => dispatch({ type: 'teacher/clearAllManualNg' }),
    clearAllNg: () => dispatch({ type: 'teacher/clearAllNg' }),
    toggleTeacherClassPriority: (idx: number, className: string) =>
      dispatch({ type: 'teacher/toggleClassPriority', payload: { idx, className } }),
    handleExternalCountChange: (date: string, teacherName: string, value: unknown) =>
      dispatch({ type: 'teacher/setExternalCount', payload: { date, teacherName, value } }),
    addExternalSession: (date: string, teacherName: string, label?: string, memo?: string, startTime?: string, endTime?: string) =>
      dispatch({
        type: 'teacher/addExternalSession',
        payload: { date, teacherName, label, memo, startTime, endTime },
      }),
    addExternalSessions: (items: Array<{ date: string; teacherName: string; label?: string; memo?: string; startTime?: string; endTime?: string }>) =>
      dispatch({ type: 'teacher/addExternalSessions', payload: { items } }),
    removeExternalSession: (id: number) =>
      dispatch({ type: 'teacher/removeExternalSession', payload: { id } }),
    // メモ未設定のセッションに時刻一致プリセットの名前を一括適用 (後付け)
    applyPresetMemosToSessions: () =>
      dispatch({ type: 'teacher/applyPresetMemos' }),
    // 他学年セッション登録プリセット (時刻 / 期間 / メモ の頻出パターン)
    addExternalSessionPreset: (preset: { name: string; startTime?: string; endTime?: string; startDateLabel?: string; endDateLabel?: string; memo?: string; teachers?: string[] }) =>
      dispatch({ type: 'preset/add', payload: preset }),
    // syncSessionMemos=true で、名称/メモの変更を「そのプリセット由来
    // (変更前ラベル + 時刻一致)」の登録済みセッションのメモへも同期する
    updateExternalSessionPreset: (id: number, updates: Partial<Omit<ExternalSessionPreset, 'id'>>, syncSessionMemos = false) =>
      dispatch({ type: 'preset/update', payload: { id, updates, syncSessionMemos } }),
    removeExternalSessionPreset: (id: number) =>
      dispatch({ type: 'preset/remove', payload: { id } }),
  }), [dispatch]);
}
