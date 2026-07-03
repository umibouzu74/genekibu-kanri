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

  // 学年タブの左右/Home/End 矢印ナビ (E1b)。フォーカスを移しつつそのタブを開く。
  // F2a: 改名 (dblclick のみ) と削除 (× ボタン) のキーボード代替として
  // F2 = 改名 / Delete = 削除 をフォーカス中のタブに提供する。
  const handleTabKeyDown = (e) => {
    const activeTab = project.tabs.find(t => t.id === project.activeTabId);
    if (e.key === 'F2' && activeTab) {
      e.preventDefault();
      handleRenameClick(e, activeTab);
      return;
    }
    if (e.key === 'Delete' && activeTab && project.tabs.length > 1) {
      e.preventDefault();
      handleDeleteClick(e, activeTab.id);
      return;
    }
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const tabs = project.tabs;
    const currentIndex = tabs.findIndex(t => t.id === project.activeTabId);
    let nextIndex = currentIndex < 0 ? 0 : currentIndex;
    if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = tabs.length - 1;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    switchTab(nextTab.id);
    document.getElementById(`builder-grade-tab-${nextTab.id}`)?.focus();
  };

  return (
    <div role="tablist" aria-label="学年タブ" onKeyDown={handleTabKeyDown} className="flex items-end gap-1 px-2 no-print overflow-x-auto">
      {project.tabs.map(tab => {
        const errorCount = tabErrorCounts[tab.id] || 0;
        const selected = project.activeTabId === tab.id;
        return (
          <div
            key={tab.id}
            id={`builder-grade-tab-${tab.id}`}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title="クリックで切替 / ダブルクリック or F2 で名前変更 / Delete で削除"
            onClick={() => switchTab(tab.id)}
            onDoubleClick={(e) => handleRenameClick(e, tab)}
            className={`px-4 py-2 rounded-t-lg cursor-pointer flex items-center gap-2 select-none transition-all ${selected ? "bg-builder-surface text-builder-blue font-bold shadow-[0_-2px_5px_rgba(0,0,0,0.05)] pt-3" : "bg-builder-border text-builder-ink-muted hover:bg-builder-ink-ghost mt-1"}`}
          >
            {tab.name}
            {errorCount > 0 ? (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-builder-danger-soft text-builder-red border border-builder-danger-border"
                title={`このタブに違反が ${errorCount} 件あります (講師重複・科目重複・クォータ超過)`}
                aria-label={`違反 ${errorCount} 件`}
              >⚠️{errorCount}</span>
            ) : (
              <span
                className="text-[10px] font-bold text-builder-green"
                title="このタブに違反はありません"
                aria-label="違反なし"
              >✨</span>
            )}
            {project.tabs.length > 1 && (
              <button
                type="button"
                onClick={(e) => handleDeleteClick(e, tab.id)}
                // Tab 順は roving tabindex (タブ本体) に任せ、キーボード削除は
                // フォーカス中タブへの Delete キーで提供する (F2a)
                tabIndex={-1}
                aria-label={`${tab.name} タブを削除`}
                className="text-xs ml-1 px-1 py-0.5 rounded hover:bg-builder-danger-soft hover:text-builder-red text-builder-ink-muted transition-colors cursor-pointer"
                title="このタブを削除 (Delete)"
              >×</button>
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
