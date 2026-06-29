// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';

afterEach(cleanup);

function TrapDialog({ onClose, enabled = true }) {
  const ref = useRef(null);
  useFocusTrap(ref, { onClose, enabled });
  return (
    <div ref={ref} role="dialog">
      <button>first</button>
      <button>middle</button>
      <button>last</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('マウント時に最初の focusable へフォーカスする', () => {
    const { getByText } = render(<TrapDialog onClose={vi.fn()} />);
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('Escape で onClose を呼ぶ', () => {
    const onClose = vi.fn();
    render(<TrapDialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('最後の要素で Tab → 最初へループ', () => {
    const { getByText } = render(<TrapDialog onClose={vi.fn()} />);
    getByText('last').focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('最初の要素で Shift+Tab → 最後へループ', () => {
    const { getByText } = render(<TrapDialog onClose={vi.fn()} />);
    getByText('first').focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByText('last'));
  });

  it('enabled=false なら Escape を無視する (no-op)', () => {
    const onClose = vi.fn();
    render(<TrapDialog onClose={onClose} enabled={false} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('入れ子では最上位 (後から開いた) trap のみが Escape に応答する', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const { rerender } = render(<TrapDialog onClose={outer} />);
    rerender(
      <>
        <TrapDialog onClose={outer} />
        <TrapDialog onClose={inner} />
      </>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});
