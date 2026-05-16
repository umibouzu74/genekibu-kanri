import GeneratorWorker from './autoGenerator.worker?worker';
import { generateSinglePattern } from './autoGenerator';

// Web Worker で自動生成を実行する。worker 起動は呼び出し側のタイミングで。
// onPattern: パターン 1 件生成のたびに (index, result) で呼ばれる
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
  onError,
}) {
  // typeof Worker チェックで test 環境を判別 (jsdom には Worker がない)
  if (typeof Worker === 'undefined') {
    return runGeneratorSync({ project, activeTabId, numPatterns, baseSeed, onPattern, onError });
  }

  const worker = new GeneratorWorker();
  let cancelled = false;

  const done = new Promise((resolve) => {
    worker.addEventListener('message', (e) => {
      if (cancelled) return;
      const { type, index, result, message } = e.data || {};
      if (type === 'pattern') {
        onPattern?.(index, result);
      } else if (type === 'done') {
        worker.terminate();
        resolve();
      } else if (type === 'error') {
        onError?.(message);
        worker.terminate();
        resolve();
      }
    });
    worker.addEventListener('error', (err) => {
      if (cancelled) return;
      onError?.(err?.message || 'worker error');
      worker.terminate();
      resolve();
    });
    worker.postMessage({ project, activeTabId, numPatterns, baseSeed });
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      worker.terminate();
    },
  };
}

// Worker が使えない環境向けの同期フォールバック (テスト・SSR 用)。
function runGeneratorSync({ project, activeTabId, numPatterns, baseSeed, onPattern, onError }) {
  let cancelled = false;
  const done = new Promise((resolve) => {
    try {
      for (let i = 0; i < numPatterns; i++) {
        if (cancelled) break;
        const seed = baseSeed + i * 7919;
        const result = generateSinglePattern({ project, activeTabId, seed });
        onPattern?.(i, result);
      }
    } catch (err) {
      onError?.(err?.message || String(err));
    }
    resolve();
  });
  return { done, cancel: () => { cancelled = true; } };
}
