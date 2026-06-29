// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import SnapshotMenu from './SnapshotMenu';
import { ProjectContext } from '../contexts/projectContextValue';
import { UIContext } from '../contexts/uiContextValue';

afterEach(cleanup);

function renderMenu({ projectOverrides = {}, ui = {} } = {}) {
  const fns = {
    saveSnapshot: vi.fn(),
    applySnapshot: vi.fn(),
    renameSnapshot: vi.fn(),
    removeSnapshot: vi.fn(),
  };
  const projectValue = {
    project: { snapshots: [] },
    activeTab: { id: 1, name: 'メイン' },
    currentSchedule: {},
    currentConfig: {
      dates: [{ id: 1, label: '12/25(木)' }],
      periods: [{ id: 1, label: '1限' }],
      classes: [{ id: 1, label: '３S' }],
    },
    ...fns,
    ...projectOverrides,
  };
  const uiValue = {
    showInput: vi.fn().mockResolvedValue(null),
    showConfirm: vi.fn().mockResolvedValue(true),
    showToast: vi.fn(),
    ...ui,
  };
  render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <SnapshotMenu />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { fns, uiValue };
}

const snap = (id, name, tabId = 1) => ({ id, name, tabId, createdAt: '2026-06-29T00:00:00.000Z', schedule: {} });

describe('SnapshotMenu', () => {
  it('スナップショットが無ければ件数を出さない', () => {
    renderMenu();
    expect(screen.getByTitle('現在の状態を名前を付けて保存・復元')).toHaveTextContent('📌 スナップショット');
    expect(screen.queryByText(/\(\d+\)/)).not.toBeInTheDocument();
  });

  it('アクティブタブの件数を表示する (他タブは除外)', () => {
    renderMenu({
      projectOverrides: { project: { snapshots: [snap(1, 'A', 1), snap(2, 'B', 1), snap(3, 'C', 2)] } },
    });
    expect(screen.getByTitle('現在の状態を名前を付けて保存・復元')).toHaveTextContent('(2)');
  });

  it('クリックで popover が開き、空状態の案内を出す', () => {
    renderMenu();
    fireEvent.click(screen.getByTitle('現在の状態を名前を付けて保存・復元'));
    expect(screen.getByRole('dialog', { name: 'スナップショット' })).toBeInTheDocument();
    expect(screen.getByText(/保存されたスナップショットはありません/)).toBeInTheDocument();
  });

  it('アクティブタブのスナップショットのみ一覧表示する', () => {
    renderMenu({
      projectOverrides: { project: { snapshots: [snap(1, 'タブ1案', 1), snap(2, '別タブ案', 2)] } },
    });
    fireEvent.click(screen.getByTitle('現在の状態を名前を付けて保存・復元'));
    expect(screen.getByText('タブ1案')).toBeInTheDocument();
    expect(screen.queryByText('別タブ案')).not.toBeInTheDocument();
  });

  it('「現在の状態を保存」で showInput → saveSnapshot を呼ぶ', async () => {
    const { fns } = renderMenu({ ui: { showInput: vi.fn().mockResolvedValue('案A') } });
    fireEvent.click(screen.getByTitle('現在の状態を名前を付けて保存・復元'));
    fireEvent.click(screen.getByText('＋ 現在の状態を保存'));
    await waitFor(() => expect(fns.saveSnapshot).toHaveBeenCalledWith('案A'));
  });

  it('保存名が空 (キャンセル) なら saveSnapshot を呼ばない', async () => {
    const { fns } = renderMenu({ ui: { showInput: vi.fn().mockResolvedValue(null) } });
    fireEvent.click(screen.getByTitle('現在の状態を名前を付けて保存・復元'));
    fireEvent.click(screen.getByText('＋ 現在の状態を保存'));
    await Promise.resolve();
    expect(fns.saveSnapshot).not.toHaveBeenCalled();
  });

  it('「復元」で showConfirm → applySnapshot を呼ぶ', async () => {
    const { fns } = renderMenu({
      projectOverrides: { project: { snapshots: [snap(7, 'A', 1)] } },
      ui: { showConfirm: vi.fn().mockResolvedValue(true) },
    });
    fireEvent.click(screen.getByTitle('現在の状態を名前を付けて保存・復元'));
    fireEvent.click(screen.getByText('復元'));
    await waitFor(() => expect(fns.applySnapshot).toHaveBeenCalledWith(7));
  });

  it('復元を confirm でキャンセルすると applySnapshot を呼ばない', async () => {
    const { fns } = renderMenu({
      projectOverrides: { project: { snapshots: [snap(7, 'A', 1)] } },
      ui: { showConfirm: vi.fn().mockResolvedValue(false) },
    });
    fireEvent.click(screen.getByTitle('現在の状態を名前を付けて保存・復元'));
    fireEvent.click(screen.getByText('復元'));
    await Promise.resolve();
    expect(fns.applySnapshot).not.toHaveBeenCalled();
  });

  it('「🔍 差分」で現在の状態との差分パネルを表示する', () => {
    const snapWithCell = { id: 1, name: 'A', tabId: 1, createdAt: null, schedule: { 'd1-p1-c1': { subject: '英語', teacher: '堀上' } } };
    renderMenu({
      projectOverrides: {
        project: { snapshots: [snapWithCell] },
        currentSchedule: {}, // 現在は空 → スナップショットにあった割当が消えている (removed)
      },
    });
    fireEvent.click(screen.getByTitle('現在の状態を名前を付けて保存・復元'));
    fireEvent.click(screen.getByLabelText('A と現在の状態を比較'));
    expect(screen.getByText('－1')).toBeInTheDocument();
    expect(screen.getByText(/12\/25\(木\) 1限 ３S: 英語\/堀上 → （空）/)).toBeInTheDocument();
  });

  it('差分が無ければ「変更なし」', () => {
    const sameCell = { subject: '英語', teacher: '堀上' };
    renderMenu({
      projectOverrides: {
        project: { snapshots: [{ id: 1, name: 'A', tabId: 1, createdAt: null, schedule: { 'd1-p1-c1': { ...sameCell } } }] },
        currentSchedule: { 'd1-p1-c1': { ...sameCell } },
      },
    });
    fireEvent.click(screen.getByTitle('現在の状態を名前を付けて保存・復元'));
    fireEvent.click(screen.getByLabelText('A と現在の状態を比較'));
    expect(screen.getByText('変更なし')).toBeInTheDocument();
  });

  it('もう一度「🔍 差分」を押すと差分パネルを閉じる', () => {
    renderMenu({
      projectOverrides: { project: { snapshots: [{ id: 1, name: 'A', tabId: 1, createdAt: null, schedule: {} }] } },
    });
    fireEvent.click(screen.getByTitle('現在の状態を名前を付けて保存・復元'));
    const btn = screen.getByLabelText('A と現在の状態を比較');
    fireEvent.click(btn);
    expect(screen.getByText('変更なし')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText('変更なし')).not.toBeInTheDocument();
  });

  it('🗑️ で showConfirm → removeSnapshot を呼ぶ', async () => {
    const { fns } = renderMenu({
      projectOverrides: { project: { snapshots: [snap(7, 'A', 1)] } },
      ui: { showConfirm: vi.fn().mockResolvedValue(true) },
    });
    fireEvent.click(screen.getByTitle('現在の状態を名前を付けて保存・復元'));
    fireEvent.click(screen.getByLabelText('A を削除'));
    await waitFor(() => expect(fns.removeSnapshot).toHaveBeenCalledWith(7));
  });
});
