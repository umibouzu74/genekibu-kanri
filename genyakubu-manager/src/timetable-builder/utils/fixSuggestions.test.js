import { describe, expect, it } from 'vitest';
import { suggestForNoTeacher, suggestForCapacity, buildFixSuggestions, countFatalInfeasibilities, INFEASIBILITY_KINDS } from './fixSuggestions';

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
  // 1 日に教えられる実上限は時限数を超えないため、fixture には十分な数の
  // 時限を持たせる (時限 2 つのまま maxDailyHours 6 という旧 fixture は
  // capacity 過大評価バグの上に成立していた)。
  const manyPeriods = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `p${i + 1}` }));

  it('講師を増やす / 上限を上げる(適用可) / コマ数を減らす を提案', () => {
    const out = suggestForCapacity(
      { subject: '英語', demand: 50, capacity: 36, teacherCount: 1 },
      {
        currentConfig: { ...config, dates: [1, 2, 3, 4, 5, 6].map(id => ({ id, label: `d${id}` })), periods: manyPeriods(9) },
        maxDailyHours: 6,
      },
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
      {
        currentConfig: { ...config, dates: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, label: `d${i}` })), periods: manyPeriods(12) },
        maxDailyHours: 6,
      },
    );
    const setMax = out.find(s => s.action?.type === 'setMaxDaily');
    // neededMax = ceil(300/10) = 30 → clamp 12
    expect(setMax.action.value).toBe(12);
    expect(setMax.text).toContain('→ 12');
  });

  it('時限数を超える上限引き上げは提案しない (効果が無いため)', () => {
    const out = suggestForCapacity(
      { subject: '英語', demand: 50, capacity: 36, teacherCount: 1 },
      {
        // 時限 3 つ → 上限を 6→9 に上げてもコマは 3 つしか置けない
        currentConfig: { ...config, dates: [1, 2, 3, 4, 5, 6].map(id => ({ id, label: `d${id}` })), periods: manyPeriods(3) },
        maxDailyHours: 6,
      },
    );
    expect(out.find(s => s.action?.type === 'setMaxDaily')).toBeUndefined();
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

describe('INFEASIBILITY_KINDS (F2m レジストリ)', () => {
  it('computeInfeasibilities の 5 種別を全てカバーする', () => {
    expect(INFEASIBILITY_KINDS.map(d => d.key)).toEqual([
      'noTeacherForSlot',
      'subjectCapacityShortage',
      'subjectPlaceholderOnly',
      'quotaCellMismatch',
      'subjectQuotaOverDays',
    ]);
  });

  it('informational は placeholderOnly と quotaCellMismatch (バッジに数えない種別)', () => {
    expect(INFEASIBILITY_KINDS.filter(d => d.informational).map(d => d.key))
      .toEqual(['subjectPlaceholderOnly', 'quotaCellMismatch']);
  });

  it('各種別の label が item から表示文言を生成する', () => {
    const byKey = Object.fromEntries(INFEASIBILITY_KINDS.map(d => [d.key, d]));
    expect(byKey.noTeacherForSlot.label({ date: '12/25', period: '1限', subject: '数学' }))
      .toContain('担当できる講師が居ません');
    expect(byKey.subjectCapacityShortage.label({ subject: '英語', demand: 5, capacity: 3, teacherCount: 1 }))
      .toContain('必要 5 コマ');
    expect(byKey.quotaCellMismatch.label({ totalQuota: 3, cells: 6, className: 'A', lockedEmpty: 1 }))
      .toContain('【A】');
    expect(byKey.subjectQuotaOverDays.label({ subject: '数学', quota: 4, days: 3 }))
      .toContain('コマ数 4 > 使う日数 3');
  });

  it('buildFixSuggestions はレジストリの全種別に suggestions を付与する', () => {
    const out = buildFixSuggestions(
      {
        noTeacherForSlot: { count: 1, items: [{ date: '12/25', period: '1限', subject: '数学' }] },
        subjectCapacityShortage: { count: 1, items: [{ subject: '英語', demand: 50, capacity: 36, teacherCount: 1 }] },
        subjectPlaceholderOnly: { count: 1, items: [{ subject: '国語', demand: 8 }] },
        quotaCellMismatch: { count: 1, items: [{ totalQuota: 3, cells: 6 }] },
        subjectQuotaOverDays: { count: 1, items: [{ subject: '数学', quota: 4, days: 3 }] },
      },
      { currentConfig: config, teachers: [teacher('堀上', ['英語'])], maxDailyHours: 6 },
    );
    INFEASIBILITY_KINDS.forEach(({ key }) => {
      expect(out[key].items[0].suggestions.length).toBeGreaterThan(0);
    });
  });
});

describe('countFatalInfeasibilities (L1h)', () => {
  it('informational でない種別だけを合算する', () => {
    const n = countFatalInfeasibilities({
      noTeacherForSlot: { count: 2, items: [] },
      subjectCapacityShortage: { count: 1, items: [] },
      subjectQuotaOverDays: { count: 1, items: [] },
      // informational な種別は数えない
      subjectPlaceholderOnly: { count: 5, items: [] },
      quotaCellMismatch: { count: 3, items: [] },
    });
    expect(n).toBe(4);
  });

  it('致命種別が無ければ 0', () => {
    expect(countFatalInfeasibilities({
      subjectPlaceholderOnly: { count: 2, items: [] },
    })).toBe(0);
  });

  it('null / undefined / 欠落フィールドに対して安全', () => {
    expect(countFatalInfeasibilities(null)).toBe(0);
    expect(countFatalInfeasibilities(undefined)).toBe(0);
    expect(countFatalInfeasibilities({})).toBe(0);
  });
});
