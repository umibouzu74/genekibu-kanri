// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import Toolbar from './Toolbar';
import { ProjectContext } from '../contexts/projectContextValue';
import { UIContext } from '../contexts/uiContextValue';
import { makeKey } from '../utils/scheduleKey';

afterEach(cleanup);

// 必要な context value を mock してから Toolbar を render する。
// useProjectContext / useUI が呼ばれるが Provider 経由で値を与えるだけ。
function renderToolbar({ projectOverrides = {}, uiOverrides = {}, props = {} } = {}) {
  const projectValue = {
    analysis: { errorKeys: [], conflictMap: {}, subjectOrders: {}, dailySubjectMap: {}, teacherDailyCounts: {} },
    dashboard: { progress: 0, filled: 0, total: 100 },
    historyIndex: 0,
    history: [{}],
    undo: vi.fn(),
    redo: vi.fn(),
    handleClearUnlocked: vi.fn(),
    ...projectOverrides,
  };
  const uiValue = {
    showConfirm: vi.fn().mockResolvedValue(true),
    showToast: vi.fn(),
    ...uiOverrides,
  };
  const defaultProps = {
    isCompact: false,
    setIsCompact: vi.fn(),
    showSummary: false,
    setShowSummary: vi.fn(),
    setShowConfig: vi.fn(),
    isGenerating: false,
    generateProgress: null,
    onGenerate: vi.fn(),
    ...props,
  };

  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <Toolbar {...defaultProps} />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, projectValue, uiValue, props: defaultProps };
}

describe('Toolbar', () => {
  it('errorKeys が空のときは ✨ OK を表示', () => {
    renderToolbar();
    expect(screen.getByText(/✨ OK/)).toBeInTheDocument();
  });

  it('errorKeys がある時は ⚠️N件 ボタンを表示する', () => {
    renderToolbar({
      projectOverrides: {
        analysis: { errorKeys: ['k1', 'k2', 'k3'], conflictMap: {}, subjectOrders: {}, dailySubjectMap: {}, teacherDailyCounts: {} },
      },
    });
    expect(screen.getByText(/⚠️ 3件/)).toBeInTheDocument();
  });

  it('⚠️N件 クリックで最初のエラーセルへ scrollIntoView する', () => {
    const errorKey = makeKey(1, 2, 3);
    // jsdom は scrollIntoView 未実装なので prototype に mock を生やす
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    // 対象 cell DOM 要素を事前に挿入しておく (Toolbar の scrollToFirstError が
    // getElementById でターゲットを探す)
    const target = document.createElement('div');
    target.id = `select-1-2-3-cell`;
    document.body.appendChild(target);

    renderToolbar({
      projectOverrides: {
        analysis: { errorKeys: [errorKey], conflictMap: {}, subjectOrders: {}, dailySubjectMap: {}, teacherDailyCounts: {} },
      },
    });
    fireEvent.click(screen.getByText(/⚠️ 1件/));
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });

    document.body.removeChild(target);
  });

  it('progress を 0-100% で表示する', () => {
    renderToolbar({
      projectOverrides: {
        dashboard: { progress: 73, filled: 7, total: 10 },
        analysis: { errorKeys: [], conflictMap: {}, subjectOrders: {}, dailySubjectMap: {}, teacherDailyCounts: {} },
      },
    });
    expect(screen.getByText('73%')).toBeInTheDocument();
  });

  it('historyIndex が 0 のとき undo は disabled', () => {
    renderToolbar({ projectOverrides: { historyIndex: 0, history: [{}] } });
    const undoBtn = screen.getByTitle('元に戻す (Undo)');
    expect(undoBtn).toBeDisabled();
  });

  it('history の末尾なら redo は disabled', () => {
    renderToolbar({ projectOverrides: { historyIndex: 0, history: [{}] } });
    const redoBtn = screen.getByTitle('やり直す (Redo)');
    expect(redoBtn).toBeDisabled();
  });

  it('生成クリアボタン: confirm に OK で handleClearUnlocked を呼ぶ', async () => {
    const handleClearUnlocked = vi.fn();
    const showConfirm = vi.fn().mockResolvedValue(true);
    renderToolbar({
      projectOverrides: { handleClearUnlocked },
      uiOverrides: { showConfirm },
    });
    fireEvent.click(screen.getByTitle(/ロックされていないセルを全てクリア/));
    // showConfirm は Promise なので microtask を待つ
    await vi.waitFor(() => expect(showConfirm).toHaveBeenCalled());
    await vi.waitFor(() => expect(handleClearUnlocked).toHaveBeenCalled());
  });

  it('生成クリアボタン: confirm をキャンセルすると handleClearUnlocked を呼ばない', async () => {
    const handleClearUnlocked = vi.fn();
    const showConfirm = vi.fn().mockResolvedValue(false);
    renderToolbar({
      projectOverrides: { handleClearUnlocked },
      uiOverrides: { showConfirm },
    });
    fireEvent.click(screen.getByTitle(/ロックされていないセルを全てクリア/));
    await vi.waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(handleClearUnlocked).not.toHaveBeenCalled();
  });

  it('isGenerating=true のとき生成ボタンは disabled + 進捗表示', () => {
    renderToolbar({ props: { isGenerating: true, generateProgress: { current: 1, total: 3 } } });
    const genBtn = screen.getByText(/生成中 \(1\/3\)/).closest('button');
    expect(genBtn).toBeDisabled();
  });
});
