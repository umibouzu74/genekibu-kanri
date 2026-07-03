// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import TabBar from './TabBar';
import { ProjectContext } from '../contexts/projectContextValue';
import { UIContext } from '../contexts/uiContextValue';

afterEach(cleanup);

function renderTabBar({ projectOverrides = {}, uiOverrides = {} } = {}) {
  const projectValue = {
    project: {
      activeTabId: 1,
      // L1b: セル容量 0 のタブは「空」badge になるため、デフォルト fixture は
      // 日・時限・クラスを 1 件ずつ持つ非空タブにしておく
      dates: [{ id: 1, label: '12/25' }],
      periods: [{ id: 1, label: '1限' }],
      tabs: [
        { id: 1, name: '高3', config: { classes: [{ id: 1, label: 'A' }] } },
        { id: 2, name: '高2', config: { classes: [{ id: 1, label: 'A' }] } },
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
    showToast: vi.fn(),
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

describe('TabBar — キーボード操作 (F2a)', () => {
  it('F2 でアクティブタブの改名フローが開く', async () => {
    const { projectValue, uiValue } = renderTabBar();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'F2' });
    // showInput が resolve するのを待つ
    await Promise.resolve();
    await Promise.resolve();
    expect(uiValue.showInput).toHaveBeenCalled();
    expect(projectValue.handleRenameTab).toHaveBeenCalledWith(1, '新名前');
  });

  it('Delete でアクティブタブの削除フロー (確認あり) が走る', async () => {
    const { projectValue, uiValue } = renderTabBar();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Delete' });
    await Promise.resolve();
    await Promise.resolve();
    expect(uiValue.showConfirm).toHaveBeenCalled();
    expect(projectValue.handleDeleteTab).toHaveBeenCalledWith(1);
  });

  it('タブが 1 つしか無ければ Delete は無視される', async () => {
    const { projectValue } = renderTabBar({
      projectOverrides: {
        project: { activeTabId: 1, tabs: [{ id: 1, name: '高3' }] },
        analysis: { tabErrorCounts: {} },
      },
    });
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Delete' });
    await Promise.resolve();
    expect(projectValue.handleDeleteTab).not.toHaveBeenCalled();
  });

  it('削除 × は aria-label 付きの button になっている', () => {
    renderTabBar();
    expect(screen.getByLabelText('高3 タブを削除')).toBeInstanceOf(HTMLButtonElement);
  });
});

describe('TabBar — 空タブ badge (L1b)', () => {
  it('使う日が 0 件のタブは ✨ ではなく「空」badge を表示', () => {
    renderTabBar({
      projectOverrides: {
        project: {
          activeTabId: 1,
          dates: [{ id: 1, label: '12/25' }],
          periods: [{ id: 1, label: '1限' }],
          tabs: [
            { id: 1, name: '高3', config: { classes: [{ id: 1, label: 'A' }] } },
            { id: 2, name: '高2', config: { classes: [{ id: 1, label: 'A' }], activeDateIds: [] } },
          ],
        },
      },
    });
    expect(screen.getByLabelText('時間割マスなし')).toHaveTextContent('空');
    expect(screen.getAllByLabelText('違反なし')).toHaveLength(1);
  });

  it('クラスが 0 件のタブも「空」badge を表示', () => {
    renderTabBar({
      projectOverrides: {
        project: {
          activeTabId: 1,
          dates: [{ id: 1, label: '12/25' }],
          periods: [{ id: 1, label: '1限' }],
          tabs: [
            { id: 1, name: '高3', config: { classes: [{ id: 1, label: 'A' }] } },
            { id: 2, name: '高2', config: { classes: [] } },
          ],
        },
      },
    });
    expect(screen.getByLabelText('時間割マスなし')).toBeInTheDocument();
  });

  it('違反のあるタブは空判定より ⚠️ を優先する', () => {
    renderTabBar({
      projectOverrides: {
        project: {
          activeTabId: 1,
          dates: [{ id: 1, label: '12/25' }],
          periods: [{ id: 1, label: '1限' }],
          tabs: [
            { id: 1, name: '高3', config: { classes: [{ id: 1, label: 'A' }] } },
            { id: 2, name: '高2', config: { classes: [], activeDateIds: [] } },
          ],
        },
        analysis: { tabErrorCounts: { 2: 1 } },
      },
    });
    expect(screen.getByLabelText('違反 1 件')).toBeInTheDocument();
    expect(screen.queryByLabelText('時間割マスなし')).toBeNull();
  });
});

describe('TabBar — タブ間複製 (K4a)', () => {
  it('非アクティブタブの ⧉ で confirm 後に copyScheduleFromTab が呼ばれる', async () => {
    const copyScheduleFromTab = vi.fn();
    renderTabBar({ projectOverrides: { copyScheduleFromTab } });
    // アクティブタブ (高3) には複製ボタンは出ない
    expect(screen.queryByLabelText('高3 タブの割当を現在のタブへ複製')).toBeNull();
    fireEvent.click(screen.getByLabelText('高2 タブの割当を現在のタブへ複製'));
    await waitFor(() => expect(copyScheduleFromTab).toHaveBeenCalledWith(2));
  });

  it('confirm をキャンセルすると複製しない', async () => {
    const copyScheduleFromTab = vi.fn();
    const showConfirm = vi.fn().mockResolvedValue(false);
    renderTabBar({
      projectOverrides: { copyScheduleFromTab },
      uiOverrides: { showConfirm },
    });
    fireEvent.click(screen.getByLabelText('高2 タブの割当を現在のタブへ複製'));
    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(copyScheduleFromTab).not.toHaveBeenCalled();
  });
});

describe('TabBar — タブの並べ替え (N2d)', () => {
  it('Ctrl+ArrowRight でアクティブタブを右へ移動する', () => {
    const reorderTabs = vi.fn();
    renderTabBar({ projectOverrides: { reorderTabs } });
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight', ctrlKey: true });
    expect(reorderTabs).toHaveBeenCalledWith(0, 1);
  });

  it('端では Ctrl+ArrowLeft は no-op (先頭タブ)', () => {
    const reorderTabs = vi.fn();
    renderTabBar({ projectOverrides: { reorderTabs } });
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft', ctrlKey: true });
    expect(reorderTabs).not.toHaveBeenCalled();
  });

  it('Ctrl なしの ArrowRight は従来どおりタブ切替 (並べ替えない)', () => {
    const reorderTabs = vi.fn();
    const switchTab = vi.fn();
    renderTabBar({ projectOverrides: { reorderTabs, switchTab } });
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(reorderTabs).not.toHaveBeenCalled();
    expect(switchTab).toHaveBeenCalledWith(2);
  });

  it('タブへの drop で reorderTabs が呼ばれる', () => {
    const reorderTabs = vi.fn();
    renderTabBar({ projectOverrides: { reorderTabs } });
    const [tab1, tab2] = screen.getAllByRole('tab');
    const dataTransfer = {
      data: {},
      setData(type, v) { this.data[type] = v; },
      getData(type) { return this.data[type] ?? ''; },
      get types() { return Object.keys(this.data); },
      effectAllowed: '',
    };
    fireEvent.dragStart(tab1, { dataTransfer });
    fireEvent.dragOver(tab2, { dataTransfer });
    fireEvent.drop(tab2, { dataTransfer });
    expect(reorderTabs).toHaveBeenCalledWith(0, 1);
  });
});

describe('TabBar — タブ削除 confirm の割当件数 (N2e)', () => {
  it('割当のあるタブの削除 confirm には件数を出す (空 entry は数えない)', async () => {
    const { uiValue } = renderTabBar({
      projectOverrides: {
        project: {
          activeTabId: 1,
          dates: [{ id: 1, label: '12/25' }],
          periods: [{ id: 1, label: '1限' }],
          tabs: [
            {
              id: 1, name: '高3', config: { classes: [{ id: 1, label: 'A' }] },
              schedule: {
                '1-1-1': { subject: '英語', teacher: '堀上' },
                '1-1-2': { subject: '数学', teacher: '' },
                '1-1-3': {},                              // 空 entry は数えない
              },
            },
            { id: 2, name: '高2', config: { classes: [{ id: 1, label: 'A' }] } },
          ],
        },
      },
    });
    fireEvent.click(screen.getByLabelText('高3 タブを削除'));
    await waitFor(() => expect(uiValue.showConfirm).toHaveBeenCalled());
    expect(uiValue.showConfirm.mock.calls[0][0]).toContain('2 コマの割当');
  });

  it('割当のないタブは従来の汎用文言のまま', async () => {
    const { uiValue } = renderTabBar();
    fireEvent.click(screen.getByLabelText('高3 タブを削除'));
    await waitFor(() => expect(uiValue.showConfirm).toHaveBeenCalled());
    expect(uiValue.showConfirm.mock.calls[0][0]).toBe('このタブを削除しますか？');
  });
});
