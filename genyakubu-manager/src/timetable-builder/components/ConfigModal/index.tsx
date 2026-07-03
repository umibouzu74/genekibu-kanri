import { useEffect, useRef, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import BasicSettings from './BasicSettings';
import TeacherManager from './TeacherManager';
import ClassPriority from './ClassPriority';
import AbsenceNgPanel from './AbsenceNgPanel';
import SubjectColorSettings from './SubjectColorSettings';
import SubjectManager from './SubjectManager';
import CombinedGroupSettings from './CombinedGroupSettings';
import GenerationSettings from './GenerationSettings';
import TemplateManager from './TemplateManager';

const TITLE_ID = 'builder-config-modal-title';

// タブ定義 (id / ラベル)。tablist の左右矢印ナビ (E1b) はこの順序に従う。
const TABS = [
  ['basic', '基本設定'],
  ['subjects', '📚 科目'],
  ['classes', '🏫 クラス優先度'],
  ['absence-ng', '📅 講師不在・NG'],
  ['combined', '🔗 合同授業'],
  ['colors', '🎨 科目カラー'],
  ['generation', '⚡ 自動生成'],
  ['templates', '🗂 テンプレート'],
];

export default function ConfigModal({ onClose }: { onClose: () => void }) {
  const [configTab, setConfigTab] = useState('basic');
  const { project, handleResetAll, updateProjectName } = useProjectContext();
  const { showConfirm } = useUI();
  const [projectNameInput, setProjectNameInput] = useState(project.name || "");
  const dialogRef = useRef(null);

  // F5k: モーダルを開いたまま project.name が外から変わる経路がある
  // (テンプレート適用 / リセット / undo)。draft を同期しないと古い名前を
  // 表示し続け、フィールドに触れて blur しただけで新しい名前を旧名で
  // 上書きしてしまう。編集途中の draft は外部変更が勝つ (保守的挙動)。
  useEffect(() => {
    setProjectNameInput(project.name || "");
  }, [project.name]);
  const tablistRef = useRef(null);

  // Escape で閉じる + Tab フォーカスを dialog 内に閉じ込める (E1b focus trap)。
  useFocusTrap(dialogRef, { onClose });

  // tablist の左右/Home/End 矢印ナビ。フォーカスをそのタブボタンへ移して選択する。
  const handleTablistKeyDown = (e) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const currentIndex = TABS.findIndex(([id]) => id === configTab);
    let nextIndex = currentIndex;
    if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    else if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = TABS.length - 1;
    const nextId = TABS[nextIndex][0];
    setConfigTab(nextId);
    // 次のタブボタンへフォーカス移動 (roving tabindex)
    const nextBtn = tablistRef.current?.querySelector(`#builder-config-tab-${nextId}`);
    nextBtn?.focus();
  };

  const handleProjectNameBlur = () => {
    const trimmed = projectNameInput.trim();
    if (trimmed !== (project.name || "")) {
      updateProjectName(trimmed);
    }
  };

  const handleResetClick = async () => {
    const ok = await showConfirm("全データを削除しますか？\nこの操作は元に戻せません。", { title: "データリセット", danger: true, confirmLabel: "全削除" });
    if (ok) handleResetAll();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4 no-print"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="bg-builder-surface w-full max-w-5xl h-[85vh] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in"
      >
        <div className="p-4 border-b border-builder-border flex justify-between items-center bg-builder-surface-alt">
          <h2 id={TITLE_ID} className="font-bold text-lg text-builder-ink">⚙️ 設定メニュー</h2>
          <button onClick={onClose} aria-label="設定を閉じる" className="text-2xl font-bold text-builder-ink-muted hover:text-builder-ink">×</button>
        </div>
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="設定カテゴリ"
          onKeyDown={handleTablistKeyDown}
          className="flex gap-4 px-6 pt-4 border-b border-builder-border overflow-x-auto"
        >
          {TABS.map(([id, label]) => {
            const selected = configTab === id;
            return (
              <button
                key={id}
                id={`builder-config-tab-${id}`}
                role="tab"
                aria-selected={selected}
                aria-controls="builder-config-tabpanel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setConfigTab(id)}
                className={`pb-2 font-bold whitespace-nowrap ${selected ? 'text-builder-blue border-b-2 border-builder-blue' : 'text-builder-ink-muted'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div
          id="builder-config-tabpanel"
          role="tabpanel"
          aria-labelledby={`builder-config-tab-${configTab}`}
          className="flex-1 overflow-y-auto p-6"
        >
          {configTab === 'subjects' ? (
            <SubjectManager />
          ) : configTab === 'generation' ? (
            <GenerationSettings />
          ) : configTab === 'templates' ? (
            <TemplateManager />
          ) : configTab === 'combined' ? (
            <CombinedGroupSettings />
          ) : configTab === 'colors' ? (
            <SubjectColorSettings />
          ) : configTab === 'absence-ng' ? (
            <AbsenceNgPanel />
          ) : configTab === 'classes' ? (
            <ClassPriority />
          ) : (
            <>
              <div className="mb-6 p-4 bg-builder-info-soft border border-builder-info-border rounded">
                <label htmlFor="builder-project-name" className="block text-sm font-bold text-builder-ink mb-1">プロジェクト名</label>
                <input
                  id="builder-project-name"
                  className="w-full border border-builder-border rounded px-3 py-2 text-sm focus:outline-none focus:border-builder-blue"
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  onBlur={handleProjectNameBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  placeholder="例: 2026年度 冬期講習"
                />
                {project.createdAt && (
                  <div className="mt-2 text-xs text-builder-ink-muted">
                    作成日: {new Date(project.createdAt).toLocaleDateString('ja-JP')}
                    {project.updatedAt && <> / 更新日: {new Date(project.updatedAt).toLocaleDateString('ja-JP')}</>}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <BasicSettings />
                <TeacherManager />
              </div>
            </>
          )}
          <div className="mt-6 border-t border-builder-border pt-4 text-right">
            <button onClick={handleResetClick} className="text-xs text-builder-red hover:underline">⚠️ すべてのデータをリセット</button>
          </div>
        </div>
      </div>
    </div>
  );
}
