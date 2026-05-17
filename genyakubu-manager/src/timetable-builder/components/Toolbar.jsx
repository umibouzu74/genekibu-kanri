import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { parseKey } from '../utils/scheduleKey';

export default function Toolbar({
  isCompact,
  setIsCompact,
  showSummary,
  setShowSummary,
  setShowConfig,
  isGenerating,
  generateProgress,
  onGenerate,
  onShowHelp,
}) {
  const {
    analysis,
    dashboard,
    historyIndex,
    history,
    undo,
    redo,
    handleClearUnlocked,
  } = useProjectContext();
  const { showConfirm } = useUI();

  const handleClearClick = async () => {
    const ok = await showConfirm("ロックされていないセルを全てクリアしますか？", { title: "生成クリア", danger: true, confirmLabel: "クリア" });
    if (ok) handleClearUnlocked();
  };

  const scrollToFirstError = () => {
    if (analysis.errorKeys.length === 0) return;
    const firstKey = analysis.errorKeys[0];
    const parsed = parseKey(firstKey);
    if (parsed) {
      const targetId = `select-${parsed.dateId}-${parsed.periodId}-${parsed.classId}-cell`;
      const el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-4 p-2 bg-builder-surface-alt border border-builder-border rounded no-print">
      <div className="flex items-center gap-3 bg-builder-surface px-3 py-1.5 rounded border border-builder-border shadow-sm flex-1 min-w-[250px]">
        <div className="text-xs font-bold text-builder-ink-muted">進捗</div>
        <div className="flex-1 h-3 bg-builder-border rounded-full overflow-hidden relative">
          <div className="h-full bg-builder-blue transition-all duration-500" style={{ width: `${dashboard.progress}%` }}></div>
        </div>
        <div className="text-sm font-bold text-builder-blue w-12 text-right">{dashboard.progress}%</div>
        {analysis.errorKeys.length > 0 ? (
          <button onClick={scrollToFirstError} className="ml-2 text-xs bg-builder-danger-soft text-builder-red px-2 py-1 rounded border border-builder-danger-border font-bold animate-pulse hover:bg-builder-danger-border">
            ⚠️ {analysis.errorKeys.length}件
          </button>
        ) : <span className="ml-2 text-xs text-builder-green font-bold">✨ OK</span>}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setIsCompact(!isCompact)} className="flex items-center gap-1 px-3 py-2 bg-builder-surface border border-builder-border text-builder-ink-muted rounded hover:bg-builder-surface-alt shadow-sm text-sm" title="表示サイズを切り替え">
          {isCompact ? "🔍 標準" : "📏 縮小"}
        </button>
        <div className="h-6 w-px bg-builder-border mx-1"></div>
        <button onClick={undo} disabled={historyIndex === 0} className="px-3 py-2 text-builder-ink-muted hover:bg-builder-bg disabled:opacity-30 border border-builder-border rounded shadow-sm" title="元に戻す (Undo)">↩️</button>
        <button onClick={redo} disabled={historyIndex === history.length - 1} className="px-3 py-2 text-builder-ink-muted hover:bg-builder-bg disabled:opacity-30 border border-builder-border rounded shadow-sm" title="やり直す (Redo)">↪️</button>
        <div className="h-6 w-px bg-builder-border mx-1"></div>
        <button onClick={() => setShowSummary(!showSummary)} className="flex items-center gap-1 px-3 py-2 bg-builder-blue text-white rounded hover:bg-builder-blue-hover shadow-sm text-sm font-bold" title="講師別コマ数の集計を表示/非表示">📊 集計</button>
        <button onClick={() => setShowConfig(true)} className="flex items-center gap-1 px-3 py-2 bg-builder-ink text-white rounded hover:bg-builder-primary-hover shadow-sm text-sm font-bold" title="講師・科目・NG設定など">⚙️ 設定</button>
        <button onClick={() => window.print()} className="flex items-center gap-1 px-3 py-2 bg-builder-surface border border-builder-border text-builder-ink-muted rounded hover:bg-builder-surface-alt shadow-sm text-sm" title="ブラウザの印刷ダイアログを開く">🖨️ 印刷</button>
        {onShowHelp && (
          <button onClick={onShowHelp} className="flex items-center gap-1 px-3 py-2 bg-builder-surface border border-builder-border text-builder-ink-muted rounded hover:bg-builder-surface-alt shadow-sm text-sm" title="操作ガイドを表示">❓ ヘルプ</button>
        )}
        <div className="h-6 w-px bg-builder-border mx-1"></div>
        <button onClick={handleClearClick} className="flex items-center gap-1 px-3 py-2 bg-builder-danger-soft text-builder-red border border-builder-danger-border rounded hover:bg-builder-danger-border shadow-sm text-sm font-bold" title="ロックされていないセルを全てクリア">🗑️ 生成クリア</button>
        <button onClick={onGenerate} disabled={isGenerating} className={`flex items-center gap-1 px-4 py-2 text-white rounded shadow-sm text-sm font-bold transition-colors ${isGenerating ? "bg-builder-primary opacity-60 cursor-not-allowed" : "bg-builder-primary hover:bg-builder-primary-hover"}`}>
          {isGenerating ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              生成中 ({generateProgress?.current || 0}/{generateProgress?.total || 3})
            </>
          ) : "🧙‍♂️ 自動作成"}
        </button>
      </div>
    </div>
  );
}
