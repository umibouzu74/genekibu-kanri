import { useCallback, useEffect, useRef, useState } from 'react';
import { ONBOARDING_STEPS as STEPS } from './onboardingSteps';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * 初回起動時のオンボーディングオーバーレイ。
 * - 起動時に表示されるかは BuilderApp 側で LocalStorage flag から判定する。
 * - Toolbar の「❓ヘルプ」ボタンからも開ける (props.open で制御)。
 * - onClose 引数:
 *     `{ dontShowAgain: true }`  → 「始める」を押した時のみ。LocalStorage flag を立てる
 *     `{ dontShowAgain: false }` → ✕ / Escape / 背景クリックで閉じた時。当該セッションのみ閉じる
 *   (F1 修正: 初回ユーザが反射的に Escape を押して永久消失するのを防ぐ)
 */
interface OnboardingOverlayProps {
  open: boolean;
  onClose: (opts?: { dontShowAgain?: boolean }) => void;
}

export default function OnboardingOverlay({ open, onClose }: OnboardingOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const titleId = 'builder-onboarding-title';
  const dialogRef = useRef<HTMLDivElement>(null);

  // 開く度に最初のステップへ戻す
  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
  }, [open]);

  // Escape / Tab focus trap は共通フック (E1b) に委譲。Escape では
  // dontShowAgain=false で閉じる (F1: 初見ユーザの永久消失を防ぐ)。
  const handleTrapClose = useCallback(() => onClose?.({ dontShowAgain: false }), [onClose]);
  useFocusTrap(dialogRef, { onClose: handleTrapClose, enabled: open });

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
