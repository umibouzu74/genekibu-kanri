// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import BatchPrintDialog from './BatchPrintDialog';
import { ProjectContext } from '../contexts/projectContextValue';

afterEach(cleanup);

const project = {
  tabs: [{ id: 1, name: '中3' }, { id: 2, name: '中1・2' }, { id: 3, name: '直前' }],
  subjects: ['英語', '数学', '国語'],
};

function renderDialog(props = {}) {
  const onStart = vi.fn();
  const onClose = vi.fn();
  const onAbort = vi.fn();
  render(
    <ProjectContext.Provider value={{ project }}>
      <BatchPrintDialog onStart={onStart} onClose={onClose} onAbort={onAbort} progress={null} {...props} />
    </ProjectContext.Provider>,
  );
  return { onStart, onClose, onAbort };
}

const group = (name) => screen.getByRole('group', { name: new RegExp(`^${name}`) });
const pairs = (items) => items.map(it => `${it.tabId}:${it.highlight ? it.highlight.value : '-'}`);

describe('BatchPrintDialog (L2h)', () => {
  it('既定は全タブ × 全教科・強調なしは外す・教科ごと。枚数の目安を出す', () => {
    const { onStart } = renderDialog();
    const tabs = within(group('タブ')).getAllByRole('checkbox');
    expect(tabs.map(c => c.checked)).toEqual([true, true, true]);
    expect(within(group('強調')).getByRole('checkbox', { name: '強調なし' }).checked).toBe(false);
    expect(within(group('強調')).getByRole('checkbox', { name: '国語' }).checked).toBe(true);
    expect(screen.getByRole('radio', { name: /教科ごと/ }).checked).toBe(true);
    expect(screen.getByText(/3 タブ × 3 強調 = 9 枚/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '🖨️ 9 枚を印刷' }));
    expect(pairs(onStart.mock.calls[0][0])).toEqual([
      '1:英語', '2:英語', '3:英語', '1:数学', '2:数学', '3:数学', '1:国語', '2:国語', '3:国語',
    ]);
  });

  it('タブ・教科を絞り、強調なしを足し、タブごとに並べられる', () => {
    const { onStart } = renderDialog();
    fireEvent.click(within(group('タブ')).getByRole('checkbox', { name: '直前' }));
    fireEvent.click(within(group('強調')).getByRole('checkbox', { name: '数学' }));
    fireEvent.click(within(group('強調')).getByRole('checkbox', { name: '英語' }));
    fireEvent.click(within(group('強調')).getByRole('checkbox', { name: '強調なし' }));
    fireEvent.click(screen.getByRole('radio', { name: /タブごと/ }));
    expect(screen.getByText(/2 タブ × 2 強調 = 4 枚/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '🖨️ 4 枚を印刷' }));
    expect(pairs(onStart.mock.calls[0][0])).toEqual(['1:国語', '1:-', '2:国語', '2:-']);
  });

  it('0 枚なら印刷できない (「外す」で全部外す)', () => {
    renderDialog();
    fireEvent.click(within(group('タブ')).getByRole('button', { name: '外す' }));
    expect(screen.getByText(/0 タブ × 3 強調 = 0 枚/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '🖨️ 0 枚を印刷' }).disabled).toBe(true);
    fireEvent.click(within(group('タブ')).getByRole('button', { name: '全部' }));
    expect(screen.getByRole('button', { name: '🖨️ 9 枚を印刷' }).disabled).toBe(false);
  });

  it('準備中は進捗と中断を出し、選択は変えられない。Esc は中断', () => {
    const { onAbort, onClose } = renderDialog({ progress: { current: 3, total: 9, name: '中3 × 国語' } });
    expect(screen.getByRole('progressbar', { name: 'まとめて印刷の準備' }).getAttribute('aria-valuenow')).toBe('3');
    expect(screen.getByRole('status').textContent).toBe('準備中 3 / 9 — 中3 × 国語');
    expect(within(group('タブ')).getAllByRole('checkbox')[0]).toBeDisabled();
    expect(screen.getByRole('radio', { name: /タブごと/ })).toBeDisabled();
    expect(within(group('タブ')).getByRole('button', { name: '外す' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /枚を印刷/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '✕ 中断' }));
    expect(onAbort).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onAbort).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('紙面に載らない (no-print)', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'まとめて印刷' }).parentElement.className).toContain('no-print');
  });
});
