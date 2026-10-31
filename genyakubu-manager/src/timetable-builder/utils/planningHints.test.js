import { describe, expect, it } from 'vitest';
import { buildPlanningHints, categoriesForSeason, computeStreakViolations, resolveTeacherUsage } from './planningHints';
import { normalizeDayStreakRules } from './regularLink';
import { makeKey } from './scheduleKey';

const project = () => ({
  name: 'x',
  updatedAt: '2026-12-20T00:00:00Z',
  teachers: [
    { name: '小松', subjects: ['国語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
    { name: '竹内', subjects: ['国語'], ngSlots: [], ngClasses: [], priorityClasses: [], usage: 'normal' },
    { name: '南條', subjects: ['国語'], ngSlots: [], ngClasses: [], priorityClasses: [], usage: 'never' },
  ],
  dates: [
    { id: 1, label: '1/2(土)' },
    { id: 2, label: '1/4(月)' },
    { id: 3, label: '1/5(火)' },
    { id: 4, label: '1/6(水)' },
  ],
  periods: [
    { id: 1, label: '1限 (13:00~)' },
    { id: 2, label: '5限 (18:30~19:20)' },
  ],
  activeTabId: 1,
  tabs: [{
    id: 1,
    name: '中1・中2',
    config: { classes: [{ id: 1, label: '1S' }], subjectCounts: { 国語: 5 } },
    schedule: {
      [makeKey(2, 2, 1)]: { subject: '国語', teacher: '小松' },
      [makeKey(3, 2, 1)]: { subject: '国語', teacher: '小松' },
      [makeKey(4, 2, 1)]: { subject: '国語', teacher: '小松' },
      [makeKey(1, 2, 1)]: { subject: '国語', teacher: '小松' },
      [makeKey(1, 1, 1)]: { subject: '国語', teacher: '竹内' },
    },
  }],
  subjects: ['国語'],
  combinedGroups: [],
  yobikoReserve: true,
  dayStreakRules: [{ id: 1, categories: ['yobiko'], tabIds: [1], fromTime: '18:30', maxDays: 2 }],
});
const CATS = { 小松: 'yobiko', 竹内: 'yobiko', 南條: 'genyaku-fulltime' };

describe('組み方の手がかり', () => {
  it('B3: 講師ごとの設定 > 所属からの既定 (予備校部 = 控えめ) > 標準', () => {
    const p = project();
    expect(resolveTeacherUsage(p.teachers[0], p, CATS)).toBe('reserve');
    expect(resolveTeacherUsage(p.teachers[1], p, CATS)).toBe('normal');
    expect(resolveTeacherUsage(p.teachers[2], p, CATS)).toBe('never');
    expect(resolveTeacherUsage(p.teachers[0], { ...p, yobikoReserve: false }, CATS)).toBe('normal');
    expect(categoriesForSeason({ 2026: CATS }, '2027-01-04')).toBe(CATS);
  });

  it('B2: 暦日で 3 日続けて夜に入ると違反 (日曜をはさむと途切れる。夜でない時限は数えない)', () => {
    const v = computeStreakViolations(project(), CATS);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ teacher: '小松', maxDays: 2, dateLabels: ['1/4(月)', '1/5(火)', '1/6(水)'] });
    expect(v[0].firstCell).toMatchObject({ tabId: 1, dateId: 2, periodId: 2 });
  });

  it('自動作成へ渡す手がかり: 使い方と連続出勤のルールを名前まで解く', () => {
    const h = buildPlanningHints(project(), 1, null, CATS);
    expect(h.usage).toEqual({ 小松: 'reserve', 南條: 'never' });
    expect(h.streaks[0]).toMatchObject({ maxDays: 2, tabIds: [1], periodIds: [2] });
    expect(h.streaks[0].teachers.sort()).toEqual(['小松', '竹内']);
  });

  it('ルールの形をそろえる (対象のいない・日数の無いルールは落とす)', () => {
    expect(
      normalizeDayStreakRules([
        { maxDays: 2, categories: ['yobiko'], fromTime: '18:30' },
        { maxDays: 0, categories: ['yobiko'] },
        { maxDays: 2 },
      ])
    ).toEqual([{ id: 1, maxDays: 2, categories: ['yobiko'], fromTime: '18:30' }]);
  });
});
