// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FrameSettings from './FrameSettings';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';

afterEach(cleanup);

const tab = (id, name, config = {}) => ({ id, name, config: { classes: [], subjectCounts: {}, ...config }, schedule: {} });

function renderFrames(projectOver = {}, ui = {}) {
  const project = {
    name: '2026 冬期講習',
    dates: [{ id: 1, label: '12/25(金)' }, { id: 2, label: '1/12(火)' }],
    periods: [{ id: 1, label: '1限 (13:00~14:20)' }, { id: 2, label: '1限 (18:00~19:20)' }],
    tabs: [tab(1, '中３', { activeDateIds: [1] }), tab(2, '中３直前 火木', { activeDateIds: [2] })],
    ...projectOver,
  };
  const actions = {
    addFrame: vi.fn(),
    renameFrame: vi.fn(),
    removeFrame: vi.fn(),
    setTabFrame: vi.fn(),
    setFramePeriods: vi.fn(),
    setFramePublishState: vi.fn(),
  };
  const uiValue = { showToast: vi.fn(), showConfirm: vi.fn().mockResolvedValue(true), ...ui };
  render(
    <ProjectContext.Provider value={{ project, activeTab: project.tabs.find(t => t.id === (project.activeTabId ?? 1)), ...actions }}>
      <UIContext.Provider value={uiValue}>
        <FrameSettings />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...actions, uiValue };
}

describe('FrameSettings (季節の中の枠)', () => {
  it('枠を作る: 名前と入れるタブ (既定は開いているタブ)', () => {
    const { addFrame } = renderFrames();
    fireEvent.click(screen.getByRole('button', { name: '＋ 枠を作る' }));
    fireEvent.change(screen.getByPlaceholderText('例: 直前ポイント演習'), { target: { value: '冬期講習' } });
    expect(screen.getByRole('checkbox', { name: '中３' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '作る' }));
    expect(addFrame).toHaveBeenCalledWith('冬期講習', [1]);
  });

  it('枠の一覧: 期間・タブ・時限・月間の予定。開いているタブの枠を選べる', () => {
    const { setTabFrame, setFramePublishState, setFramePeriods } = renderFrames({
      frames: [{ id: 5, name: '直前ポイント演習', periodIds: [2], publishState: 'draft' }],
      tabs: [tab(1, '中３', { activeDateIds: [1] }), tab(2, '中３直前 火木', { activeDateIds: [2], frameId: 5, activePeriodIds: [2] })],
    });
    expect(screen.getByText('1/12(火)')).toBeInTheDocument();
    expect(screen.getByText(/タブ: 中３直前 火木/)).toBeInTheDocument();
    expect(screen.getByText(/枠に入っていないタブ: 中３/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('「中３」の枠:'), { target: { value: '5' } });
    expect(setTabFrame).toHaveBeenCalledWith(1, 5);
    fireEvent.change(screen.getByLabelText('枠「直前ポイント演習」の月間の予定'), { target: { value: 'final' } });
    expect(setFramePublishState).toHaveBeenCalledWith(5, 'final');
    const textarea = screen.getByDisplayValue('1限 (18:00~19:20)');
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: '1限 (18:00~19:20), 2限 (19:30~20:50)' } });
    fireEvent.blur(textarea);
    expect(setFramePeriods).toHaveBeenCalledWith(5, '1限 (18:00~19:20), 2限 (19:30~20:50)');
  });

  it('枠を消すときは確かめる', async () => {
    const showConfirm = vi.fn().mockResolvedValue(true);
    const { removeFrame } = renderFrames({ frames: [{ id: 5, name: '冬期講習', periodIds: [1] }] }, { showConfirm });
    fireEvent.click(screen.getByRole('button', { name: '枠「冬期講習」を消す' }));
    await waitFor(() => expect(removeFrame).toHaveBeenCalledWith(5));
    expect(showConfirm.mock.calls[0][0]).toContain('タブ・時限・コマは消えません');
  });
});
