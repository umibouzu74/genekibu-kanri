import { useMemo, useRef, useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { cellsToTsv, newProblemsAfterWrites, parseCellTsv } from '../utils/cellTsv';
import type { CellTsvPlan } from '../utils/cellTsv';

// タブのセルを表 (TSV) で書き出す・貼り付ける (B5)。貼り付けはまず「確認」で行ごとの
// 結果と、貼った後に新しく増える問題 (NG・講師の重なり・日上限) を出してから、
// 1 アクションで当てる (Undo 1 回で戻る)
const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: '変える', cls: 'text-builder-blue' },
  same: { label: '同じ', cls: 'text-builder-ink-muted' },
  skipped: { label: '飛ばす', cls: 'text-builder-orange' },
  error: { label: 'エラー', cls: 'text-builder-red' },
};

export default function CellTsvDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onClose });
  const { project, importScheduleCells } = useProjectContext();
  const { showToast } = useUI();
  const [allTabs, setAllTabs] = useState(false);
  const exported = useMemo(
    () => cellsToTsv(project, allTabs ? null : [project.activeTabId]),
    [project, allTabs],
  );
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<(CellTsvPlan & { problems: string[] }) | null>(null);
  const activeTab = project.tabs.find(t => t.id === project.activeTabId);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exported);
      showToast('表をコピーしました', 'success', 2500);
    } catch {
      showToast('コピーできませんでした (欄の中身を選んでコピーしてください)', 'error', 4000);
    }
  };
  const check = () => {
    const p = parseCellTsv(text, project, project.activeTabId);
    setPlan({ ...p, problems: newProblemsAfterWrites(project, p.writes) });
  };
  const apply = () => {
    if (!plan || plan.errorCount > 0 || plan.writes.length === 0) return;
    importScheduleCells(plan.writes);
    showToast(`${plan.writes.length} セルを書き換えました。Undo で戻せます`, 'success', 6000);
    onClose();
  };
  const canApply = !!plan && plan.errorCount === 0 && plan.writes.length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[1005] flex justify-center items-center p-4 no-print"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      // タブの矢印キー操作 (TabBar の tablist の onKeyDown) に渡さない
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="セルを表で書き出す・貼り付ける"
        className="bg-builder-surface rounded shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-4 space-y-3 text-sm"
      >
        <h2 className="text-lg font-bold">📋 セルを表で書き出す・貼り付ける</h2>
        <section className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-bold">書き出す</h3>
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="radio" name="cell-tsv-scope" checked={!allTabs} onChange={() => setAllTabs(false)} />
              このタブ ({activeTab?.name})
            </label>
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="radio" name="cell-tsv-scope" checked={allTabs} onChange={() => setAllTabs(true)} />
              全部のタブ
            </label>
          </div>
          <textarea
            readOnly
            aria-label="書き出した表 (TSV)"
            value={exported}
            rows={6}
            className="w-full border border-builder-border rounded p-1 font-mono text-xs"
          />
          <button type="button" onClick={copy} className="text-xs px-2 py-1 border border-builder-border rounded hover:bg-builder-info-soft">
            📋 コピー
          </button>
        </section>
        <section className="space-y-1">
          <h3 className="font-bold">貼り付ける</h3>
          <p className="text-xs text-builder-ink-muted">
            列: タブ / 日付 / 時限 / クラス / 科目 / 講師 / ロック (○)。貼った行のセルだけを変えます。科目と講師を両方空にした行は空にします。
            ロックの列があればその通りにします (ロックしたセルも書き換えます)。無ければロックしたセルは書き換えません。
          </p>
          <textarea
            aria-label="貼り付ける表 (TSV)"
            value={text}
            onChange={(e) => { setText(e.target.value); setPlan(null); }}
            rows={8}
            className="w-full border border-builder-border rounded p-1 font-mono text-xs"
          />
          <button type="button" onClick={check} disabled={!text.trim()} className="text-xs px-2 py-1 border border-builder-border rounded hover:bg-builder-info-soft">
            確認
          </button>
        </section>
        {plan && (
          <section aria-label="貼り付けの確認" className="space-y-1 text-xs">
            <div className="font-bold">
              {plan.errorCount > 0 ? `エラー ${plan.errorCount} 件 (直してからもう一度「確認」)` : `書き換えるセル: ${plan.changeCount}`}
            </div>
            {plan.problems.length > 0 && (
              <div role="alert" className="text-builder-orange">
                貼った後に新しく増える問題:
                <ul className="list-disc pl-5">
                  {plan.problems.map(p => <li key={p}>{p}</li>)}
                </ul>
              </div>
            )}
            <ul className="max-h-48 overflow-y-auto border border-builder-border rounded p-1">
              {plan.rows.filter(r => r.status !== 'same').map(r => (
                <li key={r.line}>
                  <span className="text-builder-ink-muted">{r.line} 行目 </span>
                  <span className={`font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span> {r.message}
                </li>
              ))}
              {plan.rows.every(r => r.status === 'same') && <li className="text-builder-ink-muted">変わるセルはありません</li>}
            </ul>
          </section>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border border-builder-border rounded">閉じる</button>
          <button
            type="button"
            onClick={apply}
            disabled={!canApply}
            className={`px-3 py-1.5 text-sm font-bold rounded text-white bg-builder-blue ${canApply ? 'hover:bg-builder-blue-hover' : 'opacity-50'}`}
          >書き換える</button>
        </div>
      </div>
    </div>
  );
}
