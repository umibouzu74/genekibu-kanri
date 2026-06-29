import GeneratorWorker from './autoGenerator.worker?worker';
import { generateSinglePattern } from './autoGenerator';

// Web Worker で自動生成を実行する。worker 起動は呼び出し側のタイミングで。
// onPattern: パターン 1 件生成のたびに (index, result) で呼ばれる
// onProgress: 探索の途中経過のたびに (index, progress) で呼ばれる (間引き済, E2f)
// 戻り値: { cancel(): void, done: Promise<void> }
//
// Worker を使えない環境 (Jest/Vitest の jsdom 等) では throw する前に
// メイン スレッド上で同期実行にフォールバックする。
export function runGeneratorInWorker({
  project,
  activeTabId,
  numPatterns,
  baseSeed = Date.now(),
  onPattern,
  onProgress,
  onError,
}) {
  // typeof Worker チェックで test 環境を判別 (jsdom には Worker がない)
  if (typeof Worker === 'undefined') {
    return runGeneratorSync({ project, activeTabId, numPatterns, baseSeed, onPattern, onProgress, onError });
  }

  const worker = new GeneratorWorker();
  let cancelled = false;
  // cancel() からも done を解決できるよう resolver を外スコープへ。
  // (terminate するだけだと done が pending のまま GC されず、closure リーク)
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });

  worker.addEventListener('message', (e) => {
    if (cancelled) return;
    const { type, index, result, message, progress } = e.data || {};
    if (type === 'pattern') {
      onPattern?.(index, result);
    } else if (type === 'progress') {
      onProgress?.(index, progress);
    } else if (type === 'done') {
      worker.terminate();
      resolveDone();
    } else if (type === 'error') {
      onError?.(message);
      worker.terminate();
      resolveDone();
    }
  });
  worker.addEventListener('error', (err) => {
    if (cancelled) return;
    onError?.(err?.message || 'worker error');
    worker.terminate();
    resolveDone();
  });
  worker.postMessage({ project, activeTabId, numPatterns, baseSeed });

  return {
    done,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      worker.terminate();
      resolveDone();
    },
  };
}

// Worker が使えない環境向けの同期フォールバック (テスト・SSR 用)。
function runGeneratorSync({ project, activeTabId, numPatterns, baseSeed, onPattern, onProgress, onError }) {
  let cancelled = false;
  const done = new Promise((resolve) => {
    try {
      for (let i = 0; i < numPatterns; i++) {
        if (cancelled) break;
        const seed = baseSeed + i * 7919;
        const result = generateSinglePattern({
          project,
          activeTabId,
          seed,
          onProgress: onProgress ? (p) => onProgress(i, p) : undefined,
        });
        onPattern?.(i, result);
      }
    } catch (err) {
      onError?.(err?.message || String(err));
    }
    resolve();
  });
  return { done, cancel: () => { cancelled = true; } };
}
