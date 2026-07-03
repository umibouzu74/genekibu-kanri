import { useEffect, useRef, useState } from 'react';

// F2l: 外側クリック / Escape で閉じる popover の開閉ロジック。
// Header (Excel メニュー) / Toolbar (違反 popover) / SnapshotMenu が同型の
// effect を別々に持っていたのを共有化した。
//
// - mousedown で閉じる (click ではなく): トリガーボタンの再クリックで
//   「閉じる」を成立させるため。click まで待つとトグルの onClick が先に
//   走って再度 open してしまう。
// - ref は popover のルート要素 (トリガーボタンを含む) に付ける。ref 内の
//   mousedown では閉じない。
// - Escape は IME 変換中 (isComposing) を無視する (F5r と同じ理由。popover
//   内にテキスト入力を置いた場合に変換キャンセルで閉じない)。
//
// 返り値: { open, setOpen, ref }
// T は ref を付けるルート要素の型 (省略時は div)。
export function useDismissablePopover<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return { open, setOpen, ref };
}
