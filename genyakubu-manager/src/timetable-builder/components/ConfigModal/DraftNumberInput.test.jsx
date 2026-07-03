// @vitest-environment jsdom
// F2l: 数値入力の draft-commit 仕様を固定する。
// SubjectManager (タブ別コマ数) / AbsenceNgPanel (外部コマ数) が依存。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DraftNumberInput from './DraftNumberInput';

afterEach(cleanup);

function renderInput(props = {}) {
  const onCommit = vi.fn();
  render(<DraftNumberInput aria-label="数値" value={3} onCommit={onCommit} {...props} />);
  return { onCommit, input: screen.getByLabelText('数値') };
}

describe('DraftNumberInput (F2l)', () => {
  it('入力途中は commit せず、blur で 1 回だけ commit する', () => {
    const { onCommit, input } = renderInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('12');
  });

  it('Enter でも commit する (blur 経由)', () => {
    const { onCommit, input } = renderInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // jsdom は e.target.blur() で blur イベントを発火する
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('7');
  });

  it('変更が無ければ commit しない', () => {
    const { onCommit, input } = renderInput();
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Escape で draft を破棄して編集前の値に戻る', () => {
    const { onCommit, input } = renderInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue(3);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("value='' (未入力セル) と 0 を区別して扱える", () => {
    const { onCommit, input } = renderInput({ value: '' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('0');
  });

  it('非編集時は外部 value の変化に追従する (draft は上書きしない)', () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <DraftNumberInput aria-label="数値" value={3} onCommit={onCommit} />,
    );
    rerender(<DraftNumberInput aria-label="数値" value={8} onCommit={onCommit} />);
    expect(screen.getByLabelText('数値')).toHaveValue(8);
  });
});
