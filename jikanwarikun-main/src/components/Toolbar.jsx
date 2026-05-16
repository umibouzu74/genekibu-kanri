import React from 'react';
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
      const targetId = `select-${parsed.dIdx}-${parsed.pIdx}-${parsed.cIdx}-cell`;
      const el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-4 p-2 bg-slate-50 border border-slate-200 rounded no-print">
      <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded border border-gray-200 shadow-sm flex-1 min-w-[250px]">
        <div className="text-xs font-bold text-gray-500">進捗</div>
        <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden relative">
          <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${dashboard.progress}%` }}></div>
        </div>
        <div className="text-sm font-bold text-blue-600 w-12 text-right">{dashboard.progress}%</div>
        {analysis.errorKeys.length > 0 ? (
          <button onClick={scrollToFirstError} className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-1 rounded border border-red-200 font-bold animate-pulse hover:bg-red-200">
            ⚠️ {analysis.errorKeys.length}件
          </button>
        ) : <span className="ml-2 text-xs text-green-600 font-bold">✨ OK</span>}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setIsCompact(!isCompact)} className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 shadow-sm text-sm" title="表示サイズを切り替え">
          {isCompact ? "🔍 標準" : "📏 縮小"}
        </button>
        <div className="h-6 w-px bg-gray-300 mx-1"></div>
        <button onClick={undo} disabled={historyIndex === 0} className="px-3 py-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30 border rounded shadow-sm" title="元に戻す (Undo)">↩️</button>
        <button onClick={redo} disabled={historyIndex === history.length - 1} className="px-3 py-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30 border rounded shadow-sm" title="やり直す (Redo)">↪️</button>
        <div className="h-6 w-px bg-gray-300 mx-1"></div>
        <button onClick={() => setShowSummary(!showSummary)} className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow-sm text-sm font-bold" title="講師別コマ数の集計を表示/非表示">📊 集計</button>
        <button onClick={() => setShowConfig(true)} className="flex items-center gap-1 px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 shadow-sm text-sm font-bold" title="講師・科目・NG設定など">⚙️ 設定</button>
        <div className="h-6 w-px bg-gray-300 mx-1"></div>
        <button onClick={handleClearClick} className="flex items-center gap-1 px-3 py-2 bg-red-100 text-red-700 border border-red-200 rounded hover:bg-red-200 shadow-sm text-sm font-bold" title="ロックされていないセルを全てクリア">🗑️ 生成クリア</button>
        <button onClick={onGenerate} disabled={isGenerating} className={`flex items-center gap-1 px-4 py-2 text-white rounded shadow-sm text-sm font-bold transition-colors ${isGenerating ? "bg-purple-300 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"}`}>
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
