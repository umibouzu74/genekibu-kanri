// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import OnboardingOverlay from './OnboardingOverlay';
import { ONBOARDING_STEPS as STEPS } from './onboardingSteps';

afterEach(cleanup);

// 「次へ」を最後まで押す。STEPS.length から +1 ループまで許容。
function advanceToLastStep() {
  for (let i = 0; i < STEPS.length + 1; i++) {
    const nextBtn = screen.queryByText(/次へ/);
    if (!nextBtn) return;
    fireEvent.click(nextBtn);
  }
  throw new Error('全ステップ進めても「始める」に到達しませんでした');
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
    expect(dialog).toHaveAttribute('aria-labelledby');
  });

  it('初期表示は 1 / N で「次へ」が出ている', () => {
    render(<OnboardingOverlay open onClose={vi.fn()} />);
    expect(screen.getByText(`1 / ${STEPS.length}`)).toBeInTheDocument();
    expect(screen.getByText(/次へ/)).toBeInTheDocument();
    expect(screen.queryByText('始める')).not.toBeInTheDocument();
  });

  it('「次へ →」で進み、最終ステップで「始める」に切り替わる', () => {
    render(<OnboardingOverlay open onClose={vi.fn()} />);
    advanceToLastStep();
    expect(screen.getByText(`${STEPS.length} / ${STEPS.length}`)).toBeInTheDocument();
    expect(screen.getByText('始める')).toBeInTheDocument();
  });

  it('「← 戻る」は最初のステップで disabled', () => {
    render(<OnboardingOverlay open onClose={vi.fn()} />);
    expect(screen.getByText(/戻る/).closest('button')).toBeDisabled();
    fireEvent.click(screen.getByText(/次へ/));
    expect(screen.getByText(/戻る/).closest('button')).not.toBeDisabled();
  });

  it('「始める」のみ dontShowAgain=true で onClose を呼ぶ', () => {
    const onClose = vi.fn();
    render(<OnboardingOverlay open onClose={onClose} />);
    advanceToLastStep();
    fireEvent.click(screen.getByText('始める'));
    expect(onClose).toHaveBeenCalledWith({ dontShowAgain: true });
  });

  it('✕ クリックで dontShowAgain=false で閉じる (F1: 永久消失防止)', () => {
    const onClose = vi.fn();
    render(<OnboardingOverlay open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('閉じる'));
    expect(onClose).toHaveBeenCalledWith({ dontShowAgain: false });
  });

  it('Escape キーで dontShowAgain=false で閉じる (F1: 永久消失防止)', () => {
    const onClose = vi.fn();
    render(<OnboardingOverlay open onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith({ dontShowAgain: false });
  });

  it('背景クリックで dontShowAgain=false で閉じる、ダイアログ内クリックは閉じない', () => {
    const onClose = vi.fn();
    render(<OnboardingOverlay open onClose={onClose} />);
    fireEvent.click(screen.getByText(/次へ/));
    expect(onClose).not.toHaveBeenCalled();
    // 背景 (role=dialog ではなく外側の overlay div) をクリック
    const overlay = document.querySelector('.fixed.inset-0');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledWith({ dontShowAgain: false });
  });

  it('再オープン時に stepIndex が 0 に戻る', () => {
    const onClose = vi.fn();
    const { rerender } = render(<OnboardingOverlay open onClose={onClose} />);
    fireEvent.click(screen.getByText(/次へ/));
    expect(screen.getByText(`2 / ${STEPS.length}`)).toBeInTheDocument();
    rerender(<OnboardingOverlay open={false} onClose={onClose} />);
    rerender(<OnboardingOverlay open onClose={onClose} />);
    expect(screen.getByText(`1 / ${STEPS.length}`)).toBeInTheDocument();
  });

  it('Tab キーで最後のフォーカス要素を超えるとき最初の要素にループする (M2 focus trap)', () => {
    render(<OnboardingOverlay open onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    const focusables = dialog.querySelectorAll('button:not([disabled])');
    const first = focusables[0]; // ✕
    const last = focusables[focusables.length - 1]; // 次へ (初期 step では「戻る」が disabled なので)
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('Shift+Tab で最初の要素から最後の要素にループする (M2 focus trap)', () => {
    render(<OnboardingOverlay open onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    const focusables = dialog.querySelectorAll('button:not([disabled])');
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
