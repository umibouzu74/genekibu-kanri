import { describe, expect, it } from 'vitest';
import { summarizePatternLoad, summarizeSingleSlotDays } from './patternLoad';

describe('summarizePatternLoad', () => {
  it('均等な配分は spread 0', () => {
    expect(summarizePatternLoad({ A: 4, B: 4, C: 4 })).toEqual({
      teacherCount: 3, max: 4, min: 4, spread: 0,
    });
  });

  it('偏りがあれば spread = 最多 - 最少', () => {
    expect(summarizePatternLoad({ A: 6, B: 4, C: 1 })).toEqual({
      teacherCount: 3, max: 6, min: 1, spread: 5,
    });
  });

  it('0 コマの講師は対象外', () => {
    expect(summarizePatternLoad({ A: 5, B: 0, C: 3 })).toEqual({
      teacherCount: 2, max: 5, min: 3, spread: 2,
    });
  });

  it('対象講師ゼロなら全て 0', () => {
    expect(summarizePatternLoad({})).toEqual({ teacherCount: 0, max: 0, min: 0, spread: 0 });
    expect(summarizePatternLoad({ A: 0 })).toEqual({ teacherCount: 0, max: 0, min: 0, spread: 0 });
  });

  it('null / undefined でも落ちない', () => {
    expect(summarizePatternLoad(null)).toEqual({ teacherCount: 0, max: 0, min: 0, spread: 0 });
    expect(summarizePatternLoad(undefined)).toEqual({ teacherCount: 0, max: 0, min: 0, spread: 0 });
  });

  it('1 人だけなら spread 0', () => {
    expect(summarizePatternLoad({ A: 7 })).toEqual({ teacherCount: 1, max: 7, min: 7, spread: 0 });
  });
});

describe('summarizeSingleSlotDays (N3f)', () => {
  const config = {
    dates: [{ id: 1, label: '7/29' }, { id: 2, label: '7/30' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    classes: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }],
  };

  it('その日 1 コマだけの講師と日付を返す', () => {
    const schedule = {
      'd1-p1-c1': { subject: '英語', teacher: '田中' }, // 7/29 は 1 コマのみ
      'd2-p1-c1': { subject: '英語', teacher: '田中' }, // 7/30 は 2 コマ
      'd2-p2-c1': { subject: '英語', teacher: '田中' },
      'd1-p1-c2': { subject: '数学', teacher: '佐藤' }, // 7/29 に 1 コマのみ
    };
    const result = summarizeSingleSlotDays(schedule, config, []);
    expect(result).toEqual(expect.arrayContaining([
      { teacher: '田中', days: ['7/29'] },
      { teacher: '佐藤', days: ['7/29'] },
    ]));
    expect(result).toHaveLength(2);
  });

  it('未定は対象外・全日 2 コマ以上の講師は含まれない', () => {
    const schedule = {
      'd1-p1-c1': { subject: '英語', teacher: '未定' },
      'd1-p1-c2': { subject: '数学', teacher: '佐藤' },
      'd1-p2-c1': { subject: '数学', teacher: '佐藤' },
    };
    expect(summarizeSingleSlotDays(schedule, config, [])).toEqual([]);
  });

  it('合同グループは 1 コマ扱い (2 クラス同時でも飛び石と判定)', () => {
    const schedule = {
      'd1-p1-c1': { subject: '英語', teacher: '田中' },
      'd1-p1-c2': { subject: '英語', teacher: '田中' }, // 合同の非 primary
    };
    const groups = [{ id: 1, subject: '英語', classes: ['A', 'B'], dates: null }];
    expect(summarizeSingleSlotDays(schedule, config, groups)).toEqual([
      { teacher: '田中', days: ['7/29'] },
    ]);
    // 合同でなければ同時限 2 クラスで 2 コマ = 飛び石ではない
    expect(summarizeSingleSlotDays(schedule, config, [])).toEqual([]);
  });

  it('空 schedule / null でも落ちない', () => {
    expect(summarizeSingleSlotDays({}, config, [])).toEqual([]);
    expect(summarizeSingleSlotDays(null, config, [])).toEqual([]);
  });
});
