import { describe, expect, it } from 'vitest';
import { scheduleContentKey, dedupePatterns } from './patternDedupe';

describe('scheduleContentKey', () => {
  it('キー順が違っても同一内容なら同じキーになる', () => {
    const a = {
      'd1-p1-c1': { subject: '英語', teacher: '田中' },
      'd1-p2-c1': { subject: '数学', teacher: '佐藤' },
    };
    const b = {
      'd1-p2-c1': { subject: '数学', teacher: '佐藤' },
      'd1-p1-c1': { subject: '英語', teacher: '田中' },
    };
    expect(scheduleContentKey(a)).toBe(scheduleContentKey(b));
  });

  it('locked 等の付帯フラグは同一性に影響しない', () => {
    const a = { 'd1-p1-c1': { subject: '英語', teacher: '田中' } };
    const b = { 'd1-p1-c1': { subject: '英語', teacher: '田中', locked: true } };
    expect(scheduleContentKey(a)).toBe(scheduleContentKey(b));
  });

  it('subject も teacher も無い空 entry は無視される', () => {
    const a = { 'd1-p1-c1': { subject: '英語', teacher: '田中' } };
    const b = {
      'd1-p1-c1': { subject: '英語', teacher: '田中' },
      'd1-p2-c1': {},
    };
    expect(scheduleContentKey(a)).toBe(scheduleContentKey(b));
  });

  it('担当講師が違えば別キー', () => {
    const a = { 'd1-p1-c1': { subject: '英語', teacher: '田中' } };
    const b = { 'd1-p1-c1': { subject: '英語', teacher: '佐藤' } };
    expect(scheduleContentKey(a)).not.toBe(scheduleContentKey(b));
  });
});

describe('dedupePatterns', () => {
  const pat = (schedule, extra = {}) => ({ schedule, isPartial: false, ...extra });

  it('同一内容の案を 1 件にまとめ duplicateCount を数える', () => {
    const s1 = { 'd1-p1-c1': { subject: '英語', teacher: '田中' } };
    const s2 = { 'd1-p1-c1': { subject: '数学', teacher: '佐藤' } };
    const result = dedupePatterns([pat(s1), pat({ ...s1 }), pat(s2)]);
    expect(result).toHaveLength(2);
    expect(result[0].duplicateCount).toBe(2);
    expect(result[1].duplicateCount).toBe(1);
  });

  it('先頭出現を残す (呼び出し側のソート順を尊重)', () => {
    const s1 = { 'd1-p1-c1': { subject: '英語', teacher: '田中' } };
    const result = dedupePatterns([
      pat(s1, { label: 'first' }),
      pat({ ...s1 }, { label: 'second' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('first');
  });

  it('全て異なる案はそのまま (duplicateCount=1)', () => {
    const result = dedupePatterns([
      pat({ 'd1-p1-c1': { subject: '英語', teacher: '田中' } }),
      pat({ 'd1-p1-c1': { subject: '英語', teacher: '佐藤' } }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.every(p => p.duplicateCount === 1)).toBe(true);
  });

  it('空配列は空配列を返す', () => {
    expect(dedupePatterns([])).toEqual([]);
  });
});
