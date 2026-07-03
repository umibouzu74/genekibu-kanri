import { describe, expect, it } from 'vitest';
import { buildTeachersCsvTemplate, buildNgCsvTemplate } from './csvTemplates';

describe('buildTeachersCsvTemplate (L4f)', () => {
  it('ヘッダ + 現在の科目名を埋めた例示行を返す', () => {
    const csv = buildTeachersCsvTemplate(['英語', '数学', '国語']);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name,subjects');
    expect(lines[1]).toBe('堀上,英語');
    expect(lines[2]).toBe('山田,英語|数学');
    expect(lines[3]).toBe('未定,英語|数学|国語');
  });

  it('科目が無くてもデフォルトで壊れない', () => {
    const csv = buildTeachersCsvTemplate([]);
    expect(csv).toContain('name,subjects');
    expect(csv).toContain('堀上,英語');
  });
});

describe('buildNgCsvTemplate (L4f)', () => {
  it('現在の講師・日付・時限ラベルを埋めた例示行を返す', () => {
    const csv = buildNgCsvTemplate(['未定', '田上'], ['7/22(火)', '7/23(水)'], ['A', 'B']);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name,date,period');
    // '未定' は例示に使わない (実在の講師名を優先)
    expect(lines[1]).toBe('田上,7/22(火),A');
    expect(lines[2]).toBe('田上,7/22(火),B');
    expect(lines[3]).toBe('田上,7/23(水),A');
  });

  it('データが空でもデフォルトで壊れない', () => {
    const csv = buildNgCsvTemplate([], [], []);
    expect(csv.split('\n')[1]).toBe('田中,12/25,1限');
  });
});
