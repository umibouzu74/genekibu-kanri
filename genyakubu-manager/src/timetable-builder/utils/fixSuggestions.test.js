import { describe, expect, it } from 'vitest';
import { suggestForNoTeacher, suggestForCapacity, buildFixSuggestions } from './fixSuggestions';

const teacher = (name, subjects, ngSlots = []) => ({ name, subjects, ngSlots });
const config = {
  dates: [{ id: 1, label: '12/25' }],
  periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
  classes: [{ id: 1, label: 'A' }],
};

describe('suggestForNoTeacher', () => {
  it('担当できる講師が居ない場合は登録を促す', () => {
    const out = suggestForNoTeacher(
      { date: '12/25', period: '1限', subject: '数学' },
      { currentConfig: config, teachers: [teacher('堀上', ['英語'])] },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('担当できる講師が居ません');
  });

  it('手動 NG の講師が居れば NG 解除を提案 (名前入り)', () => {
    const out = suggestForNoTeacher(
      { date: '12/25', period: '1限', subject: '英語' },
      { currentConfig: config, teachers: [teacher('堀上', ['英語'], ['12/25-1限'])] },
    );
    expect(out.some(s => s.includes('NG を解除') && s.includes('堀上'))).toBe(true);
  });

  it('別の時限で担当可能なら移動を提案', () => {
    const out = suggestForNoTeacher(
      { date: '12/25', period: '1限', subject: '英語' },
      { currentConfig: config, teachers: [teacher('堀上', ['英語'], ['12/25-1限'])] },
    );
    expect(out.some(s => s.includes('別の時限') && s.includes('2限'))).toBe(true);
  });

  it('自動 NG も考慮する (autoNgByTeacher)', () => {
    // 堀上は 1限 手動 NG、2限 は自動 NG → 移動先候補が無くなる
    const autoNg = new Map([['堀上', new Set(['12/25-2限'])]]);
    const out = suggestForNoTeacher(
      { date: '12/25', period: '1限', subject: '英語' },
      { currentConfig: config, teachers: [teacher('堀上', ['英語'], ['12/25-1限'])], autoNgByTeacher: autoNg },
    );
    expect(out.some(s => s.includes('別の時限'))).toBe(false);
  });

  it('「未定」は担当候補に数えない', () => {
    const out = suggestForNoTeacher(
      { date: '12/25', period: '1限', subject: '数学' },
      { currentConfig: config, teachers: [teacher('未定', ['英語', '数学'])] },
    );
    expect(out[0]).toContain('担当できる講師が居ません');
  });
});

describe('suggestForCapacity', () => {
  it('講師を増やす / 上限を上げる / コマ数を減らす を提案', () => {
    const out = suggestForCapacity(
      { subject: '英語', demand: 50, capacity: 36, teacherCount: 1 },
      { currentConfig: { ...config, dates: [1, 2, 3, 4, 5, 6].map(id => ({ id, label: `d${id}` })) }, maxDailyHours: 6 },
    );
    expect(out.some(s => s.includes('あと 1 名'))).toBe(true);
    expect(out.some(s => s.includes('1日コマ数上限を 6 → 9'))).toBe(true);
    expect(out.some(s => s.includes('コマ数を減らす'))).toBe(true);
  });

  it('teacherCount 0 でも落ちず、コマ数削減は提案する', () => {
    const out = suggestForCapacity(
      { subject: '理科', demand: 10, capacity: 0, teacherCount: 0 },
      { currentConfig: config, maxDailyHours: 6 },
    );
    expect(out.some(s => s.includes('コマ数を減らす'))).toBe(true);
  });
});

describe('buildFixSuggestions', () => {
  const infeas = {
    noTeacherForSlot: { count: 1, items: [{ date: '12/25', period: '1限', subject: '数学' }] },
    subjectCapacityShortage: { count: 1, items: [{ subject: '英語', demand: 50, capacity: 36, teacherCount: 1 }] },
  };

  it('各 item に suggestions を付与する', () => {
    const out = buildFixSuggestions(infeas, { currentConfig: config, teachers: [teacher('堀上', ['英語'])], maxDailyHours: 6 });
    expect(out.noTeacherForSlot.items[0].suggestions.length).toBeGreaterThan(0);
    expect(out.subjectCapacityShortage.items[0].suggestions.length).toBeGreaterThan(0);
    // count はそのまま
    expect(out.noTeacherForSlot.count).toBe(1);
  });

  it('元のオブジェクトを破壊しない', () => {
    buildFixSuggestions(infeas, { currentConfig: config, teachers: [], maxDailyHours: 6 });
    expect(infeas.noTeacherForSlot.items[0].suggestions).toBeUndefined();
  });

  it('null / undefined はそのまま返す', () => {
    expect(buildFixSuggestions(null)).toBeNull();
  });

  it('items が空でも落ちない', () => {
    const out = buildFixSuggestions(
      { noTeacherForSlot: { count: 0, items: [] }, subjectCapacityShortage: { count: 0, items: [] } },
      { currentConfig: config, teachers: [], maxDailyHours: 6 },
    );
    expect(out.noTeacherForSlot.items).toEqual([]);
  });
});
