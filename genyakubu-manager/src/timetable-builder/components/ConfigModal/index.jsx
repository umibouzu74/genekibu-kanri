import { useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import BasicSettings from './BasicSettings';
import TeacherManager from './TeacherManager';
import ClassPriority from './ClassPriority';
import ExternalCounts from './ExternalCounts';
import NgSettings from './NgSettings';
import SubjectColorSettings from './SubjectColorSettings';
import SubjectManager from './SubjectManager';
import CombinedGroupSettings from './CombinedGroupSettings';

export default function ConfigModal({ onClose }) {
  const [configTab, setConfigTab] = useState('basic');
  const { project, handleResetAll, updateProjectName } = useProjectContext();
  const { showConfirm } = useUI();
  const [projectNameInput, setProjectNameInput] = useState(project.name || "");

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
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4 no-print">
      <div className="bg-builder-surface w-full max-w-5xl h-[85vh] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        <div className="p-4 border-b border-builder-border flex justify-between items-center bg-builder-surface-alt">
          <h2 className="font-bold text-lg text-builder-ink">⚙️ 設定メニュー</h2>
          <button onClick={onClose} className="text-2xl font-bold text-builder-ink-ghost hover:text-builder-ink-muted">×</button>
        </div>
        <div className="flex gap-4 px-6 pt-4 border-b border-builder-border">
          {[
            ['basic', '基本設定'],
            ['subjects', '📚 科目'],
            ['classes', '🏫 クラス優先度'],
            ['external', '📅 他学年・午前'],
            ['ng', '🚫 日時NG'],
            ['combined', '🔗 合同授業'],
            ['colors', '🎨 科目カラー'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setConfigTab(id)}
              className={`pb-2 font-bold ${configTab === id ? 'text-builder-blue border-b-2 border-builder-blue' : 'text-builder-ink-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {configTab === 'subjects' ? (
            <SubjectManager />
          ) : configTab === 'combined' ? (
            <CombinedGroupSettings />
          ) : configTab === 'colors' ? (
            <SubjectColorSettings />
          ) : configTab === 'external' ? (
            <ExternalCounts />
          ) : configTab === 'ng' ? (
            <NgSettings />
          ) : configTab === 'classes' ? (
            <ClassPriority />
          ) : (
            <>
              <div className="mb-6 p-4 bg-builder-info-soft border border-builder-info-border rounded">
                <label className="block text-sm font-bold text-builder-ink mb-1">プロジェクト名</label>
                <input
                  className="w-full border border-builder-border rounded px-3 py-2 text-sm focus:outline-none focus:border-builder-blue"
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  onBlur={handleProjectNameBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
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
