import { useEffect, useReducer, useRef, useState, useCallback } from 'react';
import { STORAGE_KEY_PROJECT } from '../utils/constants';
import { loadInitialProject } from './projectFactory';
import { projectReducer } from './projectReducer';

// 実書き込みの debounce 間隔 (F2c)。この間に来た連続編集は 1 回の
// JSON.stringify + setItem にまとめる。
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
  // debounce 中の未保存 project。null = 未保存分なし。
  const pendingProjectRef = useRef(null);
  const isInitialMount = useRef(true);

  // 未保存分を即時書き込みする。debounce タイマー発火・アンマウント・
  // ページ離脱 (pagehide/beforeunload) の 3 経路から呼ばれる。
  // LocalStorage 書き込みは容量超過 (QuotaExceededError) や private mode で
  // throw しうる。未捕捉だと effect が落ちるので握って status に出す。
  const flushSave = useCallback(() => {
    const pending = pendingProjectRef.current;
    if (pending == null) return;
    pendingProjectRef.current = null;
    try {
      localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(pending));
      setSaveStatus("✅ 保存済");
    } catch (e) {
      console.error("Autosave failed", e);
      setSaveStatus("⚠️ 保存失敗");
    }
  }, []);

  // project 変化を debounce して LocalStorage に保存 (F2c)。初回マウントは skip。
  // 旧実装は毎 dispatch で同期 JSON.stringify + setItem していた (debounce は
  // ステータス表示のみ) ため、大規模プロジェクトでは keystroke ごとの
  // 直列化が入力レイテンシ源になっていた。実書き込み自体を debounce する。
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    pendingProjectRef.current = state.project;
    setSaveStatus("💾 保存中...");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      flushSave();
    }, SAVE_DEBOUNCE_MS);
  }, [state.project, flushSave]);

  // debounce 確定前の離脱で編集を取りこぼさないための flush。
  // - pagehide / beforeunload: タブ閉じ・リロード (両方登録し pending の
  //   null チェックで二重書き込みを防ぐ)
  // - cleanup: Builder からの view 切替等によるアンマウント
  useEffect(() => {
    const onLeave = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      flushSave();
    };
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
      onLeave();
    };
  }, [flushSave]);

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
