// @vitest-environment jsdom
// F2l: dismissable-popover 共有フックの開閉仕様を固定する。
// Header / Toolbar / SnapshotMenu の popover が依存する。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useDismissablePopover } from './useDismissablePopover';

afterEach(cleanup);

function Demo() {
  const { open, setOpen, ref } = useDismissablePopover();
  return (
    <div>
      <div ref={ref} data-testid="root">
        <button onClick={() => setOpen(!open)}>トグル</button>
        {open && <div data-testid="popover">中身</div>}
      </div>
      <button data-testid="outside">外</button>
    </div>
  );
}

const openPopover = () => {
  fireEvent.click(screen.getByText('トグル'));
  expect(screen.getByTestId('popover')).toBeInTheDocument();
};

describe('useDismissablePopover (F2l)', () => {
  it('setOpen で開閉できる', () => {
    render(<Demo />);
    expect(screen.queryByTestId('popover')).toBeNull();
    openPopover();
    fireEvent.click(screen.getByText('トグル'));
    expect(screen.queryByTestId('popover')).toBeNull();
  });

  it('外側の mousedown で閉じる', () => {
    render(<Demo />);
    openPopover();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('popover')).toBeNull();
  });

  it('ref 内側の mousedown では閉じない', () => {
    render(<Demo />);
    openPopover();
    fireEvent.mouseDown(screen.getByTestId('popover'));
    expect(screen.getByTestId('popover')).toBeInTheDocument();
  });

  it('Escape で閉じる', () => {
    render(<Demo />);
    openPopover();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('popover')).toBeNull();
  });

  it('IME 変換中 (isComposing) の Escape では閉じない', () => {
    render(<Demo />);
    openPopover();
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true });
    expect(screen.getByTestId('popover')).toBeInTheDocument();
  });

  it('閉じている間は window リスナーを張らない (外側 mousedown が無害)', () => {
    render(<Demo />);
    fireEvent.mouseDown(screen.getByTestId('outside'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('popover')).toBeNull();
    openPopover(); // その後も普通に開ける
  });
});
