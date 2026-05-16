import { useRef, useCallback } from 'react';
import {
  STORAGE_KEY_PROJECT,
  STORAGE_KEY_USER_DEFAULTS,
  LEGACY_STORAGE_KEYS,
  cleanSchedule,
} from '../utils/constants';
import { migrateProject } from '../utils/scheduleKey';
import { detectTeacherDiffs } from './projectFactory';

// JSON 保存・読込・デフォルト保存・全リセットをまとめたフック。
// 編集系のアクションとは独立した関心 (ファイル I/O + ストレージリセット)。
export function useJsonIO({ project, activeTab, pushHistory }) {
  const fileInputRef = useRef(null);

  const handleSaveAsDefault = useCallback(() => {
    const defaults = { teachers: project.teachers, config: activeTab.config };
    localStorage.setItem(STORAGE_KEY_USER_DEFAULTS, JSON.stringify(defaults));
  }, [project, activeTab]);

  const handleResetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_PROJECT);
    LEGACY_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    window.location.reload();
  }, []);

  const handleLoadJson = useCallback((e, onNotify, onConfirm) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
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

        pushHistory(cleanSchedule(migrated));
        if (onNotify) onNotify("読込完了", "success");
      } catch {
        if (onNotify) onNotify("読み込みエラー", "error");
      }
    };
    r.readAsText(f);
    e.target.value = '';
  }, [project.teachers, pushHistory]);

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
