import React, { useState } from 'react';
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
      <div className="bg-white w-full max-w-5xl h-[85vh] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h2 className="font-bold text-lg text-gray-700">⚙️ 設定メニュー</h2>
          <button onClick={onClose} className="text-2xl font-bold text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="flex gap-4 px-6 pt-4 border-b">
          <button onClick={() => setConfigTab('basic')} className={`pb-2 font-bold ${configTab === 'basic' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>基本設定</button>
          <button onClick={() => setConfigTab('subjects')} className={`pb-2 font-bold ${configTab === 'subjects' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>📚 科目</button>
          <button onClick={() => setConfigTab('classes')} className={`pb-2 font-bold ${configTab === 'classes' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>🏫 クラス優先度</button>
          <button onClick={() => setConfigTab('external')} className={`pb-2 font-bold ${configTab === 'external' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>📅 他学年・午前</button>
          <button onClick={() => setConfigTab('ng')} className={`pb-2 font-bold ${configTab === 'ng' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>🚫 日時NG</button>
          <button onClick={() => setConfigTab('combined')} className={`pb-2 font-bold ${configTab === 'combined' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>🔗 合同授業</button>
          <button onClick={() => setConfigTab('colors')} className={`pb-2 font-bold ${configTab === 'colors' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>🎨 科目カラー</button>
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
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
                <label className="block text-sm font-bold text-gray-700 mb-1">プロジェクト名</label>
                <input
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  onBlur={handleProjectNameBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                  placeholder="例: 2026年度 冬期講習"
                />
                {project.createdAt && (
                  <div className="mt-2 text-xs text-gray-500">
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
          <div className="mt-6 border-t pt-4 text-right">
            <button onClick={handleResetClick} className="text-xs text-red-500 hover:text-red-700 underline">⚠️ すべてのデータをリセット</button>
          </div>
        </div>
      </div>
    </div>
  );
}
