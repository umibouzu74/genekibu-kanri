import { useEffect, useRef, useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { parseKey, makeNgKey } from '../utils/scheduleKey';
import { INFEASIBILITY_KINDS } from '../utils/fixSuggestions';
import SnapshotMenu from './SnapshotMenu';

export default function Toolbar({
  isCompact,
  setIsCompact,
  showSummary,
  setShowSummary,
  setShowConfig,
  isGenerating,
  generateProgress,
  generateElapsedMs,
  generateLive,
  onGenerate,
  onCancelGenerate,
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
    project,
    toggleTeacherNg,
    updateGenerationParams,
  } = useProjectContext();
  const { showConfirm, showToast } = useUI();

  // E2b: 修正提案のワンクリック適用。action 種別ごとに対応する dispatch を呼ぶ。
  const applyFix = (action) => {
    if (!action) return;
    if (action.type === 'releaseNg') {
      const idx = (project?.teachers || []).findIndex(t => t.name === action.teacherName);
      if (idx < 0) {
        showToast?.('対象の講師が見つかりません', 'error', 3000);
        return;
      }
      // toggleTeacherNg はトグルなので、二度押し / 再計算前クリックで NG を
      // 付け直さないよう、現在 NG のときだけ解除する (冪等化, review F3)。
      const k = makeNgKey(action.date, action.period);
      if (!(project?.teachers?.[idx]?.ngSlots || []).includes(k)) {
        showToast?.(`${action.teacherName} の ${action.date} ${action.period} は既に NG ではありません`, 'warning', 2500);
        return;
      }
      toggleTeacherNg?.(idx, action.date, action.period);
      showToast?.(`${action.teacherName} の ${action.date} ${action.period} の NG を解除しました`, 'success', 2500);
    } else if (action.type === 'setMaxDaily') {
      updateGenerationParams?.({ maxDailyHours: action.value });
      showToast?.(`1日コマ数上限を ${action.value} に変更しました`, 'success', 2500);
    }
  };
  const { violations, infeasibilities } = analysis;
  // 種別ごとのラベル文言・informational 判定 (バッジに数えない種別) は
  // INFEASIBILITY_KINDS レジストリ (utils/fixSuggestions.js, F2m) に集約。
  const infeasItems = INFEASIBILITY_KINDS.flatMap(def =>
    (infeasibilities?.[def.key]?.items || []).map(it => ({
      kind: def.kind,
      ...(def.informational ? { informational: true } : {}),
      label: def.label(it),
      suggestions: it.suggestions || [],
    })));

  // popover の開閉と外側クリック検知
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef(null);
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setPopoverOpen(false);
      }
    };
    const keyHandler = (e) => {
      if (e.key === 'Escape') setPopoverOpen(false);
    };
    // mousedown で先に閉じることで「ボタンの再クリックで閉じる」も両立
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [popoverOpen]);

  const handleClearClick = async () => {
    const ok = await showConfirm(
      "表示中のロックされていないセルを全てクリアしますか？\n(「使う日・使う時限」から外して非表示になっているコマは温存されます)",
      { title: "生成クリア", danger: true, confirmLabel: "クリア" },
    );
    if (ok) handleClearUnlocked();
  };

  const scrollToKey = (key) => {
    if (!key) return;
    const parsed = parseKey(key);
    if (!parsed) return;
    const targetId = `select-${parsed.dateId}-${parsed.periodId}-${parsed.classId}-cell`;
    const el = document.getElementById(targetId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // popover に表示すべき violation 種別 (count > 0 のみ)
  const popoverRows = [];
  if (violations.teacherConflict.count > 0) {
    popoverRows.push({
      kind: 'teacherConflict',
      label: '講師重複',
      count: violations.teacherConflict.count,
      firstKey: violations.teacherConflict.firstKey,
    });
  }
  if (violations.teacherNgAssigned?.count > 0) {
    popoverRows.push({
      kind: 'teacherNgAssigned',
      label: 'NG設定違反 (後付けNG)',
      count: violations.teacherNgAssigned.count,
      firstKey: violations.teacherNgAssigned.firstKey,
    });
  }
  if (violations.subjectDup.count > 0) {
    popoverRows.push({
      kind: 'subjectDup',
      label: '同一クラス×同日に同一科目',
      count: violations.subjectDup.count,
      firstKey: violations.subjectDup.firstKey,
    });
  }
  if (violations.subjectOver.count > 0) {
    popoverRows.push({
      kind: 'subjectOver',
      label: '科目クォータ超過',
      count: violations.subjectOver.count,
      firstKey: violations.subjectOver.firstKey,
    });
  }
  const teacherOverItems = violations.teacherOverDaily.items;
  // informational (quotaCellMismatch) はバッジの件数に数えない
  const countedInfeasItems = infeasItems.filter(it => !it.informational);
  const totalViolationCount =
    popoverRows.reduce((s, r) => s + r.count, 0) + teacherOverItems.length + countedInfeasItems.length;
  // 種別が teacherConflict 1 つだけ (subjectDup / subjectOver / teacherOverDaily /
  // カウント対象の infeasItems が全て 0) の場合は popover を開かず即スクロール
  // する (旧挙動互換)。informational は fast path を妨げない。
  const isOnlyTeacherConflict =
    violations.teacherConflict.count > 0 &&
    (violations.teacherNgAssigned?.count || 0) === 0 &&
    violations.subjectDup.count === 0 &&
    violations.subjectOver.count === 0 &&
    teacherOverItems.length === 0 &&
    countedInfeasItems.length === 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-4 p-2 bg-builder-surface-alt border border-builder-border rounded no-print">
      <div className="flex items-center gap-3 bg-builder-surface px-3 py-1.5 rounded border border-builder-border shadow-sm flex-1 min-w-[250px]">
        <div className="text-xs font-bold text-builder-ink-muted">進捗</div>
        <div
          role="progressbar"
          aria-label="完成度"
          aria-valuenow={dashboard.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="flex-1 h-3 bg-builder-border rounded-full overflow-hidden relative"
        >
          <div className="h-full bg-builder-blue transition-all duration-500" style={{ width: `${dashboard.progress}%` }}></div>
        </div>
        <div className="text-sm font-bold text-builder-blue w-12 text-right">{dashboard.progress}%</div>
        {totalViolationCount > 0 ? (
          <div className="relative ml-2" ref={popoverRef}>
            <button
              type="button"
              onClick={() => {
                if (isOnlyTeacherConflict) {
                  scrollToKey(violations.teacherConflict.firstKey);
                  return;
                }
                setPopoverOpen((v) => !v);
              }}
              aria-haspopup="dialog"
              aria-expanded={popoverOpen}
              className="text-xs bg-builder-danger-soft text-builder-red px-2 py-1 rounded border border-builder-danger-border font-bold animate-pulse hover:bg-builder-danger-border"
              title="違反の内訳を開く"
            >
              ⚠️ {totalViolationCount}件
            </button>
            {popoverOpen && (
              <div
                role="dialog"
                aria-label="違反の内訳"
                className="absolute z-50 top-full left-0 mt-1 w-72 bg-builder-surface border border-builder-border rounded shadow-lg p-3 text-builder-ink"
              >
                <div className="text-xs font-bold text-builder-ink-muted mb-2">違反の内訳</div>
                <ul className="space-y-1.5 text-xs">
                  {popoverRows.map((row) => (
                    <li key={row.kind} className="flex items-center justify-between gap-2">
                      <span className="flex-1 min-w-0 truncate">{row.label}</span>
                      <span className="font-bold text-builder-red">{row.count}件</span>
                      {row.firstKey && (
                        <button
                          type="button"
                          onClick={() => { scrollToKey(row.firstKey); setPopoverOpen(false); }}
                          className="px-1.5 py-0.5 border border-builder-border rounded text-builder-ink-muted hover:bg-builder-surface-alt"
                          title="最初の該当セルへ移動"
                        >→</button>
                      )}
                    </li>
                  ))}
                  {teacherOverItems.length > 0 && (
                    <li className="pt-1.5 mt-1.5 border-t border-builder-border">
                      <div className="font-bold mb-1">講師日上限超 ({teacherOverItems.length}件)</div>
                      <ul className="space-y-0.5 pl-2 text-builder-ink-muted">
                        {teacherOverItems.slice(0, 5).map((it) => (
                          <li key={`${it.date}-${it.teacher}`} className="flex items-center justify-between gap-2">
                            <span className="flex-1 min-w-0 truncate">
                              {it.teacher} {it.date}: <span className="font-bold text-builder-red">{it.total}/{it.max}</span>
                            </span>
                            {it.firstKey && (
                              <button
                                type="button"
                                onClick={() => { scrollToKey(it.firstKey); setPopoverOpen(false); }}
                                className="px-1.5 py-0.5 border border-builder-border rounded text-builder-ink-muted hover:bg-builder-surface-alt"
                                title="該当先生の最初のセルへ移動"
                              >→</button>
                            )}
                          </li>
                        ))}
                        {teacherOverItems.length > 5 && (
                          <li className="italic">他 {teacherOverItems.length - 5} 件</li>
                        )}
                      </ul>
                    </li>
                  )}
                  {infeasItems.length > 0 && (
                    <li className="pt-1.5 mt-1.5 border-t border-builder-border">
                      <div className="font-bold mb-1 text-builder-red">設定の問題 ({infeasItems.length}件)</div>
                      <ul className="space-y-1 pl-2 text-builder-ink-muted">
                        {infeasItems.slice(0, 8).map((it, i) => (
                          <li key={`infeas-${i}`} className="text-[11px]">
                            <div>{it.label}</div>
                            {it.suggestions.length > 0 && (
                              <ul className="mt-0.5 pl-2 space-y-0.5">
                                {it.suggestions.map((s, j) => (
                                  <li key={j} className="text-builder-blue flex items-start gap-1">
                                    <span aria-hidden="true">💡</span>
                                    <span className="flex-1">{s.text}</span>
                                    {s.action && (
                                      <button
                                        type="button"
                                        onClick={() => applyFix(s.action)}
                                        className="ml-1 px-1.5 py-0.5 border border-builder-blue rounded text-builder-blue hover:bg-builder-info-soft whitespace-nowrap"
                                        title="この修正を適用する"
                                      >適用</button>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                        {infeasItems.length > 8 && (
                          <li className="italic">他 {infeasItems.length - 8} 件</li>
                        )}
                      </ul>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ) : <span className="ml-2 text-xs text-builder-green font-bold">✨ OK</span>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button onClick={() => setIsCompact(!isCompact)} className="flex items-center gap-1 px-3 py-2 bg-builder-surface border border-builder-border text-builder-ink-muted rounded hover:bg-builder-surface-alt shadow-sm text-sm" title="表示サイズを切り替え">
          {isCompact ? "🔍 標準" : "📏 縮小"}
        </button>
        <div className="h-6 w-px bg-builder-border mx-1"></div>
        <button onClick={undo} disabled={historyIndex === 0} className="px-3 py-2 text-builder-ink-muted hover:bg-builder-bg disabled:opacity-30 border border-builder-border rounded shadow-sm" title="元に戻す (Undo)">↩️</button>
        <button onClick={redo} disabled={historyIndex === history.length - 1} className="px-3 py-2 text-builder-ink-muted hover:bg-builder-bg disabled:opacity-30 border border-builder-border rounded shadow-sm" title="やり直す (Redo)">↪️</button>
        <div className="h-6 w-px bg-builder-border mx-1"></div>
        <SnapshotMenu />
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
              {/* current は「完了した案の数」。ライブ行の「案 N 探索中」と
                  基準を揃え、探索中の案番号 (完了数+1、上限 total) を出す */}
              生成中 ({Math.min((generateProgress?.current || 0) + 1, generateProgress?.total || 1)}/{generateProgress?.total || 1})
              {generateElapsedMs > 0 && (
                <span className="font-normal tabular-nums" aria-label="経過時間">
                  {' '}⏱ {(generateElapsedMs / 1000).toFixed(1)}s
                </span>
              )}
            </>
          ) : "🧙‍♂️ 自動作成"}
        </button>
        {isGenerating && onCancelGenerate && (
          <button
            onClick={onCancelGenerate}
            className="flex items-center gap-1 px-3 py-2 bg-builder-danger-soft text-builder-red border border-builder-danger-border rounded hover:bg-builder-danger-border shadow-sm text-sm font-bold"
            title="自動作成を中止する"
          >
            ✕ 中止
          </button>
        )}
      </div>
      {isGenerating && generateLive && (
        <div
          className="w-full text-xs text-builder-ink-muted bg-builder-surface border border-builder-border rounded px-3 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1"
          aria-live="polite"
        >
          <span>案 <span className="font-bold text-builder-ink">{(generateLive.index ?? 0) + 1}</span> 探索中</span>
          {generateLive.totalSlots > 0 && (
            <span>
              充填 <span className="font-bold text-builder-blue tabular-nums">{generateLive.filledCount}</span>
              {' / '}{generateLive.totalSlots} コマ
            </span>
          )}
          <span>探索 <span className="font-bold tabular-nums">{(generateLive.iterations ?? 0).toLocaleString()}</span> 回</span>
        </div>
      )}
    </div>
  );
}
