// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import TabBar from './TabBar';
import { ProjectContext } from '../contexts/projectContextValue';
import { UIContext } from '../contexts/uiContextValue';

afterEach(cleanup);

function renderTabBar({ projectOverrides = {}, uiOverrides = {} } = {}) {
  const projectValue = {
    project: {
      activeTabId: 1,
      tabs: [
        { id: 1, name: '高3' },
        { id: 2, name: '高2' },
      ],
    },
    switchTab: vi.fn(),
    handleAddTab: vi.fn(),
    handleDeleteTab: vi.fn(),
    handleRenameTab: vi.fn(),
    analysis: { tabErrorCounts: { 1: 0, 2: 0 } },
    ...projectOverrides,
  };
  const uiValue = {
    showConfirm: vi.fn().mockResolvedValue(true),
    showInput: vi.fn().mockResolvedValue('新名前'),
    ...uiOverrides,
  };
  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <TabBar />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, projectValue, uiValue };
}

describe('TabBar (D1c)', () => {
  it('errorCount = 0 のタブには ✨ badge を表示', () => {
    renderTabBar();
    // 2 タブとも 0 なので ✨ が 2 つ
    expect(screen.getAllByLabelText('違反なし')).toHaveLength(2);
  });

  it('errorCount > 0 のタブには ⚠️N badge を表示', () => {
    renderTabBar({
      projectOverrides: {
        analysis: { tabErrorCounts: { 1: 3, 2: 0 } },
      },
    });
    expect(screen.getByLabelText('違反 3 件')).toBeInTheDocument();
    expect(screen.getByText('⚠️3')).toBeInTheDocument();
    // タブ 2 は ✨ のまま
    expect(screen.getByLabelText('違反なし')).toBeInTheDocument();
  });

  it('tabErrorCounts に未登録のタブは ✨ 扱いになる', () => {
    renderTabBar({
      projectOverrides: {
        analysis: { tabErrorCounts: { 1: 2 } }, // tab 2 はキー無し
      },
    });
    expect(screen.getByLabelText('違反 2 件')).toBeInTheDocument();
    expect(screen.getByLabelText('違反なし')).toBeInTheDocument();
  });

  it('analysis が undefined でも crash しない (✨ がデフォルト)', () => {
    renderTabBar({ projectOverrides: { analysis: undefined } });
    expect(screen.getAllByLabelText('違反なし')).toHaveLength(2);
  });

  it('タブ名クリックで switchTab が呼ばれる', () => {
    const switchTab = vi.fn();
    renderTabBar({ projectOverrides: { switchTab } });
    fireEvent.click(screen.getByText('高2'));
    expect(switchTab).toHaveBeenCalledWith(2);
  });
});

describe('TabBar (E1b キーボード a11y)', () => {
  it('role="tablist" と role="tab" を持ち、アクティブタブが aria-selected', () => {
    renderTabBar();
    expect(screen.getByRole('tablist', { name: '学年タブ' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true'); // activeTabId=1
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('アクティブタブのみ tabIndex=0 (roving tabindex)', () => {
    renderTabBar();
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
  });

  it('ArrowRight で次のタブへ switchTab', () => {
    const switchTab = vi.fn();
    renderTabBar({ projectOverrides: { switchTab } });
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(switchTab).toHaveBeenCalledWith(2);
  });

  it('ArrowLeft は端で wrap して最後のタブへ', () => {
    const switchTab = vi.fn();
    renderTabBar({ projectOverrides: { switchTab } }); // activeTabId=1 (先頭)
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(switchTab).toHaveBeenCalledWith(2); // wrap → 末尾
  });

  it('End で最後、Home で最初のタブへ', () => {
    const switchTab = vi.fn();
    renderTabBar({ projectOverrides: { switchTab } });
    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(switchTab).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(switchTab).toHaveBeenLastCalledWith(1);
  });
});
