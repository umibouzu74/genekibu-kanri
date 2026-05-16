import { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEY_PROJECT } from '../utils/constants';
import { loadInitialProject } from './projectFactory';

const MAX_HISTORY = 50;
const SAVE_DEBOUNCE_MS = 800;

// プロジェクトの state と Undo/Redo 履歴、LocalStorage 自動保存をひとつに
// 束ねたフック。useProject の中で他のアクションがすべて参照する基盤。
export function useHistoryStack() {
  const [project, setProject] = useState(loadInitialProject);
  const [history, setHistory] = useState(() => [project]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState("✅ 保存済");

  const saveTimerRef = useRef(null);
  const isInitialMount = useRef(true);
  // setState のクロージャ古化を避けるため、最新の history/index を ref に
  // 写しておく。pushHistory/undo/redo は ref 経由で最新値にアクセスする。
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  historyRef.current = history;
  historyIndexRef.current = historyIndex;

  // 初回マウントは保存しない (loadInitialProject 直後に書き戻すのを避ける)。
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(project));
    setSaveStatus("💾 保存中...");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus("✅ 保存済"), SAVE_DEBOUNCE_MS);
  }, [project]);

  const pushHistory = useCallback((newProject) => {
    const updated = { ...newProject, updatedAt: new Date().toISOString() };
    setHistory(prev => {
      const idx = historyIndexRef.current;
      const newHistory = prev.slice(0, idx + 1);
      newHistory.push(updated);
      if (newHistory.length > MAX_HISTORY) newHistory.shift();
      const newIdx = newHistory.length - 1;
      setHistoryIndex(newIdx);
      historyIndexRef.current = newIdx;
      return newHistory;
    });
    setProject(updated);
  }, []);

  const undo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx > 0) {
      setHistoryIndex(idx - 1);
      historyIndexRef.current = idx - 1;
      setProject(hist[idx - 1]);
    }
  }, []);

  const redo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx < hist.length - 1) {
      setHistoryIndex(idx + 1);
      historyIndexRef.current = idx + 1;
      setProject(hist[idx + 1]);
    }
  }, []);

  return {
    project,
    setProject,
    history,
    historyIndex,
    saveStatus,
    pushHistory,
    undo,
    redo,
  };
}
