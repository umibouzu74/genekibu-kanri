import { describe, expect, it } from 'vitest';
import { quotaForClass, quotasForClass, hasClassQuotaMode, hasClassQuotaOverrides } from './subjectQuota';

const config = {
  subjectCounts: { '英語': 9, '数学': 9, '国語': 8 },
  classSubjectCounts: {
    // classId=2 (中2 クラス想定): 英数を 8 に上書き、国語は共通値のまま
    '2': { '英語': 8, '数学': 8 },
  },
};

describe('quotaForClass', () => {
  it('上書きの無いクラスは共通値 (subjectCounts) を返す', () => {
    expect(quotaForClass(config, 1, '英語')).toBe(9);
    expect(quotaForClass(config, 1, '国語')).toBe(8);
  });

  it('上書きのあるクラス × 科目は上書き値を返す', () => {
    expect(quotaForClass(config, 2, '英語')).toBe(8);
    expect(quotaForClass(config, 2, '数学')).toBe(8);
  });

  it('上書きマップにあるクラスでも、無い科目は共通値へフォールバック', () => {
    expect(quotaForClass(config, 2, '国語')).toBe(8);
  });

  it('未知の科目・classSubjectCounts 未設定・config null は 0 / 共通値', () => {
    expect(quotaForClass(config, 1, '理科')).toBe(0);
    expect(quotaForClass({ subjectCounts: { '英語': 4 } }, 1, '英語')).toBe(4);
    expect(quotaForClass(null, 1, '英語')).toBe(0);
  });

  it('上書き 0 は「0 コマ」として有効 (フォールバックしない)', () => {
    const cfg = { subjectCounts: { '英語': 9 }, classSubjectCounts: { '1': { '英語': 0 } } };
    expect(quotaForClass(cfg, 1, '英語')).toBe(0);
  });

  it('数値でない上書き (外部 JSON の型崩れ) は共通値へフォールバック', () => {
    const cfg = { subjectCounts: { '英語': 9 }, classSubjectCounts: { '1': { '英語': 'x' } } };
    expect(quotaForClass(cfg, 1, '英語')).toBe(9);
  });
});

describe('quotasForClass', () => {
  it('上書きの無いクラスは subjectCounts と同じ値を返す', () => {
    expect(quotasForClass(config, 1)).toEqual({ '英語': 9, '数学': 9, '国語': 8 });
  });

  it('共通値の型崩れ (文字列・負数) は 0 に防御する', () => {
    const cfg = { subjectCounts: { '英語': '4', '数学': -2 } };
    expect(quotaForClass(cfg, 1, '数学')).toBe(0);
    expect(quotasForClass(cfg, 1)).toEqual({ '英語': 4, '数学': 0 });
  });

  it('上書きのあるクラスは merge したマップを返す (元 config は不変)', () => {
    expect(quotasForClass(config, 2)).toEqual({ '英語': 8, '数学': 8, '国語': 8 });
    expect(config.subjectCounts['英語']).toBe(9);
  });

  it('上書きマップだけにある科目キーも含める', () => {
    const cfg = { subjectCounts: { '英語': 4 }, classSubjectCounts: { '1': { '情報': 2 } } };
    expect(quotasForClass(cfg, 1)).toEqual({ '英語': 4, '情報': 2 });
  });
});

describe('hasClassQuotaMode / hasClassQuotaOverrides', () => {
  it('classSubjectCounts 未設定はモードオフ・上書きなし', () => {
    const cfg = { subjectCounts: {} };
    expect(hasClassQuotaMode(cfg)).toBe(false);
    expect(hasClassQuotaOverrides(cfg)).toBe(false);
  });

  it('{} はモードオンだが上書きなし', () => {
    const cfg = { subjectCounts: {}, classSubjectCounts: {} };
    expect(hasClassQuotaMode(cfg)).toBe(true);
    expect(hasClassQuotaOverrides(cfg)).toBe(false);
  });

  it('エントリがあれば上書きあり (空マップのクラスは数えない)', () => {
    expect(hasClassQuotaOverrides({ subjectCounts: {}, classSubjectCounts: { '1': {} } })).toBe(false);
    expect(hasClassQuotaOverrides(config)).toBe(true);
  });
});
