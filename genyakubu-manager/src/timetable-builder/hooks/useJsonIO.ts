import { useRef, useCallback } from 'react';
import type { ChangeEvent, Dispatch } from 'react';
import type { ProjectAction } from './projectReducer';
import type { Project, Tab } from '../types';

type NotifyFn = (message: string, type?: string) => void;
type ConfirmFn = (message: string, options?: { title?: string; confirmLabel?: string }) => Promise<boolean>;
import {
  STORAGE_KEY_PROJECT,
  STORAGE_KEY_USER_DEFAULTS,
  LEGACY_STORAGE_KEYS,
  cleanSchedule,
} from '../utils/constants';
import { migrateProject } from '../utils/scheduleKey';
import { validateProjectShape } from '../utils/projectSchema';
import { detectTeacherDiffs, loadInitialProject } from './projectFactory';

// JSON 保存・読込・デフォルト保存・全リセットをまとめたフック。
// 編集系のアクションとは独立した関心 (ファイル I/O + ストレージリセット)。
// load 系は dispatch({ type: 'project/replace' }) で reducer に流す。
export function useJsonIO({
  project,
  activeTab,
  dispatch,
}: {
  project: Project;
  activeTab: Tab;
  dispatch: Dispatch<ProjectAction>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveAsDefault = useCallback(() => {
    // v4: dates / periods は project 共通。config に混ぜて保存しておくと
    // loadInitialProject → createNewProject が project へ hoist して復元できる。
    const config = { ...activeTab.config, dates: project.dates, periods: project.periods };
    const defaults = { teachers: project.teachers, config };
    localStorage.setItem(STORAGE_KEY_USER_DEFAULTS, JSON.stringify(defaults));
  }, [project, activeTab]);

  const handleResetAll = useCallback(() => {
    // LocalStorage を消した上で loadInitialProject を再実行する。これにより
    // 「user defaults があれば user defaults ベースで、無ければ hardcoded
    // default で再構築」という reload 経路と同じ挙動を維持する。
    // 履歴も初期化したいので project/replace ではなく project/reset を dispatch。
    localStorage.removeItem(STORAGE_KEY_PROJECT);
    LEGACY_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    const { project: freshProject } = loadInitialProject();
    dispatch({ type: 'project/reset', payload: freshProject });
  }, [dispatch]);

  const handleLoadJson = useCallback((e: ChangeEvent<HTMLInputElement>, onNotify?: NotifyFn, onConfirm?: ConfirmFn) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async (ev) => {
      try {
        // readAsText 経由なので result は常に string
        const data = JSON.parse(ev.target?.result as string);
        // 構造を検証してから migrate / 適用 (E3d)。不正なら適用せず通知。
        const { valid, error } = validateProjectShape(data);
        if (!valid) {
          if (onNotify) onNotify(`JSON の構造が不正です: ${error}`, 'error');
          return;
        }
        const migrated = migrateProject(data);

        const diffs = detectTeacherDiffs(project.teachers, migrated.teachers || []);
        if (diffs.length > 0 && onConfirm) {
          const diffText = diffs.join("\n");
          const confirmed = await onConfirm(
            `読み込むデータの講師マスタに現在のプロジェクトとの差分があります:\n\n${diffText}\n\nこのまま読み込みますか？`,
            { title: "講師マスタの差分検出", confirmLabel: "読み込む" }
          );
          if (!confirmed) return;
        }

        dispatch({ type: 'project/replace', payload: { project: cleanSchedule(migrated) } });
        if (onNotify) onNotify("読込完了", "success");
      } catch {
        if (onNotify) onNotify("読み込みエラー", "error");
      }
    };
    r.readAsText(f);
    e.target.value = '';
  }, [project.teachers, dispatch]);

  const handleSaveJson = useCallback(() => {
    const cleaned = cleanSchedule(project);
    const b = new Blob([JSON.stringify(cleaned, null, 2)], { type: "application/json" });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    const datePart = new Date().toISOString().slice(0, 10);
    // Windows のファイル名禁則文字を除去。
    const namePart = (project.name || "時間割").replace(/[\\/:?*[\]<>|"]/g, "");
    a.download = `${namePart}_${datePart}.json`;
    a.click();
    URL.revokeObjectURL(u);
  }, [project]);

  return {
    fileInputRef,
    handleSaveAsDefault,
    handleResetAll,
    handleLoadJson,
    handleSaveJson,
  };
}
