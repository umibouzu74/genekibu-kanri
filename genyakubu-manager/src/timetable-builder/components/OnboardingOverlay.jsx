import { useEffect, useRef, useState } from 'react';

const STEPS = [
  {
    title: '時間割作成くんへようこそ',
    body: 'スケジュール表の上で右クリック / セルクリック / 自動生成の 3 つで日々の組み立てができます。所要 30 秒で主要操作を案内します。',
  },
  {
    title: '日付・時限・クラス名を右クリックで編集',
    body: '表のヘッダ (左上の空欄を含む) を右クリックすると、日付・時限・クラス名の追加 / 名称変更 / 削除メニューが開きます。',
  },
  {
    title: '⚙️ 設定で講師・科目・コマ数・NG を管理',
    body: '右上ツールバーの ⚙️設定 から、講師の追加 / 担当科目 / NG 時間帯 / 各クラスのコマ数を編集できます。',
  },
  {
    title: 'セルを右クリックでコピー / 貼付 / NG 登録',
    body: '時間割セルの右クリックで「コピー」「貼付」「クリア」「ロック」「NG として登録」が選べます。Ctrl+Z で元に戻せます。',
  },
  {
    title: '🧙‍♂️ 自動作成で MRV+バックトラックの解を試す',
    body: '右上の 🧙‍♂️自動作成 を押すと、3 パターンを生成します。集計パネルから採用したい案を反映できます。',
  },
];

/**
 * 初回起動時のオンボーディングオーバーレイ。
 * - 起動時に表示されるかは BuilderApp 側で LocalStorage flag から判定する。
 * - Toolbar の「？ヘルプ」ボタンからも開ける (props.open で制御)。
 * - 「始める」または ✕ で onClose を呼ぶ。
 *   onClose に { dontShowAgain: true } を渡すと flag を永続化する想定。
 */
export default function OnboardingOverlay({ open, onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const titleId = 'builder-onboarding-title';
  const closeBtnRef = useRef(null);

  // 開く度に最初のステップへ戻す + 閉じるボタンへ初期フォーカス
  useEffect(() => {
    if (open) {
      setStepIndex(0);
      // フォーカス移動は次のレンダ後
      queueMicrotask(() => closeBtnRef.current?.focus());
    }
  }, [open]);

  // Escape で閉じる (ヘルプ再表示時も同様)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.({ dontShowAgain: true });
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
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 no-print"
      onClick={(e) => {
        // 背景クリックで閉じる (内部クリックは伝播停止しているので無視される)
        if (e.target === e.currentTarget) onClose?.({ dontShowAgain: true });
      }}
    >
      <div
        className="bg-builder-surface text-builder-ink rounded-lg shadow-xl border border-builder-border w-[90%] max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 id={titleId} className="text-lg font-bold">{step.title}</h2>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="閉じる"
            onClick={() => onClose?.({ dontShowAgain: true })}
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
