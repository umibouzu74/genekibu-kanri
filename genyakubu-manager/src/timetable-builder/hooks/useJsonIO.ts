import { useRef, useCallback } from 'react';
import type { ChangeEvent, Dispatch } from 'react';
import type { ProjectAction } from './projectReducer';
import type { Project, Tab } from '../types';

type NotifyFn = (message: string, type?: string) => void;
type ConfirmFn = (message: string, options?: { title?: string; confirmLabel?: string }) => Promise<boolean>;
import {
  STORAGE_KEY_USER_DEFAULTS,
  cleanSchedule,
} from '../utils/constants';
import { detectTeacherDiffs, loadInitialProject } from './projectFactory';
import { loadTemplates } from '../utils/templates';
import { mergeImportedTemplates, parseProjectFile } from '../utils/projectFile';
import { GENERATION_PARAM_BOUNDS } from '../utils/generationParams';
import { stripAvailability } from '../utils/availabilityShape';
import type { SeasonStorage } from '../utils/seasons';

// JSON 保存・読込・デフォルト保存・全リセットをまとめたフック。
// 編集系のアクションとは独立した関心 (ファイル I/O + ストレージリセット)。
// load 系は dispatch({ type: 'project/replace' }) で reducer に流す。
export function useJsonIO({
  project,
  activeTab,
  dispatch,
  storage,
}: {
  project: Project;
  activeTab: Tab;
  dispatch: Dispatch<ProjectAction>;
  /** 開いている季節の保存先 (全リセットはこの季節だけ) */
  storage: Pick<SeasonStorage, 'storageKey' | 'backupKey'>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveAsDefault = useCallback(() => {
    // v4: dates / periods は project 共通。config に混ぜて保存しておくと
    // loadInitialProject → createNewProject が project へ hoist して復元できる。
    const config = { ...activeTab.config, dates: project.dates, periods: project.periods };
    // N1e: 科目マスタ・科目カラー・生成パラメータも初期値に含める。
    // teachers + config だけだと、科目をカスタムした環境でリセット後に
    // 科目・色が既定へ戻る一方、config.subjectCounts だけ保存されて
    // 存在しない科目の孤児が残っていた。
    const generationParams: Record<string, number> = {};
    (Object.keys(GENERATION_PARAM_BOUNDS) as Array<keyof typeof GENERATION_PARAM_BOUNDS>).forEach((key) => {
      const v = project[key];
      if (typeof v === 'number' && Number.isFinite(v)) generationParams[key] = v;
    });
    const defaults = {
      // 出勤可能調査の回答は季節ごとのものなので初期値に含めない
      teachers: stripAvailability(project.teachers),
      config,
      subjects: project.subjects,
      subjectColors: project.subjectColors,
      generationParams,
    };
    localStorage.setItem(STORAGE_KEY_USER_DEFAULTS, JSON.stringify(defaults));
  }, [project, activeTab]);

  const handleResetAll = useCallback(() => {
    // LocalStorage (この季節のキー) を消した上で loadInitialProject を再実行する。
    // これにより「user defaults があれば user defaults ベースで、無ければ
    // hardcoded default で再構築」という reload 経路と同じ挙動を維持する。
    // 他の季節の project には触らない。
    // 履歴も初期化したいので project/replace ではなく project/reset を dispatch。
    localStorage.removeItem(storage.storageKey);
    const { project: freshProject } = loadInitialProject(storage);
    dispatch({ type: 'project/reset', payload: freshProject });
  }, [dispatch, storage]);

  const handleLoadJson = useCallback((e: ChangeEvent<HTMLInputElement>, onNotify?: NotifyFn, onConfirm?: ConfirmFn) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async (ev) => {
      try {
        // readAsText 経由なので result は常に string。新しい形式・構造不正は
        // 適用せず通知する (utils/projectFile)
        const parsed = parseProjectFile(ev.target?.result as string);
        if ('error' in parsed) {
          if (onNotify) onNotify(parsed.error, 'error');
          return;
        }
        const migrated = parsed.project;

        // L1c: 読込は現プロジェクトの全置換。undo は RAM のみで autosave が
        // 即上書きするため、講師差分の有無に関わらず必ず確認を挟む。
        const diffs = detectTeacherDiffs(project.teachers, migrated.teachers || []);
        if (onConfirm) {
          const cellCount = (project.tabs || []).reduce(
            (n, t) => n + Object.keys(t.schedule || {}).length, 0);
          let msg = `現在のプロジェクト「${project.name || '時間割'}」` +
            `(タブ ${(project.tabs || []).length} 件・割当 ${cellCount} コマ) は読み込む内容に置き換わります。`;
          if (diffs.length > 0) {
            msg += `\n\n講師マスタの差分:\n${diffs.join("\n")}`;
          }
          msg += "\n\nこのまま読み込みますか？";
          const confirmed = await onConfirm(msg, { title: "プロジェクトの読み込み", confirmLabel: "読み込む" });
          if (!confirmed) return;
        }

        dispatch({ type: 'project/replace', payload: { project: migrated } });

        // L1d: 同梱テンプレートは既存を温存しつつ追記マージする
        const importedCount = mergeImportedTemplates(parsed.templates);
        if (onNotify) onNotify(
          importedCount > 0 ? `読込完了 (テンプレート ${importedCount} 件を取り込みました)` : "読込完了",
          "success");
      } catch {
        if (onNotify) onNotify("読み込みエラー", "error");
      }
    };
    // §M: FileReader 自体の失敗 (NotReadableError 等) は onload が発火しない
    // ため、ここを塞がないと無反応 (input は既にクリア済み) で終わる
    r.onerror = () => {
      if (onNotify) onNotify("読み込みエラー", "error");
    };
    r.readAsText(f);
    e.target.value = '';
  }, [project, dispatch]);

  const handleSaveJson = useCallback(() => {
    const cleaned = cleanSchedule(project);
    // L1d: テンプレートは project state と別の localStorage キーに居るため、
    // 同梱しないと「JSON でバックアップ → 別端末で読込」でテンプレだけ
    // 静かに失われる。空のときはフィールド自体を出さない (従来形を維持)。
    const templates = loadTemplates();
    const out = templates.length > 0 ? { ...cleaned, templates } : cleaned;
    const b = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
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
