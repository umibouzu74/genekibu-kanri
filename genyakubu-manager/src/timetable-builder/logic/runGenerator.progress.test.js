import { afterEach, describe, expect, it, vi } from 'vitest';

// generateSinglePattern を stub 化し、onProgress 経路 (E2f) の配線だけを
// 決定的に検証する。実 solver の探索回数に依存しない。
// (本物の solver で 20000 回の間引き閾値に到達させるのは fixture が大がかりに
//  なるため、ここでは「runGenerator が onProgress を index 付きで前段へ橋渡し
//  する」契約をテストする。)
vi.mock('./autoGenerator', () => ({
  generateSinglePattern: ({ onProgress }) => {
    // 各パターンで 2 回ずつ途中経過を通知してから結果を返す
    onProgress?.({ iterations: 20000, filledCount: 1, totalSlots: 3 });
    onProgress?.({ iterations: 40000, filledCount: 2, totalSlots: 3 });
    return { solution: {}, bestPartial: {}, filledCount: 3, totalSlots: 3, iterations: 40000, hitLimit: false, stuckSlot: null };
  },
}));

import { runGeneratorInWorker } from './runGenerator';

afterEach(() => vi.clearAllMocks());

const project = { tabs: [{ id: 1 }], activeTabId: 1 };

describe('runGeneratorInWorker — onProgress 配線 (E2f)', () => {
  it('sync fallback で onProgress を (index, progress) 形式で前段へ渡す', async () => {
    const onProgress = vi.fn();
    const handle = runGeneratorInWorker({
      project,
      activeTabId: 1,
      numPatterns: 2,
      baseSeed: 1,
      onPattern: vi.fn(),
      onProgress,
    });
    await handle.done;
    // 2 パターン × 2 通知 = 4 回
    expect(onProgress).toHaveBeenCalledTimes(4);
    // 1 パターン目の index=0、2 パターン目の index=1
    expect(onProgress).toHaveBeenCalledWith(0, { iterations: 20000, filledCount: 1, totalSlots: 3 });
    expect(onProgress).toHaveBeenCalledWith(1, { iterations: 40000, filledCount: 2, totalSlots: 3 });
  });

  it('onProgress 未指定でも完走する (optional)', async () => {
    const onPattern = vi.fn();
    const handle = runGeneratorInWorker({ project, activeTabId: 1, numPatterns: 1, baseSeed: 1, onPattern });
    await handle.done;
    expect(onPattern).toHaveBeenCalledTimes(1);
  });
});
