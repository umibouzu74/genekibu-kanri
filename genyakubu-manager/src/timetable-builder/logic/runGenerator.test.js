import { describe, expect, it, vi } from 'vitest';
import { runGeneratorInWorker } from './runGenerator';
import { makeKey } from '../utils/scheduleKey';
// 注意: vite.config.js の test.environment は "node" で、node にも
// Worker は無いため runGeneratorInWorker は sync 経路に落ちる。sync
// fallback は Promise 本体を即時実行するので cancel の中断テストは
// 行えない (本番 Worker は terminate で即停止する)。

// jsdom には Worker がないので、runGeneratorInWorker は sync fallback に
// 落ちる。ここではその経路の挙動 (onPattern が numPatterns 回呼ばれる、
// done が resolve する、cancel が機能する) を検証する。

function makeMiniProject() {
  return {
    version: 3,
    name: 't',
    teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] }],
    activeTabId: 1,
    tabs: [{
      id: 1,
      name: 'a',
      config: {
        dates: [{ id: 1, label: '12/25(木)' }],
        periods: [{ id: 1, label: '1限' }],
        classes: [{ id: 1, label: '３S' }],
        subjectCounts: { '英語': 1 },
      },
      schedule: {},
    }],
    externalCounts: {},
    combinedGroups: [],
    subjects: ['英語'],
    subjectColors: {},
  };
}

describe('runGeneratorInWorker (sync fallback)', () => {
  it('numPatterns 回 onPattern を呼ぶ', async () => {
    const project = makeMiniProject();
    const onPattern = vi.fn();
    const handle = runGeneratorInWorker({
      project,
      activeTabId: 1,
      numPatterns: 3,
      baseSeed: 100,
      onPattern,
    });
    await handle.done;
    expect(onPattern).toHaveBeenCalledTimes(3);
    expect(onPattern).toHaveBeenCalledWith(0, expect.objectContaining({ totalSlots: 1 }));
    expect(onPattern).toHaveBeenCalledWith(1, expect.objectContaining({ totalSlots: 1 }));
    expect(onPattern).toHaveBeenCalledWith(2, expect.objectContaining({ totalSlots: 1 }));
  });

  it('seed を変えてシリーズを返す (各回の結果は valid な解)', async () => {
    const project = makeMiniProject();
    const results = [];
    const handle = runGeneratorInWorker({
      project,
      activeTabId: 1,
      numPatterns: 2,
      baseSeed: 42,
      onPattern: (i, r) => results.push(r),
    });
    await handle.done;
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.solution).not.toBeNull();
      expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('堀上');
    }
  });

  it('handle.done を await すると numPatterns 回の onPattern 完了後に resolve', async () => {
    const project = makeMiniProject();
    const callIndices = [];
    const handle = runGeneratorInWorker({
      project,
      activeTabId: 1,
      numPatterns: 4,
      baseSeed: 1,
      onPattern: (i) => callIndices.push(i),
    });
    await handle.done;
    // 4 回正しい順序で呼ばれていることを検証
    expect(callIndices).toEqual([0, 1, 2, 3]);
  });

  it('cancel API は呼べる (sync fallback では no-op 相当)', () => {
    const project = makeMiniProject();
    const handle = runGeneratorInWorker({
      project, activeTabId: 1, numPatterns: 1, baseSeed: 1, onPattern: vi.fn(),
    });
    expect(() => handle.cancel()).not.toThrow();
  });
});
