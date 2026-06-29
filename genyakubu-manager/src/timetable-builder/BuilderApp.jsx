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
import OnboardingOverlay from './components/OnboardingOverlay';
import { STORAGE_KEY_ONBOARDING_SEEN, resolveGenerationParams } from './utils/constants';
import { checkStorageHealth, formatBytes } from './utils/storageHealth';
import { useTabPresence } from './hooks/useTabPresence';

function ScheduleApp() {
  const { project, undo, redo, loadError } = useProjectContext();
  const { showToast } = useUI();

  // 自動生成の案の数はユーザ設定 (project.numPatterns) を尊重 (E2e)。
  const NUM_PATTERNS = resolveGenerationParams(project).numPatterns;

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

  // 起動時に保存サイズを概算し、localStorage 上限に近づいていたら警告 (E6c)。
  // データ消失 (silent な保存失敗) の予防。マウント時 1 回のみ。
  useEffect(() => {
    const { warn, bytes } = checkStorageHealth(project);
    if (warn) {
      showToast(
        `保存データが大きくなっています (約 ${formatBytes(bytes)})。不要なスナップショットやタブを整理するか、JSON 書き出しでバックアップしてください。`,
        'warning',
        8000,
      );
    }
    // 起動時 1 回のみ。project の逐次変化では再警告しない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同一ブラウザで複数タブ開いた時に一度だけ警告 (E6d)。autosave の相互上書き予防。
  useTabPresence(
    useCallback(() => {
      showToast(
        'このツールを別のタブでも開いています。複数タブで編集すると保存が競合し、変更が失われることがあります。1 つのタブに絞ることをおすすめします。',
        'warning',
        8000,
      );
    }, [showToast]),
  );

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
  // E2f: 生成の経過時間。生成中は interval で更新し、完了時に総時間を確定する。
  const [generateElapsedMs, setGenerateElapsedMs] = useState(0);
  const genStartRef = useRef(0);
  // E2f live: 探索の途中経過 (案番号 / 充填数 / 探索回数)。null = 未通知。
  const [generateLive, setGenerateLive] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [isCompact, setIsCompact] = useState(false);
  // 初回起動なら true。LocalStorage 読込失敗時は安全側で false (邪魔しない)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY_ONBOARDING_SEEN) !== '1';
    } catch {
      return false;
    }
  });

  const handleCloseOnboarding = useCallback(({ dontShowAgain } = {}) => {
    setShowOnboarding(false);
    if (dontShowAgain) {
      try {
        window.localStorage.setItem(STORAGE_KEY_ONBOARDING_SEEN, '1');
      } catch {
        // private mode 等での失敗は無視 (次回も表示されるだけ)
      }
    }
  }, []);
  // 起動中の worker handle を ref で保持 (アンマウント時にキャンセル)
  const generationRef = useRef(null);

  const handleGenerate = useCallback(() => {
    // 多重起動を防ぐため、既に走っているなら一旦キャンセル
    generationRef.current?.cancel();

    setIsGenerating(true);
    setGeneratedPatterns([]);
    setGenerateProgress({ current: 0, total: NUM_PATTERNS });
    genStartRef.current = Date.now();
    setGenerateElapsedMs(0);
    setGenerateLive(null);

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
      // 探索の途中経過 (間引き済) を live 表示用 state に反映 (E2f)
      onProgress: (index, progress) => {
        setGenerateLive({ index, ...progress });
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
          // E2f: 生成の手応え (探索回数 / 上限到達 / 詰まりセル)
          iterations: r.iterations,
          hitLimit: r.hitLimit,
          stuckSlot: r.stuckSlot,
        }))
        .filter(r => r.schedule !== null);

      // 生成にかかった総時間を確定 (E2f)
      setGenerateElapsedMs(genStartRef.current ? Date.now() - genStartRef.current : 0);

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
      setGenerateLive(null);
      generationRef.current = null;
    });
  }, [project, showToast, NUM_PATTERNS]);

  // ユーザ操作による生成キャンセル。worker を止め、done.then の state 更新を
  // skip させてから isGenerating を解除する。既存セルはそのまま残す。
  const handleCancelGenerate = useCallback(() => {
    const handle = generationRef.current;
    if (!handle) return;
    // generationRef を先に null にすると done.then の guard
    // (generationRef.current !== handle) が真になり state 更新が skip される。
    generationRef.current = null;
    handle.cancel();
    setIsGenerating(false);
    setGenerateProgress({ current: 0, total: NUM_PATTERNS });
    setGenerateLive(null);
    showToast('自動作成を中止しました', 'warning', 2000);
  }, [showToast, NUM_PATTERNS]);

  // アンマウント時に進行中の生成をキャンセル (リーク防止)
  useEffect(() => {
    return () => {
      generationRef.current?.cancel();
      generationRef.current = null;
    };
  }, []);

  // 生成中だけ経過時間を 100ms 間隔で更新する (E2f)。完了/中止で停止。
  useEffect(() => {
    if (!isGenerating) return undefined;
    const id = setInterval(() => {
      if (genStartRef.current) setGenerateElapsedMs(Date.now() - genStartRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [isGenerating]);

  const handleContextMenu = (e, dateId, periodId, classId, type = null, val = null) => {
    e.preventDefault();
    setContextMenu({ x: e.pageX, y: e.pageY, dateId, periodId, classId, type, val });
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
    <div className="font-sans builder-root" onClick={() => setContextMenu(null)}>
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
          generateElapsedMs={generateElapsedMs}
          generateLive={generateLive}
          onGenerate={handleGenerate}
          onCancelGenerate={handleCancelGenerate}
          onShowHelp={() => setShowOnboarding(true)}
        />

        <SummaryPanel
          showSummary={showSummary}
          generatedPatterns={generatedPatterns}
          setGeneratedPatterns={setGeneratedPatterns}
          generatedElapsedMs={generateElapsedMs}
        />

        {showConfig && <ConfigModal onClose={() => setShowConfig(false)} />}

        <ScheduleTable isCompact={isCompact} onContextMenu={handleContextMenu} />
      </div>

      <ContextMenu
        contextMenu={contextMenu}
        clipboard={clipboard}
        onClose={handleContextMenuClose}
      />

      <OnboardingOverlay open={showOnboarding} onClose={handleCloseOnboarding} />
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
