import { useEffect, useRef } from "react";
import {
  hasArrowKeyOwnerFocus,
  hasOpenDialog,
  isTypingTarget,
} from "../utils/keyboardGuards";

// 日付・月を持つビュー (日別ダッシュボード / 月間 / イベントカレンダー /
// 週間) 共通のキーボード移動。
//   ← / →  = 前へ / 次へ (日・週・月はビューが決める)
//   t      = 今日 (今週 / 今月)
// 入力要素にフォーカスがあるとき・aria-modal なダイアログが開いているとき・
// 修飾キー付きは握り潰す (chord ナビゲーション `useChordNavigation` と同じ
// 判定)。← / → だけはさらに、矢印キーを自前で使うウィジェット (role=radio
// 群・listbox・tab・menu など。`keyboardGuards.hasArrowKeyOwnerFocus`) に
// フォーカスがある間も握らない — isTypingTarget は Cmd+K / chord と共有なので
// そちらは広げず、この hook だけで見る。
// ビューは onPrev / onNext / onToday を渡すだけでよく、キーの割り当ては
// ここ 1 か所 (ShortcutsHelp の「日付の移動」節と揃える)。
//
// enabled=false のときはリスナーを付けない (ビューが表示されていない間や、
// 代行モードのように日付が固定される間)。

export const DATE_KEY_NAV_KEYS = Object.freeze({
  prev: "ArrowLeft",
  next: "ArrowRight",
  today: "t",
});

export function useDateKeyNav({ onPrev, onNext, onToday, enabled = true }) {
  // 最新のハンドラを ref で参照し、リスナーは enabled が変わるときだけ張り替える
  const handlers = useRef({ onPrev, onNext, onToday });
  handlers.current = { onPrev, onNext, onToday };

  useEffect(() => {
    if (!enabled) return undefined;
    const handleKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      if (hasOpenDialog()) return;
      const key = typeof e.key === "string" ? e.key : "";
      const isArrow = key === DATE_KEY_NAV_KEYS.prev || key === DATE_KEY_NAV_KEYS.next;
      if (isArrow && hasArrowKeyOwnerFocus()) return;
      let fn = null;
      if (key === DATE_KEY_NAV_KEYS.prev) fn = handlers.current.onPrev;
      else if (key === DATE_KEY_NAV_KEYS.next) fn = handlers.current.onNext;
      else if (key.toLowerCase() === DATE_KEY_NAV_KEYS.today && !e.shiftKey)
        fn = handlers.current.onToday;
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [enabled]);
}
