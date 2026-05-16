import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ProjectProvider } from './contexts/ProjectContext';
import { UIProvider } from './contexts/UIContext';
import { useUI } from './contexts/uiContextValue';
import { useProjectContext } from './contexts/projectContextValue';
import { generateSinglePattern } from './logic/autoGenerator';
import Header from './components/Header';
import TabBar from './components/TabBar';
import Toolbar from './components/Toolbar';
import ScheduleTable from './components/ScheduleTable';
import SummaryPanel from './components/SummaryPanel';
import ContextMenu from './components/ContextMenu';
import ConfigModal from './components/ConfigModal';

const NUM_PATTERNS = 3;

function ScheduleApp() {
  const { project, undo, redo } = useProjectContext();
  const { showToast } = useUI();

  useEffect(() => {
    document.title = project.name ? `${project.name} - 時間割作成くん` : "時間割作成くん";
  }, [project.name]);

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
  const generatingRef = useRef(false);

  const handleGenerate = useCallback(() => {
    setIsGenerating(true);
    setGeneratedPatterns([]);
    setGenerateProgress({ current: 0, total: NUM_PATTERNS });
    generatingRef.current = true;

    const results = [];
    const baseSeed = Date.now();

    const generateNext = (index) => {
      if (!generatingRef.current || index >= NUM_PATTERNS) {
        // 全パターン生成完了
        const patterns = results.map(r => ({
          schedule: r.solution || r.bestPartial,
          isPartial: r.solution === null,
          filledCount: r.solution ? r.totalSlots : r.filledCount,
          totalSlots: r.totalSlots,
        })).filter(r => r.schedule !== null);

        if (patterns.length > 0) {
          setGeneratedPatterns(patterns);
          const hasPartial = patterns.some(p => p.isPartial);
          if (hasPartial) {
            showToast("一部の案は完全解が見つからなかったため、可能な範囲で埋めた部分解です。", "warning", 5000);
          }
        } else {
          showToast("パターンを生成できませんでした。条件を見直してください。", "error", 5000);
        }
        setIsGenerating(false);
        generatingRef.current = false;
        return;
      }

      setGenerateProgress({ current: index, total: NUM_PATTERNS });

      setTimeout(() => {
        const seed = baseSeed + index * 7919;
        const result = generateSinglePattern({
          project,
          activeTabId: project.activeTabId,
          seed,
        });
        results.push(result);
        setGenerateProgress({ current: index + 1, total: NUM_PATTERNS });
        generateNext(index + 1);
      }, 50);
    };

    // 少し遅延を入れてUIを更新してから開始
    setTimeout(() => generateNext(0), 50);
  }, [project, showToast]);

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

  const printStyle = `@media print { @page { size: landscape; } .no-print { display: none !important; } .print-container { max-height: none !important; border: none !important; overflow: visible !important; } }`;

  return (
    <div className="p-4 bg-gray-100 min-h-screen font-sans" onClick={() => setContextMenu(null)}>
      <style>{printStyle}</style>

      <Header />
      <TabBar />

      <div className="bg-white p-4 rounded-b-lg rounded-tr-lg shadow-md min-h-[600px]">
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

export default function App() {
  return (
    <UIProvider>
      <ProjectProvider>
        <ScheduleApp />
      </ProjectProvider>
    </UIProvider>
  );
}
