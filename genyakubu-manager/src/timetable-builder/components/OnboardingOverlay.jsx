import { useEffect, useRef, useState } from 'react';
import { ONBOARDING_STEPS as STEPS } from './onboardingSteps';

/**
 * 初回起動時のオンボーディングオーバーレイ。
 * - 起動時に表示されるかは BuilderApp 側で LocalStorage flag から判定する。
 * - Toolbar の「❓ヘルプ」ボタンからも開ける (props.open で制御)。
 * - onClose 引数:
 *     `{ dontShowAgain: true }`  → 「始める」を押した時のみ。LocalStorage flag を立てる
 *     `{ dontShowAgain: false }` → ✕ / Escape / 背景クリックで閉じた時。当該セッションのみ閉じる
 *   (F1 修正: 初回ユーザが反射的に Escape を押して永久消失するのを防ぐ)
 */
export default function OnboardingOverlay({ open, onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const titleId = 'builder-onboarding-title';
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);

  // 開く度に最初のステップへ戻す + 閉じるボタンへ初期フォーカス
  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    closeBtnRef.current?.focus();
  }, [open]);

  // Escape で閉じる + Tab / Shift+Tab で dialog 内のフォーカスを循環 (M2 簡易 focus trap)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.({ dontShowAgain: false });
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 no-print"
      onClick={(e) => {
        // 背景クリックで閉じる (dontShowAgain=false で当該セッションのみ閉じる)
        if (e.target === e.currentTarget) onClose?.({ dontShowAgain: false });
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-builder-surface text-builder-ink rounded-lg shadow-xl border border-builder-border w-[90%] max-w-md p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 id={titleId} className="text-lg font-bold">{step.title}</h2>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="閉じる"
            onClick={() => onClose?.({ dontShowAgain: false })}
            className="text-builder-ink-muted hover:text-builder-ink text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-builder-ink-muted leading-relaxed mb-5 whitespace-pre-line">
          {step.body}
        </p>

        <div className="flex items-center justify-between">
          <div className="text-xs text-builder-ink-muted" aria-live="polite">
            {stepIndex + 1} / {STEPS.length}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={isFirst}
              className="px-3 py-1.5 text-sm border border-builder-border rounded text-builder-ink-muted hover:bg-builder-surface-alt disabled:opacity-30"
            >
              ← 戻る
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={() => onClose?.({ dontShowAgain: true })}
                className="px-4 py-1.5 text-sm bg-builder-primary text-white rounded hover:bg-builder-primary-hover font-bold"
              >
                始める
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
                className="px-4 py-1.5 text-sm bg-builder-primary text-white rounded hover:bg-builder-primary-hover font-bold"
              >
                次へ →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
