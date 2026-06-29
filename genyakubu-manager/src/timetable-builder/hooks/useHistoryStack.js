import { useEffect, useReducer, useRef, useState, useCallback } from 'react';
import { STORAGE_KEY_PROJECT } from '../utils/constants';
import { loadInitialProject } from './projectFactory';
import { projectReducer } from './projectReducer';

const SAVE_DEBOUNCE_MS = 800;

// project state を useReducer で管理し、Undo/Redo 履歴と LocalStorage 自動保存
// をまとめたフック。
//
// state 形状は projectReducer.js のコメントを参照。
//
// 公開 API:
//   project, dispatch, history, historyIndex, saveStatus, undo, redo, loadError
//   (旧 pushHistory / setProject は撤去。dispatch を直接使うか、ラッパとして
//    useProject / アクションフックが提供する。)
export function useHistoryStack() {
  const [state, dispatch] = useReducer(projectReducer, null, () => {
    const { project, loadError } = loadInitialProject();
    return {
      project,
      history: [project],
      historyIndex: 0,
      loadError,
    };
  });

  const [saveStatus, setSaveStatus] = useState("✅ 保存済");
  const saveTimerRef = useRef(null);
  const isInitialMount = useRef(true);

  // project 変化を debounce で LocalStorage に保存。初回マウントは skip。
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // LocalStorage 書き込みは容量超過 (QuotaExceededError) や private mode で
    // throw しうる。未捕捉だと render エフェクトが落ちるので握って status に出す。
    try {
      localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(state.project));
      setSaveStatus("💾 保存中...");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveStatus("✅ 保存済"), SAVE_DEBOUNCE_MS);
    } catch (e) {
      console.error("Autosave failed", e);
      setSaveStatus("⚠️ 保存失敗");
    }
  }, [state.project]);

  const undo = useCallback(() => {
    dispatch({ type: 'history/undo' });
  }, []);
  const redo = useCallback(() => {
    dispatch({ type: 'history/redo' });
  }, []);

  return {
    project: state.project,
    dispatch,
    history: state.history,
    historyIndex: state.historyIndex,
    saveStatus,
    undo,
    redo,
    loadError: state.loadError,
  };
}
