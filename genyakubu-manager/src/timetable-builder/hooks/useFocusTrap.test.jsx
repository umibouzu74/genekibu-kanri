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

  it('onClose の identity が変わっても trap は再初期化されずフォーカスを奪わない', () => {
    const { getByText, rerender } = render(<TrapDialog onClose={vi.fn()} />);
    // ユーザが dialog 内の別要素で作業中…
    getByText('middle').focus();
    // 親の再レンダーでインライン onClose の identity が変わる
    rerender(<TrapDialog onClose={vi.fn()} />);
    // 再初期化されると first へ focus() が走ってしまう (焦点強奪の回帰)
    expect(document.activeElement).toBe(getByText('middle'));
  });

  it('onClose の identity が変わった後も最新の onClose が呼ばれる', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<TrapDialog onClose={first} />);
    rerender(<TrapDialog onClose={second} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
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

  // ─── trapStack の解除側 (F.5 テストの穴 2) ───

  it('入れ子の内側を閉じた後は外側 trap が Escape に再応答する', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const { rerender } = render(
      <>
        <TrapDialog onClose={outer} />
        <TrapDialog onClose={inner} />
      </>,
    );
    // 内側 dialog を unmount (= 閉じる) → trapStack から pop される
    rerender(<TrapDialog onClose={outer} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(inner).not.toHaveBeenCalled();
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('cleanup 時に trap を開く前のフォーカス位置へ復帰する', () => {
    const { getByText, rerender } = render(
      <>
        <button>opener</button>
      </>,
    );
    getByText('opener').focus();
    rerender(
      <>
        <button>opener</button>
        <TrapDialog onClose={vi.fn()} />
      </>,
    );
    // trap がマウントされ dialog 内へフォーカスが移る
    expect(document.activeElement).toBe(getByText('first'));
    rerender(
      <>
        <button>opener</button>
      </>,
    );
    // dialog を閉じると opener へ復帰する
    expect(document.activeElement).toBe(getByText('opener'));
  });

  it('フォーカスが trap 外にあるとき前方 Tab でも trap 内へ引き戻す (F5q)', () => {
    const { getByText } = render(
      <>
        <button>outside</button>
        <TrapDialog onClose={vi.fn()} />
      </>,
    );
    // オーバーレイクリック等でフォーカスが trap 外へ落ちた状況を再現
    getByText('outside').focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('フォーカスが trap 外にあるとき Shift+Tab は末尾へ引き戻す (従来動作の維持)', () => {
    const { getByText } = render(
      <>
        <button>outside</button>
        <TrapDialog onClose={vi.fn()} />
      </>,
    );
    getByText('outside').focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByText('last'));
  });

  it('IME 変換中 (isComposing) の Escape では閉じない (F5r)', () => {
    const onClose = vi.fn();
    render(<TrapDialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true });
    expect(onClose).not.toHaveBeenCalled();
    // 旧ブラウザ互換: keyCode 229 も変換中扱い
    fireEvent.keyDown(window, { key: 'Escape', keyCode: 229 });
    expect(onClose).not.toHaveBeenCalled();
    // 変換中でなければ従来どおり閉じる
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focusable がゼロの dialog では Tab がデフォルト動作ごと抑止される', () => {
    function EmptyDialog({ onClose }) {
      const ref = useRef(null);
      useFocusTrap(ref, { onClose });
      return <div ref={ref} role="dialog">中身なし</div>;
    }
    render(
      <>
        <button>outside</button>
        <EmptyDialog onClose={vi.fn()} />
      </>,
    );
    const prevented = !fireEvent.keyDown(window, { key: 'Tab' });
    // preventDefault されている (背後の focusable へ抜けようとしない)
    expect(prevented).toBe(true);
  });
});
