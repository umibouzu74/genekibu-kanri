// @vitest-environment jsdom
// F2a: ContextMenu のキーボード対応 (Escape / 矢印ナビ / 初期フォーカス) を固定する。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContextMenu from './ContextMenu';
import { ProjectContext } from '../contexts/projectContextValue';
import { UIContext } from '../contexts/uiContextValue';

afterEach(cleanup);

function renderMenu({ contextMenu = { x: 10, y: 10, dateId: 1, periodId: 1, classId: 1, type: null, val: null }, projectOverrides = {}, ui = {} } = {}) {
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
    applyToAllDates: vi.fn(),
    copyDateColumn: vi.fn(),
    ...projectOverrides,
  };
  const uiValue = {
    showInput: vi.fn().mockResolvedValue(null),
    showToast: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
    ...ui,
  };
  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <ContextMenu contextMenu={contextMenu} clipboard={null} onClose={onClose} />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, onClose, projectValue, uiValue };
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

  it('↑↓ で項目間をフォーカス移動する (端は wrap、disabled はスキップ)', () => {
    // clipboard=null なので「貼り付け」は disabled → 矢印ナビの対象外 (K3h)
    renderMenu();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('ロック切替');
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(document.activeElement).toHaveTextContent('コピー');
    fireEvent.keyDown(window, { key: 'ArrowUp' }); // 先頭から wrap して末尾へ
    expect(document.activeElement).toHaveTextContent('クリア');
  });

  it('clipboard が空のとき貼り付けは disabled (K3h)', () => {
    renderMenu();
    expect(screen.getByText('📋 貼り付け').closest('button')).toBeDisabled();
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

describe('ContextMenu — 全日に適用 / 日付列コピー (L2c)', () => {
  const TWO_DATES_CONFIG = {
    dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
    periods: [{ id: 1, label: '1限' }],
    classes: [{ id: 1, label: '３S' }],
  };

  it('科目入りセルのメニューに「全日に適用」が出て、confirm 承認で applyToAllDates を呼ぶ', async () => {
    const { projectValue, uiValue } = renderMenu({
      projectOverrides: {
        currentConfig: TWO_DATES_CONFIG,
        currentSchedule: { 'd1-p1-c1': { subject: '英語', teacher: '堀上' } },
      },
    });
    fireEvent.click(screen.getByText('📅 この割当を全日に適用'));
    await waitFor(() => expect(projectValue.applyToAllDates).toHaveBeenCalledWith(1, 1, 1));
    expect(uiValue.showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('英語 / 堀上'),
      expect.objectContaining({ title: '全日に適用' }),
    );
  });

  it('空セル・日付 1 つのみでは「全日に適用」を出さない', () => {
    renderMenu(); // fixture default: dates 0 件・空セル
    expect(screen.queryByText('📅 この割当を全日に適用')).toBeNull();
  });

  it('confirm キャンセルで applyToAllDates を呼ばない', async () => {
    const { projectValue, uiValue } = renderMenu({
      projectOverrides: {
        currentConfig: TWO_DATES_CONFIG,
        currentSchedule: { 'd1-p1-c1': { subject: '英語', teacher: '' } },
      },
      ui: { showConfirm: vi.fn().mockResolvedValue(false) },
    });
    fireEvent.click(screen.getByText('📅 この割当を全日に適用'));
    await waitFor(() => expect(uiValue.showConfirm).toHaveBeenCalled());
    expect(projectValue.applyToAllDates).not.toHaveBeenCalled();
  });

  it('日付ヘッダメニューに他の日への複製導線が出て、confirm 承認で copyDateColumn を呼ぶ', async () => {
    const { projectValue } = renderMenu({
      contextMenu: { x: 10, y: 10, dateId: null, periodId: null, classId: null, type: 'date', val: '12/25' },
      projectOverrides: { currentConfig: TWO_DATES_CONFIG },
    });
    expect(screen.getByText('⧉ この日の割当をコピー →')).toBeInTheDocument();
    // 自分自身 (12/25) は複製先に出ない
    expect(screen.queryByRole('button', { name: '12/25' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '12/26' }));
    await waitFor(() => expect(projectValue.copyDateColumn).toHaveBeenCalledWith(1, 2));
  });

  it('period ヘッダメニューには複製導線を出さない', () => {
    renderMenu({
      contextMenu: { x: 10, y: 10, dateId: null, periodId: null, classId: null, type: 'period', val: '1限' },
      projectOverrides: { currentConfig: TWO_DATES_CONFIG },
    });
    expect(screen.queryByText('⧉ この日の割当をコピー →')).toBeNull();
  });
});
