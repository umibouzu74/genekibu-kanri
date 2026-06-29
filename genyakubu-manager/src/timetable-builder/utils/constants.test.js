import { describe, expect, it } from 'vitest';
import {
  clampGenerationParam,
  resolveGenerationParams,
  GENERATION_PARAM_BOUNDS,
  DEFAULT_NUM_PATTERNS,
  DEFAULT_MAX_DAILY_HOURS,
  DEFAULT_MAX_ITERATIONS,
} from './constants';

describe('clampGenerationParam', () => {
  it('範囲内の値はそのまま返す', () => {
    expect(clampGenerationParam('numPatterns', 3)).toBe(3);
    expect(clampGenerationParam('maxDailyHours', 6)).toBe(6);
    expect(clampGenerationParam('maxIterations', 500000)).toBe(500000);
  });

  it('下限未満は min に丸める', () => {
    expect(clampGenerationParam('numPatterns', 0)).toBe(GENERATION_PARAM_BOUNDS.numPatterns.min);
    expect(clampGenerationParam('maxDailyHours', -5)).toBe(GENERATION_PARAM_BOUNDS.maxDailyHours.min);
    expect(clampGenerationParam('maxIterations', 1)).toBe(GENERATION_PARAM_BOUNDS.maxIterations.min);
  });

  it('上限超過は max に丸める', () => {
    expect(clampGenerationParam('numPatterns', 99)).toBe(GENERATION_PARAM_BOUNDS.numPatterns.max);
    expect(clampGenerationParam('maxDailyHours', 99)).toBe(GENERATION_PARAM_BOUNDS.maxDailyHours.max);
    expect(clampGenerationParam('maxIterations', 9e9)).toBe(GENERATION_PARAM_BOUNDS.maxIterations.max);
  });

  it('小数は四捨五入する', () => {
    expect(clampGenerationParam('numPatterns', 2.4)).toBe(2);
    expect(clampGenerationParam('numPatterns', 2.6)).toBe(3);
  });

  it('NaN / 非数は min にフォールバックする', () => {
    expect(clampGenerationParam('numPatterns', NaN)).toBe(GENERATION_PARAM_BOUNDS.numPatterns.min);
    expect(clampGenerationParam('numPatterns', 'abc')).toBe(GENERATION_PARAM_BOUNDS.numPatterns.min);
  });

  it('未知のキーは素通しする', () => {
    expect(clampGenerationParam('unknown', 42)).toBe(42);
  });
});

describe('resolveGenerationParams', () => {
  it('未設定はデフォルトを返す', () => {
    const r = resolveGenerationParams({});
    expect(r).toEqual({
      numPatterns: DEFAULT_NUM_PATTERNS,
      maxDailyHours: DEFAULT_MAX_DAILY_HOURS,
      maxIterations: DEFAULT_MAX_ITERATIONS,
    });
  });

  it('null / undefined project でもデフォルトを返す', () => {
    expect(resolveGenerationParams(null).numPatterns).toBe(DEFAULT_NUM_PATTERNS);
    expect(resolveGenerationParams(undefined).maxDailyHours).toBe(DEFAULT_MAX_DAILY_HOURS);
  });

  it('設定済みの値を反映する', () => {
    const r = resolveGenerationParams({ numPatterns: 5, maxDailyHours: 8, maxIterations: 100000 });
    expect(r).toEqual({ numPatterns: 5, maxDailyHours: 8, maxIterations: 100000 });
  });

  it('保存済みの範囲外値も clamp して返す (壊れたデータへの保険)', () => {
    const r = resolveGenerationParams({ numPatterns: 999, maxDailyHours: 0 });
    expect(r.numPatterns).toBe(GENERATION_PARAM_BOUNDS.numPatterns.max);
    expect(r.maxDailyHours).toBe(GENERATION_PARAM_BOUNDS.maxDailyHours.min);
  });
});
