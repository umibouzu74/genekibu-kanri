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
import { STORAGE_KEY_ONBOARDING_SEEN, resolveGenerationParams, resolveBaseSeed } from './utils/constants';
import { formatPrintDateJa } from './utils/printHeader';
import { countFatalInfeasibilities } from './utils/fixSuggestions';
import { computeGenerationFingerprint } from './utils/generationFingerprint';
import { checkStorageHealth, formatBytes } from './utils/storageHealth';
import { useTabPresence } from './hooks/useTabPresence';
import type { GeneratorHandle } from './logic/runGenerator';
import type { GenerationResult } from './logic/autoGenerator';
import type { GeneratedPattern } from './components/SummaryPanel';
import type { BuilderContextMenuState, CellClipboard } from './components/ContextMenu';

function ScheduleApp() {
  const { project, undo, redo, loadError, analysis } = useProjectContext();
  const { showToast, showConfirm } = useUI();

  // 自動生成の案の数はユーザ設定 (project.numPatterns) を尊重 (E2e)。
  const { numPatterns: NUM_PATTERNS, generationSeed: GENERATION_SEED } = resolveGenerationParams(project);

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

      // Shift 押下時は e.key が大文字 ('Z') になるため必ず小文字化して比較する。
      // 'z' と直接比較すると Ctrl+Shift+Z (redo) が一度も発火しない。
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const [showConfig, setShowConfig] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [generatedPatterns, setGeneratedPatterns] = useState<GeneratedPattern[]>([]);
  // 生成元タブ ({id, name})。結果パネルはタブ切替後も表示されたままなので、
  // 「この案を採用」はアクティブタブではなく必ずこのタブへ適用する。
  const [generatedForTab, setGeneratedForTab] = useState<{ id: number; name: string } | null>(null);
  // 生成開始時点の config fingerprint (F2n/F2p)。project 変化のたびに
  // 再計算して一致しなくなったら生成結果を破棄する (下の effect)。
  const [generatedFingerprint, setGeneratedFingerprint] = useState<string | null>(null);
  // L1e: この結果を生成した baseSeed。結果パネルに表示し、⚙️自動生成の
  // 「乱数 seed」に入力すれば同じ設定で同じ案を再現できる。
  const [generatedSeed, setGeneratedSeed] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState({ current: 0, total: NUM_PATTERNS });
  // E2f: 生成の経過時間。生成中は interval で更新し、完了時に総時間を確定する。
  const [generateElapsedMs, setGenerateElapsedMs] = useState(0);
  const genStartRef = useRef(0);
  // E2f live: 探索の途中経過 (案番号 / 充填数 / 探索回数)。null = 未通知。
  const [generateLive, setGenerateLive] = useState<{ index: number; iterations: number; filledCount: number; totalSlots: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<BuilderContextMenuState | null>(null);
  const [clipboard, setClipboard] = useState<CellClipboard | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  // L2a: 講師ハイライト。指定講師の割当セルをグリッド上で強調する
  // (集計パネルとグリッドの往復を減らす)。null = ハイライトなし。
  const [highlightTeacher, setHighlightTeacher] = useState<string | null>(null);

  // §M: ハイライト中の講師がリネーム / 削除されると、全セルが薄表示のまま
  // 一致ゼロの「幽霊状態」になる (select の値も options に無い)。講師が
  // 実在しなくなったらハイライトを解除する。
  useEffect(() => {
    if (highlightTeacher && !project.teachers.some(t => t.name === highlightTeacher)) {
      setHighlightTeacher(null);
    }
  }, [project.teachers, highlightTeacher]);
  // 初回起動なら true。LocalStorage 読込失敗時は安全側で false (邪魔しない)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY_ONBOARDING_SEEN) !== '1';
    } catch {
      return false;
    }
  });

  // ConfigModal の focus trap が onClose の identity 変化で再初期化されない
  // よう stable callback にする (useFocusTrap 側の ref 化と二重の防御)。
  const handleCloseConfig = useCallback(() => setShowConfig(false), []);

  const handleCloseOnboarding = useCallback(({ dontShowAgain }: { dontShowAgain?: boolean } = {}) => {
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
  const generationRef = useRef<GeneratorHandle | null>(null);

  // JSON 読込・全リセットで project が丸ごと入れ替わったら生成結果を破棄する。
  // ScheduleApp は unmount されないため、放置すると旧プロジェクト由来の案を
  // 「この案を採用」で新プロジェクトへ書き込めてしまう (tabId は両者とも
  // 1 始まりの連番で衝突するため reducer の存在チェックを通過する)。
  // createdAt は同一プロジェクト内の編集では変わらない識別子。
  useEffect(() => {
    setGeneratedPatterns([]);
    setGeneratedForTab(null);
    setGeneratedFingerprint(null);
    // 旧プロジェクト相手に走っている生成も止める (完了後に旧案が届くのを防ぐ)
    if (generationRef.current) {
      generationRef.current.cancel();
      generationRef.current = null;
      setIsGenerating(false);
      setGenerateLive(null);
    }
  }, [project.createdAt]);

  // F2n/F2p: 生成後に案の前提となる構造 (使う日・時限・クラス・クォータ・
  // 合同・生成制約) が変わったら生成結果を破棄する。タブ削除も fingerprint
  // が null になるためここで検出される (削除 → 同 ID 再作成の間に必ず
  // 「ID 不在」の render を挟むので、ID 再利用による別タブへの誤適用も防ぐ)。
  // teachers / 外部コマ / schedule の変更では破棄しない (fingerprint の
  // 対象外。理由は utils/generationFingerprint.js を参照)。
  useEffect(() => {
    if (generatedPatterns.length === 0 || !generatedForTab) return;
    const current = computeGenerationFingerprint(project, generatedForTab.id);
    if (current !== generatedFingerprint) {
      setGeneratedPatterns([]);
      setGeneratedForTab(null);
      setGeneratedFingerprint(null);
      showToast('設定が変更されたため、以前の生成結果を破棄しました。必要なら再度 🧙‍♂️ 自動作成してください。', 'warning', 4000);
    }
  }, [project, generatedPatterns.length, generatedForTab, generatedFingerprint, showToast]);

  const handleGenerate = useCallback(async () => {
    // L1h: 静的に「完全解は出ない」と分かっている設定 (担当講師ゼロ /
    // capacity 不足 / コマ数 > 使う日数) なら、数秒〜数十秒の生成を走らせる
    // 前に確認する。informational な種別 (未定のみ等) は生成可能なので
    // 数えない (K2d)。データは Toolbar の ⚠️ popover と同じ。
    const fatalCount = countFatalInfeasibilities(analysis?.infeasibilities);
    if (fatalCount > 0) {
      const ok = await showConfirm(
        `設定に解けない問題が ${fatalCount} 件あり、このままでは完全解を生成できません` +
          `(ツールバーの「⚠️」から詳細と修正提案を確認できます)。\n\n` +
          `可能な範囲まで埋めた部分解の生成を試しますか？`,
        { title: '解けない設定の検出', confirmLabel: '生成する' },
      );
      if (!ok) return;
    }

    // 多重起動を防ぐため、既に走っているなら一旦キャンセル
    generationRef.current?.cancel();

    setIsGenerating(true);
    setGeneratedPatterns([]);
    const forTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
    setGeneratedForTab(forTab ? { id: forTab.id, name: forTab.name } : null);
    setGeneratedFingerprint(forTab ? computeGenerationFingerprint(project, forTab.id) : null);
    setGenerateProgress({ current: 0, total: NUM_PATTERNS });
    genStartRef.current = Date.now();
    setGenerateElapsedMs(0);
    setGenerateLive(null);

    // L1e: seed 設定 (非 0) があればそれを使い、0 (既定) は実行ごとに
    // ランダム。使った値は結果パネルに表示して再現可能にする。
    // §M: 表示 seed は必ず ⚙️ の入力上限内に収める (resolveBaseSeed 参照)。
    const baseSeed = resolveBaseSeed(GENERATION_SEED, Date.now());
    setGeneratedSeed(baseSeed);

    const results: GenerationResult[] = [];
    // onError と done.then が両方走った時に「生成エラー」+「条件を見直してください」
    // の二重 toast が出ないよう、エラー発生フラグで done 側の文言を抑制する
    let errored = false;
    const handle = runGeneratorInWorker({
      project,
      activeTabId: project.activeTabId,
      numPatterns: NUM_PATTERNS,
      baseSeed,
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
        .filter(r => r.schedule !== null)
        // 完全解を先頭に、部分解は充填数の多い順 (P2)。生成順のままだと
        // 完全解が 3 列目に埋もれて部分解を採用してしまいやすい。
        .sort((a, b) => (Number(a.isPartial) - Number(b.isPartial)) || (b.filledCount - a.filledCount));

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
  }, [project, showToast, showConfirm, analysis, NUM_PATTERNS, GENERATION_SEED]);

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

  const handleContextMenu = (
    e: { preventDefault: () => void; clientX: number; clientY: number },
    dateId: number | null,
    periodId: number | null,
    classId: number | null,
    type: BuilderContextMenuState['type'] = null,
    val: string | null = null,
  ) => {
    e.preventDefault();
    // ContextMenu は position:fixed (viewport 基準) なので clientX/Y を使う。
    // pageX/Y だとページがスクロールしている分だけメニューが下にずれる。
    setContextMenu({ x: e.clientX, y: e.clientY, dateId, periodId, classId, type, val });
  };

  const handleContextMenuClose = (copiedData?: CellClipboard | null) => {
    if (copiedData && copiedData.subject) {
      setClipboard(copiedData);
    }
    setContextMenu(null);
  };

  // 親アプリ側でも .no-print を扱っているため、ここでは @page のみ。
  const printStyle = `@media print { @page { size: landscape; } .print-container { max-height: none !important; border: none !important; overflow: visible !important; } }`;

  // L1f: 印刷見出し用。生成結果パネル等と違い「今表示しているタブ」を刷る。
  const activeTabForPrint = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];

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
          highlightTeacher={highlightTeacher}
          setHighlightTeacher={setHighlightTeacher}
        />

        <SummaryPanel
          showSummary={showSummary}
          generatedPatterns={generatedPatterns}
          setGeneratedPatterns={setGeneratedPatterns}
          generatedElapsedMs={generateElapsedMs}
          generatedForTab={generatedForTab}
          generatedSeed={generatedSeed}
        />

        {showConfig && <ConfigModal onClose={handleCloseConfig} />}

        {/* L1f: 印刷専用の見出し。Header (プロジェクト名) と TabBar (学年) は
            no-print のため、これが無いと紙面が無記名になり、複数学年を刷った
            ときにどの紙がどの学年か分からない。 */}
        <div className="hidden print:block mb-2" aria-hidden="true">
          <div className="text-lg font-bold text-builder-ink">
            {(project.name || '講習時間割')}
            {activeTabForPrint ? ` — ${activeTabForPrint.name}` : ''}
          </div>
          <div className="text-xs text-builder-ink-muted">印刷日: {formatPrintDateJa(new Date())}</div>
        </div>

        <ScheduleTable isCompact={isCompact} onContextMenu={handleContextMenu} highlightTeacher={highlightTeacher} />
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
