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

describe('summarizeUnfilled — クラス別の不足集計 (§M)', () => {
  it('あるクラスの超過が別クラスの不足を相殺しない', () => {
    const config2 = {
      dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
      periods: [{ id: 1, label: '1限' }],
      classes: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }],
      subjectCounts: { '数学': 1 },
    };
    // A は数学 2 (超過 subjectOver 状態)、B は数学 0 → B の 1 コマ不足は表示すべき
    const { shortages } = summarizeUnfilled({
      [makeKey(1, 1, 1)]: { subject: '数学', teacher: '田中' },
      [makeKey(2, 1, 1)]: { subject: '数学', teacher: '田中' },
    }, config2);
    expect(shortages).toEqual([{ subject: '数学', missing: 1 }]);
  });
});
