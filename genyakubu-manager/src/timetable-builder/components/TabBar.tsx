import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { effectiveConfigForTab } from '../utils/scheduleKey';
import { frameOfTab } from '../utils/frames';
import { useEffect, useRef, useState } from 'react';

export default function TabBar() {
  const {
    project,
    switchTab,
    handleAddTab,
    handleDeleteTab,
    handleRenameTab,
    reorderTabs,
    copyScheduleFromTab,
    analysis,
  } = useProjectContext();
  const { showConfirm, showInput, showToast } = useUI();
  const tabErrorCounts = analysis?.tabErrorCounts || {};
  // タブの操作メニュー (右クリック / 「⋯ タブの操作」)。以前は ⧉ (他タブから
  // 複製) がタブ名のすぐ横にあり、タブを切り替えるつもりで押してしまった
  // ので、メニューの中へ移した (B7)。x / y は画面座標 (position: fixed)。
  // sourceTabId: 右クリックしたタブ (そのタブからの複製を先頭に出す)
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: number | null } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) setMenu(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  const openMenuAt = (x, y, tabId = null) => {
    // 画面の右端・下端からはみ出さないように寄せる
    const w = 280;
    const left = Math.max(8, Math.min(x, (window.innerWidth || 1024) - w - 8));
    setMenu({ x: left, y, tabId });
  };

  // 重複タブ名は reducer 側で no-op になる (K3i)。silent だと「直った
  // ように見える」ので理由を伝える (ヘッダ rename の H3 と同じ扱い)
  const isDupName = (name, exceptId = null) =>
    project.tabs.some(t => t.name === name && t.id !== exceptId);

  const handleRenameClick = async (e, tab) => {
    e.stopPropagation();
    const newName = await showInput("新しいタブ名を入力してください", { title: "タブ名の変更", defaultValue: tab.name });
    if (!newName || newName === tab.name) return;
    if (isDupName(newName, tab.id)) {
      showToast(`「${newName}」は既に存在するため変更できません。別の名前にしてください。`, 'error', 4000);
      return;
    }
    handleRenameTab(tab.id, newName);
  };

  const handleDeleteClick = async (e, tabId) => {
    e.stopPropagation();
    // N2e: 何を失うかを件数で示す (生成クリア等の件数付き confirm と同型)。
    // 空 entry (subject も teacher も無い) は数えない。
    const tab = project.tabs.find(t => t.id === tabId);
    const cellCount = Object.values(tab?.schedule || {}).filter(en => en && (en.subject || en.teacher)).length;
    const ok = await showConfirm(
      cellCount > 0
        ? `このタブには ${cellCount} コマの割当があります。削除しますか？\n(Undo で元に戻せます)`
        : "このタブを削除しますか？",
      { title: "タブの削除", danger: true, confirmLabel: "削除" },
    );
    if (ok) handleDeleteTab(tabId);
  };

  // K4a: 別タブ (source) の割当を現在のタブへ複製する。上書きになるので
  // confirm を挟む。適用後は Undo で戻せる (履歴に積まれる)
  const handleCopyFromClick = async (e, sourceTab) => {
    e?.stopPropagation?.();
    setMenu(null);
    const activeTab = project.tabs.find(t => t.id === project.activeTabId);
    if (!activeTab || sourceTab.id === activeTab.id) return;
    const hasCells = Object.keys(activeTab.schedule || {}).length > 0;
    const ok = await showConfirm(
      `タブ「${sourceTab.name}」の割当を現在のタブ「${activeTab.name}」へ複製しますか？` +
        (hasCells ? "\n現在のタブの割当は置き換えられます (Undo で戻せます)。" : ""),
      { title: "タブ間の複製", confirmLabel: "複製する" }
    );
    if (!ok) return;
    copyScheduleFromTab(sourceTab.id);
    showToast(`「${sourceTab.name}」の割当を「${activeTab.name}」へ複製しました`, 'success', 3000);
  };

  const handleAddClick = async () => {
    const name = await showInput("新しいタブの名前を入力してください", { title: "タブの追加", placeholder: "例: 1年生" });
    if (!name) return;
    if (isDupName(name)) {
      showToast(`「${name}」は既に存在するため追加できません。別の名前にしてください。`, 'error', 4000);
      return;
    }
    handleAddTab(name);
  };

  // 学年タブの左右/Home/End 矢印ナビ (E1b)。フォーカスを移しつつそのタブを開く。
  // F2a: 改名 (dblclick のみ) と削除 (× ボタン) のキーボード代替として
  // F2 = 改名 / Delete = 削除 をフォーカス中のタブに提供する。
  const handleTabKeyDown = (e) => {
    const activeTab = project.tabs.find(t => t.id === project.activeTabId);
    // メニューキー / Shift+F10 = タブの操作メニュー (右クリックの代替)
    if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && activeTab) {
      e.preventDefault();
      const r = document.getElementById(`builder-grade-tab-${activeTab.id}`)?.getBoundingClientRect();
      openMenuAt(r ? r.left : 16, r ? r.bottom : 80, activeTab.id);
      return;
    }
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
    // N2d: Ctrl(⌘)+←/→ でアクティブタブを並べ替え (D&D のキーボード代替)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && activeTab) {
      e.preventDefault();
      const fromIdx = project.tabs.findIndex(t => t.id === activeTab.id);
      const toIdx = e.key === 'ArrowLeft' ? fromIdx - 1 : fromIdx + 1;
      if (toIdx >= 0 && toIdx < project.tabs.length) {
        reorderTabs(fromIdx, toIdx);
        // roving tabindex を維持 (並べ替え後も同じタブにフォーカスを残す)
        requestAnimationFrame(() => document.getElementById(`builder-grade-tab-${activeTab.id}`)?.focus());
      }
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
      {project.tabs.map((tab, tabIdx) => {
        const errorCount = tabErrorCounts[tab.id] || 0;
        const selected = project.activeTabId === tab.id;
        // L1b: 使う日・時限・クラスのいずれかが 0 のタブはセルが 1 つも
        // 無い。「違反 0 = ✨」だと設定ミスの空タブが正常に見えるので、
        // ✨ ではなく「空」バッジで気づけるようにする。
        const cfg = effectiveConfigForTab(project, tab);
        const isEmptyTab = cfg.dates.length === 0 || cfg.periods.length === 0 || (cfg.classes || []).length === 0;
        // 季節の中の枠 (冬期講習 / 直前ポイント演習…) の名前をタブ名の上に小さく出す
        const frame = frameOfTab(project, tab);
        return (
          <div
            key={tab.id}
            id={`builder-grade-tab-${tab.id}`}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title="クリックで切替 / ダブルクリック or F2 で名前変更 / Delete で削除 / ドラッグ or Ctrl+←→ で並べ替え / 右クリックでタブの操作"
            onClick={() => switchTab(tab.id)}
            onDoubleClick={(e) => handleRenameClick(e, tab)}
            onContextMenu={(e) => {
              e.preventDefault();
              openMenuAt(e.clientX, e.clientY, tab.id);
            }}
            // N2d: ドラッグで並べ替え (キーボード代替は Ctrl+←/→)
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/x-builder-tab-index', String(tabIdx));
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('text/x-builder-tab-index')) e.preventDefault();
            }}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData('text/x-builder-tab-index');
              if (raw === '') return;
              e.preventDefault();
              const fromIdx = Number(raw);
              if (Number.isInteger(fromIdx) && fromIdx !== tabIdx) reorderTabs(fromIdx, tabIdx);
            }}
            className={`px-4 py-2 rounded-t-lg cursor-pointer flex items-center gap-2 select-none transition-all ${selected ? "bg-builder-surface text-builder-blue font-bold shadow-[0_-2px_5px_rgba(0,0,0,0.05)] pt-3" : "bg-builder-border text-builder-ink-muted hover:bg-builder-ink-ghost mt-1"}`}
          >
            {frame ? (
              <span className="flex flex-col leading-tight">
                <span className="text-[10px] font-normal text-builder-ink-muted">{frame.name}</span>
                <span>{tab.name}</span>
              </span>
            ) : tab.name}
            {errorCount > 0 ? (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-builder-danger-soft text-builder-red border border-builder-danger-border"
                title={`このタブに違反が ${errorCount} 件あります (講師重複・科目重複・クォータ超過)`}
                aria-label={`違反 ${errorCount} 件`}
              >⚠️{errorCount}</span>
            ) : isEmptyTab ? (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-builder-warning-soft text-builder-orange border border-builder-warning-border"
                title="使う日・時限・クラスのいずれかが 0 件のため、このタブに時間割マスがありません (⚙️設定 > 基本設定で選択)"
                aria-label="時間割マスなし"
              >空</span>
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
      <button
        type="button"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          if (menu) setMenu(null);
          else openMenuAt(r.left, r.bottom, null);
        }}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        className="px-2 py-2 text-builder-ink-muted hover:text-builder-blue text-sm"
        title="タブの操作 (他のタブから割当を複製・名前の変更・削除)。タブの右クリックでも開きます"
      >⋯ タブの操作</button>
      {menu && (() => {
        const activeTab = project.tabs.find(t => t.id === project.activeTabId);
        const others = project.tabs.filter(t => t.id !== project.activeTabId);
        // 右クリックしたタブ (今のタブ以外) を先頭に
        others.sort((a, b) => (a.id === menu.tabId ? -1 : b.id === menu.tabId ? 1 : 0));
        const target = project.tabs.find(t => t.id === menu.tabId) || activeTab;
        return (
          <div
            ref={menuRef}
            role="menu"
            aria-label="タブの操作"
            // 学年タブの矢印キー操作 (tablist の onKeyDown) に渡さない
            onKeyDown={(e) => e.stopPropagation()}
            style={{ position: 'fixed', left: menu.x, top: menu.y, width: 280 }}
            className="z-[1000] bg-builder-surface border border-builder-border rounded shadow-lg py-1 text-sm"
          >
            {activeTab && others.length > 0 && (
              <div className="px-3 py-1 text-[11px] text-builder-ink-muted">
                現在のタブ「{activeTab.name}」へ割当を複製 (置き換え)
              </div>
            )}
            {activeTab && others.map(t => (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                onClick={(e) => handleCopyFromClick(e, t)}
                className="block w-full text-left px-3 py-1 hover:bg-builder-info-soft text-sm"
              >⧉ 「{t.name}」から複製…</button>
            ))}
            {target && (
              <>
                <div className="my-1 border-t border-builder-border" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => { setMenu(null); handleRenameClick(e, target); }}
                  className="block w-full text-left px-3 py-1 hover:bg-builder-info-soft text-sm"
                >✎ 「{target.name}」の名前を変更… (F2)</button>
                {project.tabs.length > 1 && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => { setMenu(null); handleDeleteClick(e, target.id); }}
                    className="block w-full text-left px-3 py-1 hover:bg-builder-danger-soft text-builder-red text-sm"
                  >× 「{target.name}」を削除… (Delete)</button>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
