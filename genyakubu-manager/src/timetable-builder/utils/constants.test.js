import { describe, expect, it } from 'vitest';
import {
  clampGenerationParam,
  resolveGenerationParams,
  cleanSchedule,
  GENERATION_PARAM_BOUNDS,
  DEFAULT_NUM_PATTERNS,
  DEFAULT_MAX_DAILY_HOURS,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_MAX_CONSECUTIVE_PERIODS,
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

  it('maxConsecutivePeriods は 0 (制限なし) を許容', () => {
    expect(clampGenerationParam('maxConsecutivePeriods', 0)).toBe(0);
    expect(clampGenerationParam('maxConsecutivePeriods', -3)).toBe(0);
    expect(clampGenerationParam('maxConsecutivePeriods', 99)).toBe(GENERATION_PARAM_BOUNDS.maxConsecutivePeriods.max);
  });
});

describe('resolveGenerationParams', () => {
  it('未設定はデフォルトを返す', () => {
    const r = resolveGenerationParams({});
    expect(r).toEqual({
      numPatterns: DEFAULT_NUM_PATTERNS,
      maxDailyHours: DEFAULT_MAX_DAILY_HOURS,
      maxIterations: DEFAULT_MAX_ITERATIONS,
      maxConsecutivePeriods: DEFAULT_MAX_CONSECUTIVE_PERIODS,
    });
  });

  it('null / undefined project でもデフォルトを返す', () => {
    expect(resolveGenerationParams(null).numPatterns).toBe(DEFAULT_NUM_PATTERNS);
    expect(resolveGenerationParams(undefined).maxDailyHours).toBe(DEFAULT_MAX_DAILY_HOURS);
  });

  it('設定済みの値を反映する', () => {
    const r = resolveGenerationParams({ numPatterns: 5, maxDailyHours: 8, maxIterations: 100000, maxConsecutivePeriods: 3 });
    expect(r).toEqual({ numPatterns: 5, maxDailyHours: 8, maxIterations: 100000, maxConsecutivePeriods: 3 });
  });

  it('保存済みの範囲外値も clamp して返す (壊れたデータへの保険)', () => {
    const r = resolveGenerationParams({ numPatterns: 999, maxDailyHours: 0 });
    expect(r.numPatterns).toBe(GENERATION_PARAM_BOUNDS.numPatterns.max);
    expect(r.maxDailyHours).toBe(GENERATION_PARAM_BOUNDS.maxDailyHours.min);
  });
});

describe('cleanSchedule (E4a)', () => {
  // v4: dates / periods は project 共通。classes のみ tab.config。
  const DATES = [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }];
  const PERIODS = [{ id: 1, label: '1限' }];
  const tab = (schedule) => ({
    id: 1,
    name: 'メイン',
    config: {
      classes: [{ id: 1, label: 'A' }],
      subjectCounts: {},
    },
    schedule,
  });
  const proj = (...tabs) => ({ dates: DATES, periods: PERIODS, tabs });

  it('config に存在するキーは残す', () => {
    const p = proj(tab({ 'd1-p1-c1': { subject: '英語' } }));
    expect(cleanSchedule(p).tabs[0].schedule).toEqual({ 'd1-p1-c1': { subject: '英語' } });
  });

  it('消滅した date/period/class を参照するキーは破棄する', () => {
    const p = proj(tab({
      'd1-p1-c1': { subject: '英語' },
      'd9-p1-c1': { subject: '数学' },
      'd1-p9-c1': { subject: '国語' },
      'd1-p1-c9': { subject: '理科' },
    }));
    expect(Object.keys(cleanSchedule(p).tabs[0].schedule)).toEqual(['d1-p1-c1']);
  });

  it('不正な形式のキーは破棄する', () => {
    const p = proj(tab({ 'garbage': { subject: '英語' }, 'd2-p1-c1': { subject: '数学' } }));
    expect(Object.keys(cleanSchedule(p).tabs[0].schedule)).toEqual(['d2-p1-c1']);
  });

  it('複数タブを独立に処理する', () => {
    const p = proj(
      tab({ 'd1-p1-c1': { subject: 'a' } }),
      { ...tab({ 'd1-p1-c1': { subject: 'b' }, 'd9-p1-c1': { subject: 'x' } }), id: 2 },
    );
    const out = cleanSchedule(p);
    expect(Object.keys(out.tabs[0].schedule)).toEqual(['d1-p1-c1']);
    expect(Object.keys(out.tabs[1].schedule)).toEqual(['d1-p1-c1']);
  });
});
