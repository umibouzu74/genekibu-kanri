import { useEffect, useRef, useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';

// E1c: 名前付きスナップショット。現在のタブの時間割を名前を付けて保存し、
// あとから復元できる。undo/redo の単線履歴とは別に「試行錯誤の枝」を残す手段。
// スナップショットはタブ単位 (source tabId を記録) なので、ここでは
// アクティブタブに属するものだけを一覧・操作する。
export default function SnapshotMenu() {
  const {
    project,
    activeTab,
    saveSnapshot,
    applySnapshot,
    removeSnapshot,
    renameSnapshot,
  } = useProjectContext();
  const { showInput, showConfirm, showToast } = useUI();

  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // アクティブタブのスナップショットのみ (新しい順)。
  const snapshots = (project.snapshots || [])
    .filter(s => s.tabId === activeTab.id)
    .slice()
    .reverse();

  const handleSave = async () => {
    const defaultName = `${activeTab.name} ${snapshots.length + 1}`;
    const name = await showInput('スナップショット名を入力', {
      title: '現在の状態を保存',
      defaultValue: defaultName,
      placeholder: '例: 案A (英語優先)',
      confirmLabel: '保存',
    });
    if (!name) return;
    saveSnapshot(name);
    showToast(`スナップショット「${name}」を保存しました`);
  };

  const handleApply = async (snap) => {
    const ok = await showConfirm(
      `現在の時間割をスナップショット「${snap.name}」で置き換えますか？\n（元に戻す Ctrl+Z で戻せます）`,
      { title: 'スナップショットを復元', confirmLabel: '復元' },
    );
    if (!ok) return;
    applySnapshot(snap.id);
    showToast(`「${snap.name}」を復元しました`);
  };

  const handleRename = async (snap) => {
    const name = await showInput('新しい名前を入力', {
      title: 'スナップショット名を変更',
      defaultValue: snap.name,
      confirmLabel: '変更',
    });
    if (!name || name === snap.name) return;
    renameSnapshot(snap.id, name);
  };

  const handleRemove = async (snap) => {
    const ok = await showConfirm(
      `スナップショット「${snap.name}」を削除しますか？`,
      { title: 'スナップショットの削除', danger: true, confirmLabel: '削除' },
    );
    if (!ok) return;
    removeSnapshot(snap.id);
    showToast(`「${snap.name}」を削除しました`, 'warning', 2000);
  };

  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-1 px-3 py-2 bg-builder-surface border border-builder-border text-builder-ink-muted rounded hover:bg-builder-surface-alt shadow-sm text-sm"
        title="現在の状態を名前を付けて保存・復元"
      >
        📌 スナップショット{snapshots.length > 0 ? ` (${snapshots.length})` : ''}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="スナップショット"
          className="absolute z-50 top-full right-0 mt-1 w-80 bg-builder-surface border border-builder-border rounded shadow-lg p-3 text-builder-ink"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-builder-ink-muted">
              スナップショット（{activeTab.name}）
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="text-xs bg-builder-primary text-white px-2 py-1 rounded hover:bg-builder-primary-hover font-bold"
            >
              ＋ 現在の状態を保存
            </button>
          </div>
          {snapshots.length === 0 ? (
            <p className="text-xs text-builder-ink-muted py-3 text-center">
              保存されたスナップショットはありません。<br />
              別案を試す前に現在の状態を保存しておくと、いつでも戻せます。
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
              {snapshots.map((snap) => (
                <li
                  key={snap.id}
                  className="flex items-center gap-1.5 border border-builder-border rounded px-2 py-1.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate" title={snap.name}>{snap.name}</div>
                    {snap.createdAt && (
                      <div className="text-[11px] text-builder-ink-muted">{fmt(snap.createdAt)}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApply(snap)}
                    className="text-xs bg-builder-blue text-white px-2 py-1 rounded hover:bg-builder-blue-hover font-bold whitespace-nowrap"
                    title="この状態に復元"
                  >
                    復元
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRename(snap)}
                    className="text-xs px-1.5 py-1 border border-builder-border rounded text-builder-ink-muted hover:bg-builder-surface-alt"
                    title="名前を変更"
                    aria-label={`${snap.name} の名前を変更`}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(snap)}
                    className="text-xs px-1.5 py-1 border border-builder-danger-border rounded text-builder-red hover:bg-builder-danger-soft"
                    title="削除"
                    aria-label={`${snap.name} を削除`}
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
