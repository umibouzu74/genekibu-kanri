// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PublishControl from './PublishControl';
import { ProjectContext } from '../contexts/projectContextValue';
import { UIContext } from '../contexts/uiContextValue';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const project = (over = {}) => ({
  name: '2026 冬期講習',
  updatedAt: '2026-10-20T00:00:00.000Z',
  dates: [{ id: 1, label: '12/25(金)' }],
  periods: [{ id: 1, label: '1限 (13:00~14:20)' }],
  tabs: [{ id: 1, name: '中3', config: { classes: [], subjectCounts: {} }, schedule: {} }],
  ...over,
});

function renderControl(projectOver = {}, ui = {}) {
  const setPublishState = vi.fn();
  const uiValue = { showToast: vi.fn(), showConfirm: vi.fn().mockResolvedValue(true), ...ui };
  render(
    <ProjectContext.Provider value={{ project: project(projectOver), setPublishState }}>
      <UIContext.Provider value={uiValue}>
        <PublishControl />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { setPublishState, uiValue };
}

describe('PublishControl (月間の予定: 作成中 / 仮確定 / 確定)', () => {
  it('今の状態が選ばれていて、説明が出る (未設定は確定)', () => {
    renderControl();
    expect(screen.getByRole('radio', { name: /^確定\(本体の月間の予定に出します\)$/ })).toBeChecked();
    expect(screen.getByText('本体の月間の予定に出します')).toBeInTheDocument();
  });

  it('選ぶと setPublishState を呼んで知らせる', () => {
    const { setPublishState, uiValue } = renderControl({ publishState: 'draft' });
    fireEvent.click(screen.getByRole('radio', { name: /^仮確定/ }));
    expect(setPublishState).toHaveBeenCalledWith('tentative');
    expect(uiValue.showToast).toHaveBeenCalled();
  });

  it('済んだ日がある時間割を作成中に戻すときは確かめる (授業時間の集計からも消える)', async () => {
    const showConfirm = vi.fn().mockResolvedValue(false);
    const { setPublishState } = renderControl(
      { publishState: 'final', updatedAt: '2025-12-20T00:00:00.000Z', dates: [{ id: 1, label: '12/25(木)' }] },
      { showConfirm },
    );
    fireEvent.click(screen.getByRole('radio', { name: /^作成中/ }));
    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(setPublishState).not.toHaveBeenCalled();
  });
});
