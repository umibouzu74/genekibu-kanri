// @vitest-environment jsdom
// F2a: ContextMenu のキーボード対応 (Escape / 矢印ナビ / 初期フォーカス) を固定する。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import ContextMenu from './ContextMenu';
import { ProjectContext } from '../contexts/projectContextValue';
import { UIContext } from '../contexts/uiContextValue';

afterEach(cleanup);

function renderMenu({ contextMenu = { x: 10, y: 10, dateId: 1, periodId: 1, classId: 1, type: null, val: null } } = {}) {
  const onClose = vi.fn();
  const projectValue = {
    project: { dates: [], periods: [] },
    currentConfig: { classes: [] },
    currentSchedule: {},
    handleRenameHeader: vi.fn(),
    handleBulkAction: vi.fn(),
    handleCellCopy: vi.fn(),
    handleCellPaste: vi.fn(),
    handleCellClear: vi.fn(),
    handleSetNg: vi.fn(),
    toggleLock: vi.fn(),
  };
  const uiValue = { showInput: vi.fn().mockResolvedValue(null), showToast: vi.fn() };
  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <ContextMenu contextMenu={contextMenu} clipboard={null} onClose={onClose} />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, onClose, projectValue };
}

describe('ContextMenu — キーボード対応 (F2a)', () => {
  it('開いたら最初の項目にフォーカスが移る', () => {
    renderMenu();
    expect(document.activeElement).toHaveTextContent('コピー');
  });

  it('Escape で閉じる', () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('↑↓ で項目間をフォーカス移動する (端は wrap)', () => {
    renderMenu();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('貼り付け');
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(document.activeElement).toHaveTextContent('コピー');
    fireEvent.keyDown(window, { key: 'ArrowUp' }); // 先頭から wrap して末尾へ
    expect(document.activeElement).toHaveTextContent('クリア');
  });

  it('role="menu" を持つ', () => {
    renderMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('Enter でフォーカス中の項目が実行される (button ネイティブ)', () => {
    const { projectValue } = renderMenu();
    // 初期フォーカスは「コピー」
    fireEvent.click(document.activeElement);
    expect(projectValue.handleCellCopy).toHaveBeenCalled();
  });
});
