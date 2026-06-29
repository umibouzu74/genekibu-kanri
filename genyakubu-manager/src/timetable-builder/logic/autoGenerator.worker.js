// 自動生成を Web Worker で走らせるためのエントリ。
// メインスレッドから { project, activeTabId, numPatterns, baseSeed } を
// メッセージで受け取り、パターン毎に { type: 'pattern', index, result } を
// 順次返す。探索の途中経過は { type: 'progress', index, progress } で逐次通知し、
// 最後に { type: 'done' } を送って終わる。
//
// autoGenerator.js は純粋関数なのでそのまま import するだけで動く。
import { generateSinglePattern } from './autoGenerator';

self.addEventListener('message', (e) => {
  const { project, activeTabId, numPatterns, baseSeed } = e.data || {};
  if (!project || typeof numPatterns !== 'number') {
    self.postMessage({ type: 'error', message: 'invalid request' });
    return;
  }

  try {
    for (let i = 0; i < numPatterns; i++) {
      // baseSeed があれば優先、無ければ Date.now を基準 (素数オフセット)
      const seed = (baseSeed ?? Date.now()) + i * 7919;
      const result = generateSinglePattern({
        project,
        activeTabId,
        seed,
        // 探索の途中経過を逐次通知 (E2f live progress)
        onProgress: (p) => self.postMessage({ type: 'progress', index: i, progress: p }),
      });
      self.postMessage({ type: 'pattern', index: i, result });
    }
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
});
