import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// アクティブなトラップを LIFO で積む。Modal の上に別 dialog (ConfigModal の上に
// OnboardingOverlay 等) が開いたとき、一番上のトラップだけが Escape / Tab を処理する。
const trapStack: symbol[] = [];

interface FocusTrapOptions {
  onClose?: () => void;
  enabled?: boolean;
  /** マウント時にフォーカスする要素 (省略時は最初の focusable) */
  initialFocusRef?: { current: HTMLElement | null } | null;
}

/**
 * dialog 内に Tab フォーカスを閉じ込め、Escape で onClose を呼ぶ簡易 focus trap。
 * 本体 (Modal / CommandPalette / 通常時間割作成) と講習作成の両方がこの 1 本を
 * 使う (2026-09-05 に統合。以前は本体側に document リスナ版が別にあり、
 * trapStack が 2 つに分かれていた)。onClose は ref 経由で参照するので、
 * 呼び出し側がインライン関数を渡しても trap は再初期化されない。
 *
 * - `enabled=false` の間は完全な no-op。true に戻すと再初期化される。
 * - マウント時に最初の focusable へフォーカス、cleanup で直前要素へ復帰。
 * - 入れ子の dialog では最上位 (最後に push された) trap のみが応答する。
 *
 * トリガに紐づく一時 popover (Tab で外に出たい) には使わない。真のモーダル用。
 *
 * @param {{ current: HTMLElement | null }} containerRef trap 対象のコンテナ ref
 * @param {{ onClose?: () => void, enabled?: boolean, initialFocusRef?: { current: HTMLElement | null } }} [options]
 *   initialFocusRef: マウント時にフォーカスする要素 (省略時は最初の focusable)。
 *   confirm ダイアログの OK ボタンのように「最初の focusable ではない要素」へ
 *   初期フォーカスしたい場合に使う。
 */
export function useFocusTrap(
  containerRef: { current: HTMLElement | null },
  { onClose, enabled = true, initialFocusRef = null }: FocusTrapOptions = {},
) {
  // onClose は ref 経由で参照し、effect の deps から外す。deps に入れると
  // 呼び出し側がインライン関数を渡した場合に再レンダーごとに trap が
  // 再初期化され、そのたび「最初の focusable へ focus()」が走って
  // 入力中のフォーカスを強奪してしまう (設定モーダルで 1 文字打つたびに
  // × ボタンへ飛ぶ)。trap の生存期間は enabled のみで決まるべき。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!enabled) return undefined;
    const root = containerRef.current;
    if (!root) return undefined;
    const prevActive = document.activeElement;

    const focusables = (): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled'));

    const initial = initialFocusRef?.current || focusables()[0] || root;
    initial.focus?.();

    const trap = Symbol('builderFocusTrap');
    trapStack.push(trap);

    const handleKey = (e: KeyboardEvent) => {
      // 入れ子のとき、最上位の trap のみが応答する
      if (trapStack[trapStack.length - 1] !== trap) return;
      if (e.key === 'Escape') {
        // IME 変換中の Escape は「変換のキャンセル」であってダイアログを
        // 閉じる意図ではない (F5r)。isComposing (+ 旧ブラウザの keyCode 229)
        // を素通しにしないと、日本語入力の変換取り消しでモーダルごと閉じて
        // 入力が消える。
        if (e.isComposing || e.keyCode === 229) return;
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      // フォーカスが trap の外にある (オーバーレイクリック等で body に落ちた)
      // 場合は方向に関わらず trap 内へ引き戻す (F5q)。この救済が Shift+Tab
      // 側にしか無いと、前方 Tab でモーダル背後の UI へ抜けられてしまう。
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    // Builder の既存 dialog 群 (OnboardingOverlay / ConfigModal) は一貫して
    // window で keydown を捕捉してきたので、それに合わせる。
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      const idx = trapStack.indexOf(trap);
      if (idx !== -1) trapStack.splice(idx, 1);
      if (prevActive && 'focus' in prevActive) (prevActive as HTMLElement).focus?.();
    };
    // containerRef / onCloseRef は ref (識別子安定) なので依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
