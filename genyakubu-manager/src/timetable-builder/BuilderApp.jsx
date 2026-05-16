import { useState, useEffect, useCallback, useRef } from 'react';
import './tailwind.css';
import { ProjectProvider } from './contexts/ProjectContext';
import { UIProvider } from './contexts/UIContext';
import { useUI } from './contexts/uiContextValue';
import { useProjectContext } from './contexts/projectContextValue';
import { runGeneratorInWorker } from './logic/runGenerator';
import Header from './components/Header';
import TabBar from './components/TabBar';
import Toolbar from './components/Toolbar';
import ScheduleTable from './components/ScheduleTable';
import SummaryPanel from './components/SummaryPanel';
import ContextMenu from './components/ContextMenu';
import ConfigModal from './components/ConfigModal';

const NUM_PATTERNS = 3;

function ScheduleApp() {
  const { project, undo, redo, loadError } = useProjectContext();
  const { showToast } = useUI();

  useEffect(() => {
    const base = '時間割作成くん';
    const previousTitle = document.title;
    document.title = project.name ? `${project.name} - ${base}` : base;
    return () => {
      // Builder アンマウント時に親アプリの title へ戻す
      document.title = previousTitle;
    };
  }, [project.name]);

  // 初期マウント時に load error があれば toast で通知 (一度のみ)。
  // 起動時のサイレント失敗を可視化するため。
  useEffect(() => {
    if (loadError) {
      showToast(
        `プロジェクトの読み込みに失敗しました。デフォルト設定で起動します。(${loadError})`,
        'error',
        8000,
      );
    }
    // loadError は初期マウントで決定された静的値なので deps に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl+Z / Ctrl+Shift+Z キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e) => {
      // input, select, textarea 内では無効化
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const [showConfig, setShowConfig] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [generatedPatterns, setGeneratedPatterns] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState({ current: 0, total: NUM_PATTERNS });
  const [contextMenu, setContextMenu] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [isCompact, setIsCompact] = useState(false);
  // 起動中の worker handle を ref で保持 (アンマウント時にキャンセル)
  const generationRef = useRef(null);

  const handleGenerate = useCallback(() => {
    // 多重起動を防ぐため、既に走っているなら一旦キャンセル
    generationRef.current?.cancel();

    setIsGenerating(true);
    setGeneratedPatterns([]);
    setGenerateProgress({ current: 0, total: NUM_PATTERNS });

    const results = [];
    // onError と done.then が両方走った時に「生成エラー」+「条件を見直してください」
    // の二重 toast が出ないよう、エラー発生フラグで done 側の文言を抑制する
    let errored = false;
    const handle = runGeneratorInWorker({
      project,
      activeTabId: project.activeTabId,
      numPatterns: NUM_PATTERNS,
      baseSeed: Date.now(),
      onPattern: (index, result) => {
        results[index] = result;
        setGenerateProgress({ current: index + 1, total: NUM_PATTERNS });
      },
      onError: (msg) => {
        errored = true;
        showToast(`生成エラー: ${msg}`, "error", 5000);
      },
    });

    generationRef.current = handle;

    handle.done.then(() => {
      // この handle が走っている間に新しい生成が始まっていたら (cancel された)
      // ここでの state 更新は skip。新しい handle の done が代わりに UI を更新する。
      if (generationRef.current !== handle) return;

      const patterns = results
        .filter(Boolean)
        .map(r => ({
          schedule: r.solution || r.bestPartial,
          isPartial: r.solution === null,
          filledCount: r.solution ? r.totalSlots : r.filledCount,
          totalSlots: r.totalSlots,
        }))
        .filter(r => r.schedule !== null);

      if (patterns.length > 0) {
        setGeneratedPatterns(patterns);
        const hasPartial = patterns.some(p => p.isPartial);
        if (hasPartial) {
          showToast("一部の案は完全解が見つからなかったため、可能な範囲で埋めた部分解です。", "warning", 5000);
        }
      } else if (!errored) {
        // onError 経由のエラー toast は既に出ているので、それ以外の "パターン 0" のみ
        showToast("パターンを生成できませんでした。条件を見直してください。", "error", 5000);
      }
      setIsGenerating(false);
      generationRef.current = null;
    });
  }, [project, showToast]);

  // アンマウント時に進行中の生成をキャンセル (リーク防止)
  useEffect(() => {
    return () => {
      generationRef.current?.cancel();
      generationRef.current = null;
    };
  }, []);

  const handleContextMenu = (e, dIdx, pIdx, cIdx, type = null, val = null) => {
    e.preventDefault();
    setContextMenu({ x: e.pageX, y: e.pageY, dIdx, pIdx, cIdx, type, val });
  };

  const handleContextMenuClose = (copiedData) => {
    if (copiedData && copiedData.subject) {
      setClipboard(copiedData);
    }
    setContextMenu(null);
  };

  // 親アプリ側でも .no-print を扱っているため、ここでは @page のみ。
  const printStyle = `@media print { @page { size: landscape; } .print-container { max-height: none !important; border: none !important; overflow: visible !important; } }`;

  // 親アプリ (app-main) が既に padding と背景色を提供しているので、ここでは
  // ラッパに padding/背景を載せない。font-sans のみ Builder スコープで宣言。
  return (
    <div className="font-sans" onClick={() => setContextMenu(null)}>
      <style>{printStyle}</style>

      <Header />
      <TabBar />

      <div className="bg-builder-surface p-4 rounded-b-lg rounded-tr-lg shadow-sm border border-builder-border min-h-[600px]">
        <Toolbar
          isCompact={isCompact}
          setIsCompact={setIsCompact}
          showSummary={showSummary}
          setShowSummary={setShowSummary}
          setShowConfig={setShowConfig}
          isGenerating={isGenerating}
          generateProgress={generateProgress}
          onGenerate={handleGenerate}
        />

        <SummaryPanel
          showSummary={showSummary}
          generatedPatterns={generatedPatterns}
          setGeneratedPatterns={setGeneratedPatterns}
        />

        {showConfig && <ConfigModal onClose={() => setShowConfig(false)} />}

        <ScheduleTable isCompact={isCompact} onContextMenu={handleContextMenu} />
      </div>

      <ContextMenu
        contextMenu={contextMenu}
        clipboard={clipboard}
        onClose={handleContextMenuClose}
      />
    </div>
  );
}

export default function BuilderApp() {
  return (
    <UIProvider>
      <ProjectProvider>
        <ScheduleApp />
      </ProjectProvider>
    </UIProvider>
  );
}
