import { useCallback, useRef } from 'react';

// 長押し (タッチ) を検出してコールバックを呼ぶ (E1f タッチ操作対応)。
//
// マウス環境の右クリック (onContextMenu) に相当する操作をタッチでも行えるよう、
// 指を一定時間 (既定 500ms) 静止させたら callback を発火する。スクロールや
// フリックと誤検出しないよう、閾値 (既定 10px) 以上動いたらキャンセルする。
//
// 返り値をそのまま要素へ spread する: <td {...useLongPress(fn)}>。
// callback には発火位置を含む `{ pageX, pageY }` を渡す。
//
// 注意: HTML5 のネイティブ drag-and-drop はタッチでは発火しないため、
// draggable な要素に併用しても競合しない。
export function useLongPress(callback, { delay = 500, moveThreshold = 10 } = {}) {
  const timerRef = useRef(null);
  const startRef = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback((e) => {
    if (!e.touches || e.touches.length !== 1) return; // マルチタッチ (ピンチ等) は無視
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    firedRef.current = false;
    clear();
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      callback?.({ pageX: t.pageX, pageY: t.pageY });
    }, delay);
  }, [callback, delay, clear]);

  const onTouchMove = useCallback((e) => {
    if (!timerRef.current || !e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - startRef.current.x);
    const dy = Math.abs(t.clientY - startRef.current.y);
    if (dx > moveThreshold || dy > moveThreshold) clear(); // スクロール/フリック → キャンセル
  }, [moveThreshold, clear]);

  const onTouchEnd = useCallback(() => {
    clear();
  }, [clear]);

  // 長押し発火直後の click を抑止 (select 等の誤操作防止)
  const onClickCapture = useCallback((e) => {
    if (firedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      firedRef.current = false;
    }
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd, onClickCapture };
}
