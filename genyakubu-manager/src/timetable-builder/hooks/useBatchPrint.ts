import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { collectSnapshots } from '../../utils/snapshotPrint';
import type { BatchPrintItem } from '../utils/batchPrint';

// まとめて印刷 (L2h) の進め方。CLAUDE.md「印刷システムの二系統」の window.print()
// 側の派生で、popup を使わない:
//   1. 組を 1 つずつ印刷専用の欄 (BatchPrintSheets) に足す。ループは
//      utils/snapshotPrint の collectSnapshots (進捗 → render (flushSync) →
//      yieldToBrowser → 中断チェック)。DOM は撮らない (capture は数えるだけ) —
//      紙面は同じページの React の描画をそのまま刷るので、select の選択値が消える・
//      CSS が popup に入らない、の問題が起きない
//   2. 描き終えたら window.print()。欄は afterprint で片付ける (iPad の Safari は
//      print() がすぐ返るので、返った直後には消さない)
// タブも強調も切り替えないので、終わった後に元へ戻す処理は無い。
export type BatchPrintProgress = { current: number; total: number; name: string };

export type BatchPrintResult = { status: 'printed'; count: number } | { status: 'aborted' } | { status: 'empty' };

// snapshotPrint は JS なので、ここで使う形の型を付けて呼ぶ
const collect = collectSnapshots as (opts: {
  items: BatchPrintItem[];
  progressName: (item: BatchPrintItem, i: number) => string;
  onProgress: (p: BatchPrintProgress) => void;
  isAborted: () => boolean;
  render: (item: BatchPrintItem, i: number) => void;
  capture: (item: BatchPrintItem, i: number) => unknown;
}) => Promise<unknown[]>;

export function useBatchPrint() {
  // 印刷専用の欄に描いている組 (null = まとめて印刷していない)
  const [items, setItems] = useState<BatchPrintItem[] | null>(null);
  const [progress, setProgress] = useState<BatchPrintProgress | null>(null);
  const abortRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const clear = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setItems(null);
    setProgress(null);
  }, []);

  // 画面を離れたら (季節の切替・別の画面へ) afterprint を待たずに外す
  useEffect(() => () => { cleanupRef.current?.(); }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  /** 組を描く。描き終えたら印刷ダイアログを開く前に beforePrint を呼ぶ (ダイアログを閉じる等) */
  const run = useCallback(async (
    all: BatchPrintItem[],
    { label, beforePrint }: { label: (item: BatchPrintItem) => string; beforePrint?: () => void },
  ): Promise<BatchPrintResult> => {
    clear();
    if (all.length === 0) return { status: 'empty' };
    abortRef.current = false;
    flushSync(() => {
      setItems([]);
      setProgress({ current: 0, total: all.length, name: '' });
    });
    const done = await collect({
      items: all,
      progressName: (item) => label(item),
      onProgress: (p) => setProgress(p),
      isAborted: () => abortRef.current,
      render: (item) => flushSync(() => setItems(prev => [...(prev || []), item])),
      capture: () => true,
    });
    if (abortRef.current || done.length < all.length) {
      clear();
      return { status: 'aborted' };
    }
    flushSync(() => {
      setProgress(null);
      beforePrint?.();
    });
    const onAfterPrint = () => clear();
    window.addEventListener('afterprint', onAfterPrint, { once: true });
    cleanupRef.current = () => window.removeEventListener('afterprint', onAfterPrint);
    window.print();
    return { status: 'printed', count: done.length };
  }, [clear]);

  return { items, progress, run, abort, clear };
}
