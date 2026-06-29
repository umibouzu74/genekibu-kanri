import { describe, expect, it } from 'vitest';
import { summarizePatternLoad } from './patternLoad';

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
