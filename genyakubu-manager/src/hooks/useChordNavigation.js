import { useEffect, useRef, useState } from "react";

// `g` を起点とした 2 文字 chord ナビゲーション。
// - `g` を押した直後 timeout 内にもう 1 キー押すと chordMap から対応する値を引いて onMatch に渡す。
// - timeout 切れで onTimeout（あれば）を呼ぶ。
// - 入力要素フォーカス中／aria-modal なダイアログ展開中は常に握り潰す。
// - CapsLock や Shift で大文字が来ても拾えるよう内部で lowercase 化。
//
// 戻り値:
//   waiting: 第 2 キー待ち状態かどうか（バッジ表示などに使う）
//   reset:   外部イベントで chord を即時解除するための関数
export function useChordNavigation({
  chordMap,
  onMatch,
  onTimeout,
  timeoutMs = 1200,
}) {
  const [waiting, setWaiting] = useState(false);
  const resetRef = useRef(() => {});

  // 効果のクロージャは初回マウント時の chordMap / onMatch を捉えてしまうので、
  // 最新値を ref 経由で参照する。
  const chordMapRef = useRef(chordMap);
  const onMatchRef = useRef(onMatch);
  const onTimeoutRef = useRef(onTimeout);
  chordMapRef.current = chordMap;
  onMatchRef.current = onMatch;
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };
    const hasOpenDialog = () =>
      !!document.querySelector('[role="dialog"][aria-modal="true"]');

    let waitingG = false;
    let timer = null;
    const reset = (reason) => {
      const wasWaiting = waitingG;
      waitingG = false;
      setWaiting(false);
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (wasWaiting && reason === "timeout" && onTimeoutRef.current) {
        onTimeoutRef.current();
      }
    };
    resetRef.current = () => reset("external");

    const handleKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (hasOpenDialog()) return;
      // OS のキーリピート（押しっぱなし）は chord 状態をリセットさせない。
      // g を一瞬長く押してから 2 キー目に移る操作で誤って解除されないため。
      if (e.repeat) return;
      const key = typeof e.key === "string" ? e.key.toLowerCase() : "";
      if (waitingG) {
        const target = chordMapRef.current[key];
        // 第 2 キー入力で chord は終わる。timeout 経路ではないので reason は match/abort。
        const wasWaiting = waitingG;
        waitingG = false;
        setWaiting(false);
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (wasWaiting && target !== undefined && onMatchRef.current) {
          e.preventDefault();
          onMatchRef.current(target, key);
        }
        return;
      }
      if (key === "g") {
        waitingG = true;
        setWaiting(true);
        timer = setTimeout(() => reset("timeout"), timeoutMs);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      // unmount 時は外部通知不要なので timeout 扱いにしない。
      reset("unmount");
      resetRef.current = () => {};
    };
  }, [timeoutMs]);

  return {
    waiting,
    reset: () => resetRef.current(),
  };
}
