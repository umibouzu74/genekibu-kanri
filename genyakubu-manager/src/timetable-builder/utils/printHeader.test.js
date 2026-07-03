import { describe, expect, it } from 'vitest';
import { formatPrintDateJa } from './printHeader';

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
