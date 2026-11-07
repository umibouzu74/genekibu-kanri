import { useMemo, useRef, useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { buildBatchPrintItems } from '../utils/batchPrint';
import type { BatchPrintItem, BatchPrintOrder } from '../utils/batchPrint';
import type { BatchPrintProgress } from '../hooks/useBatchPrint';

// まとめて印刷 (L2h) のダイアログ。タブ × 強調 (教科 / 強調なし) を選び、1 組 = 1 枚で刷る。
// 選択は保存しない (開くたびに既定 = 全タブ × 全教科・教科ごと)。準備中は進捗と中断を出す
// (window.print() 系なので popup は開かず、このダイアログがそのまま見えている)
export default function BatchPrintDialog({
  onClose,
  onStart,
  progress,
  onAbort,
}: {
  onClose: () => void;
  onStart: (items: BatchPrintItem[]) => void;
  /** 準備中の進捗 (null = 準備していない) */
  progress: BatchPrintProgress | null;
  onAbort: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const busy = !!progress;
  // 準備中に閉じる (Esc・背景) = 中断
  const close = () => (busy ? onAbort() : onClose());
  useFocusTrap(dialogRef, { onClose: close });
  const { project } = useProjectContext();
  const tabs = project.tabs;
  const subjects = useMemo(() => project.subjects || [], [project.subjects]);
  const [tabIds, setTabIds] = useState<Set<number>>(() => new Set(tabs.map(t => t.id)));
  const [subjectSet, setSubjectSet] = useState<Set<string>>(() => new Set(subjects));
  const [includeNone, setIncludeNone] = useState(false);
  const [order, setOrder] = useState<BatchPrintOrder>('subject');

  const items = useMemo(
    () => buildBatchPrintItems({
      tabs,
      selectedTabIds: tabIds,
      subjects,
      selectedSubjects: subjectSet,
      includeNoHighlight: includeNone,
      order,
    }),
    [tabs, tabIds, subjects, subjectSet, includeNone, order],
  );
  const tabCount = tabs.filter(t => tabIds.has(t.id)).length;
  const highlightCount = subjects.filter(s => subjectSet.has(s)).length + (includeNone ? 1 : 0);

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  const linkClass = 'text-xs underline text-builder-blue hover:text-builder-blue-hover disabled:opacity-40';

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[1005] flex justify-center items-center p-4 no-print"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      // タブの矢印キー操作 (TabBar の tablist の onKeyDown) に渡さない
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="まとめて印刷"
        className="bg-builder-surface rounded shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-4 space-y-3 text-sm text-builder-ink"
      >
        <h2 className="text-lg font-bold">🖨️ まとめて印刷</h2>
        <p className="text-xs text-builder-ink-muted">
          選んだタブ × 強調を 1 組 1 枚 (新しいページから、A3 縦) で刷ります。見出し・凡例・印刷日は
          🖨️ 印刷と同じです。画面の時間割 (開いているタブ・強調) は変わりません。
        </p>

        {/* legend の中のボタンは fieldset の disabled が効かないので個別に止める */}
        <fieldset className="space-y-1" disabled={busy}>
          <legend className="font-bold flex items-center gap-2">
            タブ
            <button type="button" className={linkClass} disabled={busy} onClick={() => setTabIds(new Set(tabs.map(t => t.id)))}>全部</button>
            <button type="button" className={linkClass} disabled={busy} onClick={() => setTabIds(new Set())}>外す</button>
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {tabs.map(t => (
              <label key={t.id} className="inline-flex items-center gap-1">
                <input type="checkbox" checked={tabIds.has(t.id)} onChange={() => setTabIds(prev => toggle(prev, t.id))} />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-1" disabled={busy}>
          <legend className="font-bold flex items-center gap-2">
            強調
            <button type="button" className={linkClass} disabled={busy} onClick={() => setSubjectSet(new Set(subjects))}>全教科</button>
            <button type="button" className={linkClass} disabled={busy} onClick={() => setSubjectSet(new Set())}>外す</button>
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {subjects.map(s => (
              <label key={s} className="inline-flex items-center gap-1">
                <input type="checkbox" checked={subjectSet.has(s)} onChange={() => setSubjectSet(prev => toggle(prev, s))} />
                {s}
              </label>
            ))}
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={includeNone} onChange={() => setIncludeNone(v => !v)} />
              強調なし
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-1" disabled={busy}>
          <legend className="font-bold">並び</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <label className="inline-flex items-center gap-1">
              <input type="radio" name="batch-print-order" checked={order === 'subject'} onChange={() => setOrder('subject')} />
              教科ごとにまとめる (国語の全タブ → 数学の全タブ …)
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="radio" name="batch-print-order" checked={order === 'tab'} onChange={() => setOrder('tab')} />
              タブごとにまとめる
            </label>
          </div>
        </fieldset>

        <div className="text-sm" aria-live="polite">
          枚数の目安: <span className="font-bold">{tabCount} タブ × {highlightCount} 強調 = {items.length} 枚</span>
          <span className="block text-xs text-builder-ink-muted">日数の多いタブは 1 組で 2 枚以上になることがあります</span>
        </div>

        {busy && progress && (
          <div className="space-y-1">
            <div
              role="progressbar"
              aria-label="まとめて印刷の準備"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.current}
              className="h-2 bg-builder-border rounded-full overflow-hidden"
            >
              <div className="h-full bg-builder-blue" style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }} />
            </div>
            <div role="status" className="text-xs text-builder-ink-muted">
              準備中 {progress.current} / {progress.total}{progress.name ? ` — ${progress.name}` : ''}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {busy ? (
            <button
              type="button"
              onClick={onAbort}
              className="px-3 py-1.5 text-sm font-bold rounded border border-builder-danger-border bg-builder-danger-soft text-builder-red hover:bg-builder-danger-border"
            >✕ 中断</button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm rounded border border-builder-border text-builder-ink-muted hover:bg-builder-surface-alt"
              >閉じる</button>
              <button
                type="button"
                onClick={() => onStart(items)}
                disabled={items.length === 0}
                className="px-3 py-1.5 text-sm font-bold rounded bg-builder-primary text-white hover:bg-builder-primary-hover disabled:opacity-40"
              >🖨️ {items.length} 枚を印刷</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
