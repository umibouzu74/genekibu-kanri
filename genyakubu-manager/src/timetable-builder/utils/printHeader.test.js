import { describe, expect, it } from 'vitest';
import { USUAL_TEACHER_LEGEND, buildPrintLegend, buildPrintTitle, formatPrintDateJa, hasUsualLinks } from './printHeader';

describe('formatPrintDateJa (L1f)', () => {
  it('和式 YYYY年MM月DD日（曜）で整形する', () => {
    expect(formatPrintDateJa(new Date(2026, 6, 3))).toBe('2026年07月03日（金）');
  });

  it('1 桁の月日は 0 埋めする', () => {
    expect(formatPrintDateJa(new Date(2026, 0, 5))).toBe('2026年01月05日（月）');
  });

  it('日曜日を正しく表示する', () => {
    expect(formatPrintDateJa(new Date(2026, 6, 5))).toBe('2026年07月05日（日）');
  });
});

describe('buildPrintTitle (L2g)', () => {
  it('強調があれば【強調: ◯◯】を付ける', () => {
    expect(buildPrintTitle('2026 冬期講習 中123', '中3', { kind: 'subject', value: '国語' }))
      .toBe('2026 冬期講習 中123 — 中3【強調: 国語】');
    expect(buildPrintTitle('2026 冬期講習 中123', '中3', { kind: 'teacher', value: '堀上' }))
      .toBe('2026 冬期講習 中123 — 中3【強調: 堀上】');
  });

  it('強調なしは従来どおり', () => {
    expect(buildPrintTitle('2026 冬期講習 中123', '中3', null)).toBe('2026 冬期講習 中123 — 中3');
    expect(buildPrintTitle('冬期講習', null, null)).toBe('冬期講習');
  });
});

describe('buildPrintLegend (L2g)', () => {
  it('強調と ★ の説明を並べる', () => {
    expect(buildPrintLegend({ kind: 'subject', value: '国語' }, { showUsual: true })).toEqual([
      '太枠 = 国語のコマ / 薄い表示 = それ以外',
      USUAL_TEACHER_LEGEND,
    ]);
  });

  it('強調なしは ★ の説明だけ、★ が出ないタブでは空', () => {
    expect(buildPrintLegend(null, { showUsual: true })).toEqual([USUAL_TEACHER_LEGEND]);
    expect(buildPrintLegend(null, { showUsual: false })).toEqual([]);
    expect(buildPrintLegend({ kind: 'teacher', value: '堀上' }, { showUsual: false })).toEqual([
      '太枠 = 堀上のコマ / 薄い表示 = それ以外',
    ]);
  });

  it('★ の説明は普段の担当の判定と同じ言い方', () => {
    expect(USUAL_TEACHER_LEGEND).toBe('★ = 普段 (通常授業) このクラスのこの科目を担当している講師');
  });
});

describe('hasUsualLinks', () => {
  it('普段のクラスに結び付けたクラスが 1 つでもあれば true', () => {
    expect(hasUsualLinks([{ id: 1 }, { id: 2, regular: { grade: '中3', classes: ['S'] } }])).toBe(true);
    expect(hasUsualLinks([{ id: 1 }, { id: 2, regular: { grade: '', classes: [] } }])).toBe(false);
    expect(hasUsualLinks([])).toBe(false);
    expect(hasUsualLinks(undefined)).toBe(false);
  });
});
