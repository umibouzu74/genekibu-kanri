// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, fireEvent } from '@testing-library/react';
import { useLongPress } from './useLongPress';

function Target({ onLongPress, options }) {
  const handlers = useLongPress(onLongPress, options);
  return <div data-testid="t" {...handlers}>cell</div>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); cleanup(); });

function touch(x, y) {
  return { touches: [{ clientX: x, clientY: y, pageX: x, pageY: y }] };
}

describe('useLongPress', () => {
  it('delay 経過で callback を発火位置付きで呼ぶ', () => {
    const cb = vi.fn();
    const { getByTestId } = render(<Target onLongPress={cb} />);
    const el = getByTestId('t');
    fireEvent.touchStart(el, touch(10, 20));
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    // ContextMenu が position:fixed のため client 座標 (viewport 基準) を渡す
    expect(cb).toHaveBeenCalledWith({ clientX: 10, clientY: 20 });
  });

  it('delay 前に touchEnd するとキャンセル', () => {
    const cb = vi.fn();
    const { getByTestId } = render(<Target onLongPress={cb} />);
    const el = getByTestId('t');
    fireEvent.touchStart(el, touch(10, 20));
    vi.advanceTimersByTime(300);
    fireEvent.touchEnd(el);
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
  });

  it('閾値以上の移動 (スクロール) でキャンセル', () => {
    const cb = vi.fn();
    const { getByTestId } = render(<Target onLongPress={cb} />);
    const el = getByTestId('t');
    fireEvent.touchStart(el, touch(10, 20));
    fireEvent.touchMove(el, touch(10, 40)); // 20px 移動 > 10px 閾値
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
  });

  it('閾値内の微動では発火する', () => {
    const cb = vi.fn();
    const { getByTestId } = render(<Target onLongPress={cb} />);
    const el = getByTestId('t');
    fireEvent.touchStart(el, touch(10, 20));
    fireEvent.touchMove(el, touch(13, 22)); // 3px,2px < 10px
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('マルチタッチ (ピンチ) は無視する', () => {
    const cb = vi.fn();
    const { getByTestId } = render(<Target onLongPress={cb} />);
    const el = getByTestId('t');
    fireEvent.touchStart(el, { touches: [{ clientX: 1, clientY: 1 }, { clientX: 9, clientY: 9 }] });
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
  });

  it('delay をオプションで変更できる', () => {
    const cb = vi.fn();
    const { getByTestId } = render(<Target onLongPress={cb} options={{ delay: 1000 }} />);
    const el = getByTestId('t');
    fireEvent.touchStart(el, touch(5, 5));
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
