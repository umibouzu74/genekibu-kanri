import { describe, expect, it } from 'vitest';
import { diffSchedules, summarizeDiff } from './scheduleDiff';

const cell = (subject, teacher, locked = false) => ({ subject, teacher, locked });

describe('diffSchedules', () => {
  it('同一なら差分なし', () => {
    const a = { k1: cell('英語', '堀上'), k2: cell('数学', '片岡') };
    const b = { k1: cell('英語', '堀上'), k2: cell('数学', '片岡') };
    expect(diffSchedules(a, b)).toEqual([]);
  });

  it('locked の違いは無視する (subject/teacher が同じなら差分なし)', () => {
    const a = { k1: cell('英語', '堀上', false) };
    const b = { k1: cell('英語', '堀上', true) };
    expect(diffSchedules(a, b)).toEqual([]);
  });

  it('to にのみあるセルは added', () => {
    const diffs = diffSchedules({}, { k1: cell('英語', '堀上') });
    expect(diffs).toEqual([
      { key: 'k1', type: 'added', before: null, after: { subject: '英語', teacher: '堀上' } },
    ]);
  });

  it('from にのみあるセルは removed', () => {
    const diffs = diffSchedules({ k1: cell('英語', '堀上') }, {});
    expect(diffs).toEqual([
      { key: 'k1', type: 'removed', before: { subject: '英語', teacher: '堀上' }, after: null },
    ]);
  });

  it('subject か teacher が違えば changed', () => {
    const diffs = diffSchedules({ k1: cell('英語', '堀上') }, { k1: cell('英語', '石原') });
    expect(diffs).toEqual([
      { key: 'k1', type: 'changed', before: { subject: '英語', teacher: '堀上' }, after: { subject: '英語', teacher: '石原' } },
    ]);
  });

  it('subject 空のセルは未割当として扱う (added/removed の判定)', () => {
    expect(diffSchedules({ k1: cell('', '') }, { k1: cell('英語', '堀上') }))
      .toEqual([{ key: 'k1', type: 'added', before: null, after: { subject: '英語', teacher: '堀上' } }]);
    expect(diffSchedules({ k1: cell('英語', '堀上') }, { k1: cell('', '') }))
      .toEqual([{ key: 'k1', type: 'removed', before: { subject: '英語', teacher: '堀上' }, after: null }]);
  });

  it('teacher 未指定は空文字で正規化', () => {
    const diffs = diffSchedules({ k1: { subject: '英語' } }, { k1: { subject: '英語', teacher: '堀上' } });
    expect(diffs[0]).toMatchObject({ type: 'changed', before: { subject: '英語', teacher: '' } });
  });

  it('null / undefined を渡しても落ちない', () => {
    expect(diffSchedules(null, null)).toEqual([]);
    expect(diffSchedules(undefined, { k1: cell('英語', '堀上') })).toHaveLength(1);
  });
});

describe('summarizeDiff', () => {
  it('種別ごとに集計する', () => {
    const diffs = [
      { key: 'a', type: 'added' },
      { key: 'b', type: 'added' },
      { key: 'c', type: 'removed' },
      { key: 'd', type: 'changed' },
    ];
    expect(summarizeDiff(diffs)).toEqual({ added: 2, removed: 1, changed: 1, total: 4 });
  });

  it('空配列は全て 0', () => {
    expect(summarizeDiff([])).toEqual({ added: 0, removed: 0, changed: 0, total: 0 });
  });
});
