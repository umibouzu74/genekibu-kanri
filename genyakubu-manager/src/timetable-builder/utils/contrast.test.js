import { describe, expect, it } from 'vitest';
import {
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  meetsAA,
  AA_NORMAL,
  AA_LARGE,
} from './contrast';

// tailwind.config.js の builder-* トークンと同期。色を変えたらここも更新する。
const T = {
  bg: '#f0f1f3',
  surface: '#ffffff',
  surfaceAlt: '#f8f9fa',
  ink: '#1a1a2e',
  inkMuted: '#666666',
  primary: '#1a1a2e',
  blue: '#2e6a9e',
  green: '#2a7a4a',
  red: '#c03030',
  orange: '#c2410c',
  white: '#ffffff',
  dangerSoft: '#fff5f5',
  warningSoft: '#fffbe6',
  successSoft: '#e8f5e8',
  infoSoft: '#eef2ff',
};

describe('contrast helpers', () => {
  it('hexToRgb: 6桁 / 3桁 / # 有無', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('hexToRgb: 不正な色は throw', () => {
    expect(() => hexToRgb('#zzz')).toThrow();
    expect(() => hexToRgb('blue')).toThrow();
  });

  it('relativeLuminance: 黒 0 / 白 1', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('contrastRatio: 白黒は 21:1、順序非依存', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });

  it('meetsAA: しきい値判定', () => {
    expect(meetsAA('#000000', '#ffffff')).toBe(true);
    expect(meetsAA('#777777', '#888888')).toBe(false);
    expect(AA_NORMAL).toBe(4.5);
    expect(AA_LARGE).toBe(3);
  });
});

describe('builder トークンの WCAG AA 準拠 (E1e)', () => {
  // 「読めるテキスト」配色は通常テキスト基準 (4.5:1) を満たすこと。
  const normalTextPairs = [
    ['ink / surface', T.ink, T.surface],
    ['ink / surfaceAlt', T.ink, T.surfaceAlt],
    ['ink / bg', T.ink, T.bg],
    ['inkMuted / surface', T.inkMuted, T.surface],
    ['inkMuted / surfaceAlt', T.inkMuted, T.surfaceAlt],
    ['inkMuted / bg', T.inkMuted, T.bg],
    ['blue / surface', T.blue, T.surface],
    ['blue / surfaceAlt', T.blue, T.surfaceAlt],
    ['green / surface', T.green, T.surface],
    ['green / successSoft', T.green, T.successSoft],
    ['red / surface', T.red, T.surface],
    ['red / dangerSoft', T.red, T.dangerSoft],
    ['orange / surface', T.orange, T.surface],
    ['orange / warningSoft', T.orange, T.warningSoft],
    // 色付きボタンの白文字
    ['white / primary', T.white, T.primary],
    ['white / blue', T.white, T.blue],
    ['white / green', T.white, T.green],
    ['white / red', T.white, T.red],
    ['white / orange', T.white, T.orange],
    // soft 背景上のインク
    ['ink / infoSoft', T.ink, T.infoSoft],
    ['ink / warningSoft', T.ink, T.warningSoft],
  ];

  it.each(normalTextPairs)('%s が 4.5:1 以上', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('回帰防止: orange は白背景で旧値 (#e67a00 = 2.94) を超え AA を満たす', () => {
    expect(contrastRatio(T.orange, T.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio('#e67a00', T.surface)).toBeLessThan(AA_NORMAL); // 旧値は未達だった
  });
});
