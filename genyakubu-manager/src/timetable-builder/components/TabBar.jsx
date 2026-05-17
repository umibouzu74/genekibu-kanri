import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';

export default function TabBar() {
  const {
    project,
    switchTab,
    handleAddTab,
    handleDeleteTab,
    handleRenameTab,
    analysis,
  } = useProjectContext();
  const { showConfirm, showInput } = useUI();
  const tabErrorCounts = analysis?.tabErrorCounts || {};

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
      {project.tabs.map(tab => {
        const errorCount = tabErrorCounts[tab.id] || 0;
        return (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            onDoubleClick={(e) => handleRenameClick(e, tab)}
            className={`px-4 py-2 rounded-t-lg cursor-pointer flex items-center gap-2 select-none transition-all ${project.activeTabId === tab.id ? "bg-builder-surface text-builder-blue font-bold shadow-[0_-2px_5px_rgba(0,0,0,0.05)] pt-3" : "bg-builder-border text-builder-ink-muted hover:bg-builder-ink-ghost mt-1"}`}
          >
            {tab.name}
            {errorCount > 0 ? (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-builder-danger-soft text-builder-red border border-builder-danger-border"
                title={`このタブに講師重複が ${errorCount} 件あります`}
                aria-label={`講師重複 ${errorCount} 件`}
              >⚠️{errorCount}</span>
            ) : (
              <span
                className="text-[10px] font-bold text-builder-green"
                title="このタブに講師重複はありません"
                aria-label="講師重複なし"
              >✨</span>
            )}
            {project.tabs.length > 1 && (
              <span
                onClick={(e) => handleDeleteClick(e, tab.id)}
                className="text-xs ml-1 px-1 py-0.5 rounded hover:bg-builder-danger-soft hover:text-builder-red text-builder-ink-ghost transition-colors cursor-pointer"
                title="このタブを削除"
              >×</span>
            )}
          </div>
        );
      })}
      <button
        onClick={handleAddClick}
        className="px-3 py-2 text-builder-ink-muted hover:text-builder-blue font-bold text-sm"
        title="新しい学年タブを追加"
      >+ タブ追加</button>
    </div>
  );
}
