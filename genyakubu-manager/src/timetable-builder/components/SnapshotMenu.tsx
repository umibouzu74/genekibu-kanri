import { useEffect, useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { parseKey } from '../utils/scheduleKey';
import { scrollToCellByKey } from '../utils/scrollToCell';
import { diffSchedules, summarizeDiff } from '../utils/scheduleDiff';
import { useDismissablePopover } from '../hooks/useDismissablePopover';

// E1c: 名前付きスナップショット。現在のタブの時間割を名前を付けて保存し、
// あとから復元できる。undo/redo の単線履歴とは別に「試行錯誤の枝」を残す手段。
// スナップショットはタブ単位 (source tabId を記録) なので、ここでは
// アクティブタブに属するものだけを一覧・操作する。
export default function SnapshotMenu() {
  const {
    project,
    activeTab,
    currentSchedule,
    currentConfig,
    saveSnapshot,
    applySnapshot,
    removeSnapshot,
    renameSnapshot,
  } = useProjectContext();
  const { showInput, showConfirm, showToast } = useUI();

  // 開閉と外側クリック / Escape での dismiss は共有フック (F2l)。
  const { open, setOpen, ref } = useDismissablePopover();
  // 現在の状態と差分比較中のスナップショット id (null = 比較なし)
  const [comparingId, setComparingId] = useState(null);

  // popover を閉じたら比較状態もリセット
  useEffect(() => {
    if (!open) setComparingId(null);
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

  // schedule key → 「日付 時限 クラス」ラベル (config から解決)
  const keyLabel = (key) => {
    const p = parseKey(key);
    if (!p) return key;
    const d = currentConfig?.dates?.find(e => e.id === p.dateId)?.label ?? `d${p.dateId}`;
    const pe = currentConfig?.periods?.find(e => e.id === p.periodId)?.label ?? `p${p.periodId}`;
    const c = currentConfig?.classes?.find(e => e.id === p.classId)?.label ?? `c${p.classId}`;
    return `${d} ${pe} ${c}`;
  };

  const entryText = (e) => (e ? `${e.subject}${e.teacher ? `/${e.teacher}` : ''}` : '（空）');

  // 比較中のスナップショット → 現在の状態への差分
  const comparing = comparingId != null ? snapshots.find(s => s.id === comparingId) : null;
  const diffs = comparing ? diffSchedules(comparing.schedule, currentSchedule) : [];
  const diffCounts = summarizeDiff(diffs);
  const DIFF_TYPE_STYLE = {
    added: { mark: '＋', cls: 'text-builder-green' },
    removed: { mark: '－', cls: 'text-builder-red' },
    changed: { mark: '≠', cls: 'text-builder-orange' },
  };

  const toggleCompare = (id) => setComparingId(prev => (prev === id ? null : id));

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
                  className="border border-builder-border rounded px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate" title={snap.name}>{snap.name}</div>
                      {snap.createdAt && (
                        <div className="text-[11px] text-builder-ink-muted">{fmt(snap.createdAt)}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCompare(snap.id)}
                      aria-pressed={comparingId === snap.id}
                      className={`text-xs px-1.5 py-1 border rounded whitespace-nowrap ${comparingId === snap.id ? 'bg-builder-blue text-white border-builder-blue' : 'border-builder-border text-builder-ink-muted hover:bg-builder-surface-alt'}`}
                      title="現在の状態との差分を表示"
                      aria-label={`${snap.name} と現在の状態を比較`}
                    >
                      🔍 差分
                    </button>
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
                  </div>
                  {comparingId === snap.id && (
                    <div className="mt-2 pt-2 border-t border-builder-border">
                      <div className="text-[11px] text-builder-ink-muted mb-1">
                        このスナップショット → 現在の状態の差分:{' '}
                        {diffCounts.total === 0 ? (
                          <span className="text-builder-green font-bold">変更なし</span>
                        ) : (
                          <span className="font-bold">
                            <span className="text-builder-green">＋{diffCounts.added}</span>{' '}
                            <span className="text-builder-red">－{diffCounts.removed}</span>{' '}
                            <span className="text-builder-orange">≠{diffCounts.changed}</span>
                          </span>
                        )}
                      </div>
                      {diffCounts.total > 0 && (
                        <ul className="space-y-0.5 max-h-40 overflow-y-auto text-[11px]">
                          {diffs.slice(0, 30).map((d) => (
                            <li key={d.key} className="flex items-start gap-1">
                              <span className={`font-bold ${DIFF_TYPE_STYLE[d.type].cls}`}>{DIFF_TYPE_STYLE[d.type].mark}</span>
                              <span className="text-builder-ink-muted">
                                {keyLabel(d.key)}: {entryText(d.before)} → {entryText(d.after)}
                              </span>
                              {/* N2g: 違反 popover の「→」と同じ該当セルジャンプ */}
                              <button
                                type="button"
                                onClick={() => scrollToCellByKey(d.key)}
                                className="ml-auto shrink-0 px-1 rounded text-builder-blue hover:bg-builder-info-soft font-bold"
                                title="該当セルへスクロール"
                                aria-label={`${keyLabel(d.key)} のセルへ移動`}
                              >→</button>
                            </li>
                          ))}
                          {diffs.length > 30 && (
                            <li className="italic text-builder-ink-muted">他 {diffs.length - 30} 件</li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
