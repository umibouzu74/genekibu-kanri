// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import OnboardingOverlay from './OnboardingOverlay';

afterEach(cleanup);

// 「次へ」を最後まで押す (最後の step では「始める」になり「次へ」は消える)。
// STEPS の長さに依存しないように、無限ループ防止の上限だけ設けている。
function advanceToLastStep() {
  for (let i = 0; i < 20; i++) {
    const nextBtn = screen.queryByText(/次へ/);
    if (!nextBtn) return;
    fireEvent.click(nextBtn);
  }
  throw new Error('20 ステップ進めても「始める」に到達しませんでした');
}

describe('OnboardingOverlay', () => {
  it('open=false なら何も描画しない', () => {
    const { container } = render(<OnboardingOverlay open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('open=true で role=dialog と aria-modal を持つ', () => {
    render(<OnboardingOverlay open onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // タイトル要素を aria-labelledby で参照している
    expect(dialog).toHaveAttribute('aria-labelledby');
  });

  it('初期表示は 1 / N で「次へ」が出ている', () => {
    render(<OnboardingOverlay open onClose={vi.fn()} />);
    expect(screen.getByText(/^1 \/ \d+$/)).toBeInTheDocument();
    expect(screen.getByText(/次へ/)).toBeInTheDocument();
    // 最初は「始める」は出ない
    expect(screen.queryByText('始める')).not.toBeInTheDocument();
  });

  it('「次へ →」で進み、最終ステップで「始める」に切り替わる', () => {
    render(<OnboardingOverlay open onClose={vi.fn()} />);
    advanceToLastStep();
    expect(screen.getByText('始める')).toBeInTheDocument();
    expect(screen.queryByText(/次へ/)).not.toBeInTheDocument();
  });

  it('「← 戻る」は最初のステップで disabled', () => {
    render(<OnboardingOverlay open onClose={vi.fn()} />);
    const backBtn = screen.getByText(/戻る/).closest('button');
    expect(backBtn).toBeDisabled();
    fireEvent.click(screen.getByText(/次へ/));
    expect(screen.getByText(/戻る/).closest('button')).not.toBeDisabled();
  });

  it('「始める」クリックで onClose({ dontShowAgain: true }) を呼ぶ', () => {
    const onClose = vi.fn();
    render(<OnboardingOverlay open onClose={onClose} />);
    advanceToLastStep();
    fireEvent.click(screen.getByText('始める'));
    expect(onClose).toHaveBeenCalledWith({ dontShowAgain: true });
  });

  it('✕ クリックで onClose({ dontShowAgain: true }) を呼ぶ', () => {
    const onClose = vi.fn();
    render(<OnboardingOverlay open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('閉じる'));
    expect(onClose).toHaveBeenCalledWith({ dontShowAgain: true });
  });

  it('Escape キーで onClose({ dontShowAgain: true }) を呼ぶ', () => {
    const onClose = vi.fn();
    render(<OnboardingOverlay open onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith({ dontShowAgain: true });
  });

  it('背景クリックで閉じるが、ダイアログ内クリックは閉じない', () => {
    const onClose = vi.fn();
    render(<OnboardingOverlay open onClose={onClose} />);
    // ダイアログ内側 (「次へ」ボタン) のクリックは閉じない
    // (Note: 「次へ」はステップを進めるが、onClose は呼ばれない)
    fireEvent.click(screen.getByText(/次へ/));
    expect(onClose).not.toHaveBeenCalled();
    // 背景 (role=dialog の外枠) クリック → 閉じる
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledWith({ dontShowAgain: true });
  });

  it('再オープン時に stepIndex が 0 に戻る', () => {
    const onClose = vi.fn();
    const { rerender } = render(<OnboardingOverlay open onClose={onClose} />);
    fireEvent.click(screen.getByText(/次へ/));
    expect(screen.getByText(/^2 \/ \d+$/)).toBeInTheDocument();
    // 一旦閉じて再オープン
    rerender(<OnboardingOverlay open={false} onClose={onClose} />);
    rerender(<OnboardingOverlay open onClose={onClose} />);
    expect(screen.getByText(/^1 \/ \d+$/)).toBeInTheDocument();
  });
});
