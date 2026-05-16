import React, { useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { downloadScheduleExcel, downloadTeacherExcel } from '../utils/excelExport';

export default function Header() {
  const {
    project,
    saveStatus,
    fileInputRef,
    handleSaveJson,
    handleLoadJson,
    updateProjectName,
  } = useProjectContext();
  const { showToast, showConfirm } = useUI();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(project.name || "");

  const handleNameSubmit = () => {
    updateProjectName(nameInput.trim());
    setIsEditingName(false);
  };

  const displayName = project.name || "無題のプロジェクト";

  return (
    <div className="flex justify-between items-center mb-2 no-print bg-white p-3 rounded shadow-sm border-b border-gray-200">
      <div className="flex items-center gap-2">
        <span className="text-xl">📅</span>
        {isEditingName ? (
          <input
            autoFocus
            className="text-xl font-bold text-gray-700 border-b-2 border-blue-500 outline-none bg-transparent px-1"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNameSubmit(); if (e.key === 'Escape') { setNameInput(project.name || ""); setIsEditingName(false); } }}
            placeholder="プロジェクト名を入力"
          />
        ) : (
          <h1
            className="text-xl font-bold text-gray-700 cursor-pointer hover:text-blue-600 hover:underline"
            onClick={() => { setNameInput(project.name || ""); setIsEditingName(true); }}
            title="クリックで名前を変更"
          >
            {displayName}
          </h1>
        )}
        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200">{saveStatus}</span>
      </div>
      <div className="flex gap-2">
        <button onClick={handleSaveJson} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 shadow text-sm font-bold" title="プロジェクトをJSONファイルとして保存">💾 プロジェクト保存</button>
        <button onClick={() => fileInputRef.current.click()} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 shadow text-sm font-bold" title="JSONファイルからプロジェクトを開く">📂 開く</button>
        <button onClick={() => { try { downloadScheduleExcel(project); showToast("全体Excelをダウンロードしました"); } catch { showToast("Excel出力に失敗しました", "error"); } }} className="flex items-center gap-1 px-3 py-1.5 bg-green-800 text-white rounded hover:bg-green-900 shadow text-sm font-bold" title="全タブのスケジュールをExcel出力">📊 全Excel</button>
        <button onClick={() => { try { downloadTeacherExcel(project); showToast("個人別Excelをダウンロードしました"); } catch { showToast("Excel出力に失敗しました", "error"); } }} className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white rounded hover:bg-teal-700 shadow text-sm font-bold" title="講師別スケジュールをExcel出力">👤 個人Excel</button>
        <input type="file" accept=".json" ref={fileInputRef} onChange={(e) => handleLoadJson(e, showToast, showConfirm)} className="hidden" />
      </div>
    </div>
  );
}
