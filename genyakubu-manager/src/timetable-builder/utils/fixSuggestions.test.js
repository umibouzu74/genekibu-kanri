import { describe, expect, it } from 'vitest';
import { suggestForNoTeacher, suggestForCapacity, buildFixSuggestions } from './fixSuggestions';

const teacher = (name, subjects, ngSlots = []) => ({ name, subjects, ngSlots });
const config = {
  dates: [{ id: 1, label: '12/25' }],
  periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
  classes: [{ id: 1, label: 'A' }],
};
const texts = (arr) => arr.map(s => s.text);

describe('suggestForNoTeacher', () => {
  it('担当できる講師が居ない場合は登録を促す (action なし)', () => {
    const out = suggestForNoTeacher(
      { date: '12/25', period: '1限', subject: '数学' },
      { currentConfig: config, teachers: [teacher('堀上', ['英語'])] },
    );
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain('担当できる講師が居ません');
    expect(out[0].action).toBeUndefined();
  });

  it('手動 NG の講師は releaseNg アクション付きで提案 (名前入り)', () => {
    const out = suggestForNoTeacher(
      { date: '12/25', period: '1限', subject: '英語' },
      { currentConfig: config, teachers: [teacher('堀上', ['英語'], ['12/25-1限'])] },
    );
    const ng = out.find(s => s.action?.type === 'releaseNg');
    expect(ng).toBeTruthy();
    expect(ng.text).toContain('堀上');
    expect(ng.action).toEqual({ type: 'releaseNg', teacherName: '堀上', date: '12/25', period: '1限' });
  });

  it('別の時限で担当可能なら移動を提案 (action なしのヒント)', () => {
    const out = suggestForNoTeacher(
      { date: '12/25', period: '1限', subject: '英語' },
      { currentConfig: config, teachers: [teacher('堀上', ['英語'], ['12/25-1限'])] },
    );
    const alt = out.find(s => s.text.includes('別の時限'));
    expect(alt).toBeTruthy();
    expect(alt.text).toContain('2限');
    expect(alt.action).toBeUndefined();
  });

  it('自動 NG も考慮する (autoNgByTeacher)', () => {
    const autoNg = new Map([['堀上', new Set(['12/25-2限'])]]);
    const out = suggestForNoTeacher(
      { date: '12/25', period: '1限', subject: '英語' },
      { currentConfig: config, teachers: [teacher('堀上', ['英語'], ['12/25-1限'])], autoNgByTeacher: autoNg },
    );
    expect(out.some(s => s.text.includes('別の時限'))).toBe(false);
  });

  it('「未定」は担当候補に数えない', () => {
    const out = suggestForNoTeacher(
      { date: '12/25', period: '1限', subject: '数学' },
      { currentConfig: config, teachers: [teacher('未定', ['英語', '数学'])] },
    );
    expect(out[0].text).toContain('担当できる講師が居ません');
  });
});

describe('suggestForCapacity', () => {
  it('講師を増やす / 上限を上げる(適用可) / コマ数を減らす を提案', () => {
    const out = suggestForCapacity(
      { subject: '英語', demand: 50, capacity: 36, teacherCount: 1 },
      { currentConfig: { ...config, dates: [1, 2, 3, 4, 5, 6].map(id => ({ id, label: `d${id}` })) }, maxDailyHours: 6 },
    );
    expect(texts(out).some(t => t.includes('あと 1 名'))).toBe(true);
    const setMax = out.find(s => s.action?.type === 'setMaxDaily');
    expect(setMax.text).toContain('1日コマ数上限を 6 → 9');
    expect(setMax.action).toEqual({ type: 'setMaxDaily', value: 9 });
    expect(texts(out).some(t => t.includes('コマ数を減らす'))).toBe(true);
  });

  it('setMaxDaily 提案は上限 (12) を超えない & toast と一致する値にする', () => {
    const out = suggestForCapacity(
      { subject: '英語', demand: 300, capacity: 60, teacherCount: 1 },
      { currentConfig: { ...config, dates: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, label: `d${i}` })) }, maxDailyHours: 6 },
    );
    const setMax = out.find(s => s.action?.type === 'setMaxDaily');
    // neededMax = ceil(300/10) = 30 → clamp 12
    expect(setMax.action.value).toBe(12);
    expect(setMax.text).toContain('→ 12');
  });

  it('teacherCount 0 でも落ちず、コマ数削減は提案する', () => {
    const out = suggestForCapacity(
      { subject: '理科', demand: 10, capacity: 0, teacherCount: 0 },
      { currentConfig: config, maxDailyHours: 6 },
    );
    expect(texts(out).some(t => t.includes('コマ数を減らす'))).toBe(true);
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
