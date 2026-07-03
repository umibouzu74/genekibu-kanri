import { describe, expect, it } from 'vitest';
import { summarizeUnfilled } from './partialSummary';
import { makeKey } from './scheduleKey';

const config = {
  dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
  periods: [{ id: 1, label: '1限' }],
  classes: [{ id: 1, label: 'A' }],
  subjectCounts: { '英語': 2 },
};

describe('summarizeUnfilled (L3e)', () => {
  it('埋まっていないセルを列挙し、科目別の不足を返す', () => {
    const { cells, shortages } = summarizeUnfilled({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
    }, config);
    expect(cells).toEqual([
      { key: makeKey(2, 1, 1), date: '12/26', period: '1限', className: 'A' },
    ]);
    expect(shortages).toEqual([{ subject: '英語', missing: 1 }]);
  });

  it('全て埋まっていれば空 (完全解)', () => {
    const { cells, shortages } = summarizeUnfilled({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(2, 1, 1)]: { subject: '英語', teacher: '堀上' },
    }, config);
    expect(cells).toEqual([]);
    expect(shortages).toEqual([]);
  });

  it('空 + locked (空けておく) は未充填に数えない (F5w)', () => {
    const { cells } = summarizeUnfilled({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(2, 1, 1)]: { locked: true },
    }, config);
    expect(cells).toEqual([]);
  });

  it('科目のみ (講師なし) のセルは未充填だが、科目枠としては配置済みに数える', () => {
    const { cells, shortages } = summarizeUnfilled({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '' },
    }, config);
    expect(cells.map(c => c.key)).toEqual([makeKey(1, 1, 1), makeKey(2, 1, 1)]);
    expect(shortages).toEqual([{ subject: '英語', missing: 1 }]);
  });

  it('null / undefined に対して安全', () => {
    expect(summarizeUnfilled(null, config)).toEqual({ cells: [], shortages: [] });
    expect(summarizeUnfilled({}, null)).toEqual({ cells: [], shortages: [] });
  });
});
