import React from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';

export default function TabBar() {
  const {
    project,
    switchTab,
    handleAddTab,
    handleDeleteTab,
    handleRenameTab,
  } = useProjectContext();
  const { showConfirm, showInput } = useUI();

  const handleRenameClick = async (e, tab) => {
    e.stopPropagation();
    const newName = await showInput("新しいタブ名を入力してください", { title: "タブ名の変更", defaultValue: tab.name });
    if (newName) handleRenameTab(tab.id, newName);
  };

  const handleDeleteClick = async (e, tabId) => {
    e.stopPropagation();
    const ok = await showConfirm("このタブを削除しますか？", { title: "タブの削除", danger: true, confirmLabel: "削除" });
    if (ok) handleDeleteTab(tabId);
  };

  const handleAddClick = async () => {
    const name = await showInput("新しいタブの名前を入力してください", { title: "タブの追加", placeholder: "例: 1年生" });
    if (name) handleAddTab(name);
  };

  return (
    <div className="flex items-end gap-1 px-2 no-print overflow-x-auto">
      {project.tabs.map(tab => (
        <div
          key={tab.id}
          onClick={() => switchTab(tab.id)}
          onDoubleClick={(e) => handleRenameClick(e, tab)}
          className={`px-4 py-2 rounded-t-lg cursor-pointer flex items-center gap-2 select-none transition-all ${project.activeTabId === tab.id ? "bg-white text-blue-700 font-bold shadow-[0_-2px_5px_rgba(0,0,0,0.05)] pt-3" : "bg-gray-200 text-gray-500 hover:bg-gray-300 mt-1"}`}
        >
          {tab.name}
          {project.tabs.length > 1 && (
            <span
              onClick={(e) => handleDeleteClick(e, tab.id)}
              className="text-xs ml-1 px-1 py-0.5 rounded hover:bg-red-100 hover:text-red-600 text-gray-400 transition-colors cursor-pointer"
              title="このタブを削除"
            >×</span>
          )}
        </div>
      ))}
      <button
        onClick={handleAddClick}
        className="px-3 py-2 text-gray-500 hover:text-blue-600 font-bold text-sm"
        title="新しい学年タブを追加"
      >+ タブ追加</button>
    </div>
  );
}
