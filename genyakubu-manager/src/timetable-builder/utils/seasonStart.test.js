import { describe, expect, it } from 'vitest';
import { buildFreshSeasonProject } from './seasonStart';
import { validateProjectShape } from './projectSchema';
import { CURRENT_PROJECT_VERSION } from './constants';

const T = (name, extra = {}) => ({
  name,
  subjects: ['英語'],
  ngSlots: [],
  ngClasses: [],
  priorityClasses: [],
  ...extra,
});

function summerProject() {
  return {
    version: 4,
    name: '2026 夏期講習',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    activeTabId: 2,
    teachers: [
      T('堀上', {
        ngSlots: ['7/29(水)-1限', '7/1(水)-1限'],
        ngClasses: ['3B'],
        priorityClasses: ['3S'],
        maxDailyHours: 3,
        availability: { '7/29(水)': { '1限': 'ng' } },
        availabilityMemo: '午後だけ',
      }),
      T('山田'),
    ],
    dates: [{ id: 1, label: '7/29(水)' }, { id: 2, label: '7/30(木)' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    tabs: [
      {
        id: 1,
        name: '中3',
        config: {
          classes: [{ id: 1, label: '3S' }, { id: 2, label: '3B' }],
          subjectCounts: { 英語: 4 },
          classSubjectCounts: { 2: { 英語: 2 } },
          activeDateIds: [1],
          activePeriodIds: [2],
        },
        schedule: { 'd1-p2-c1': { subject: '英語', teacher: '堀上', locked: true } },
        dayStatuses: { 1: 'ok' },
      },
      { id: 2, name: '中1・2', config: { classes: [{ id: 1, label: '1S' }], subjectCounts: { 英語: 2 } }, schedule: {} },
    ],
    subjects: ['英語'],
    subjectColors: { 英語: '#DBEAFE' },
    combinedGroups: [
      { id: 1, subject: '英語', classes: ['3S', '1S'], dates: null },
      { id: 2, subject: '英語', classes: ['3S', '3B'], dates: ['7/29(水)'] },
    ],
    externalCounts: { '7/29(水)-堀上': 2 },
    externalSessions: [{ id: 1, date: '7/29(水)', teacherName: '堀上', label: '', startTime: '09:00', endTime: '10:00' }],
    externalSessionPresets: [{ id: 1, name: '予備校', startTime: '09:00', endTime: '10:00', startDateLabel: '7/29(水)', endDateLabel: '8/9(日)' }],
    snapshots: [{ id: 1, name: '案1', tabId: 1, createdAt: null, schedule: {} }],
    numPatterns: 5,
  };
}

describe('buildFreshSeasonProject', () => {
  const now = new Date('2026-10-23T03:00:00.000Z');
  const fresh = buildFreshSeasonProject(summerProject(), { name: '2026 冬期講習', now });

  it('構造として正しい project (読み込みの検証を通る)', () => {
    expect(validateProjectShape(fresh).valid).toBe(true);
    expect(fresh.version).toBe(CURRENT_PROJECT_VERSION);
    expect(fresh.name).toBe('2026 冬期講習');
    expect(fresh.createdAt).toBe(now.toISOString());
    expect(fresh.updatedAt).toBe(now.toISOString());
  });

  it('日付・時間割・日ごとのチェック・スナップショット・他学年セッションは空', () => {
    expect(fresh.dates).toEqual([]);
    expect(fresh.tabs.every(t => Object.keys(t.schedule).length === 0)).toBe(true);
    expect(fresh.tabs.every(t => t.dayStatuses === undefined)).toBe(true);
    expect(fresh.snapshots).toEqual([]);
    expect(fresh.externalSessions).toEqual([]);
    expect(fresh.externalCounts).toEqual({});
  });

  it('講師は残し、NG と出勤可能調査の回答だけ外す', () => {
    const horikami = fresh.teachers.find(t => t.name === '堀上');
    expect(horikami).toEqual({
      name: '堀上',
      subjects: ['英語'],
      ngSlots: [],
      ngClasses: ['3B'],
      priorityClasses: ['3S'],
      maxDailyHours: 3,
    });
    expect(fresh.teachers.map(t => t.name)).toEqual(['堀上', '山田']);
  });

  it('タブ・クラス・コマ数・使う時限・時限・科目・色・生成の設定は残す。使う日は全日に戻す', () => {
    expect(fresh.tabs.map(t => t.name)).toEqual(['中3', '中1・2']);
    const tab = fresh.tabs[0];
    expect(tab.config.classes).toEqual([{ id: 1, label: '3S' }, { id: 2, label: '3B' }]);
    expect(tab.config.subjectCounts).toEqual({ 英語: 4 });
    expect(tab.config.classSubjectCounts).toEqual({ 2: { 英語: 2 } });
    expect(tab.config.activePeriodIds).toEqual([2]);
    expect('activeDateIds' in tab.config).toBe(false);
    expect(fresh.periods).toEqual([{ id: 1, label: '1限' }, { id: 2, label: '2限' }]);
    expect(fresh.subjects).toEqual(['英語']);
    expect(fresh.subjectColors).toEqual({ 英語: '#DBEAFE' });
    expect(fresh.numPatterns).toBe(5);
    expect(fresh.activeTabId).toBe(1);
  });

  it('合同は全日程のものだけ残り、プリセットは日付の範囲を外す', () => {
    expect(fresh.combinedGroups.map(g => g.id)).toEqual([1]);
    expect(fresh.externalSessionPresets).toEqual([{ id: 1, name: '予備校', startTime: '09:00', endTime: '10:00' }]);
  });

  it('元の project は変えない', () => {
    const src = summerProject();
    const before = JSON.stringify(src);
    buildFreshSeasonProject(src, { name: 'x', now });
    expect(JSON.stringify(src)).toBe(before);
  });
});
