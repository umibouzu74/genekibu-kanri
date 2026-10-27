import { describe, expect, it } from 'vitest';
import { computeNgViolationList, describeNgViolation, shortPeriodLabel } from './ngViolations';
import { computeAutoNgByTeacher } from './autoNg';
import { makeKey, makeNgKey } from './scheduleKey';

const dates = [{ id: 1, label: '12/25(金)' }, { id: 2, label: '12/26(土)' }];
const periods = [
  { id: 1, label: '1限 (13:00~14:00)' },
  { id: 2, label: '2限 (14:10~15:10)' },
  { id: 3, label: '夜1 (18:30~19:15)' },
];

function makeProject({ schedule3 = {}, schedule12 = {}, teachers, externalSessions = [] } = {}) {
  return {
    dates,
    periods,
    teachers: teachers || [
      { name: '滝澤', subjects: ['理科'], ngSlots: [] },
      { name: '小松', subjects: ['国語'], ngSlots: [makeNgKey('12/25(金)', '夜1 (18:30~19:15)')] },
      { name: '堀上', subjects: ['英語'], ngSlots: [] },
    ],
    externalSessions,
    tabs: [
      {
        id: 1, name: '中３',
        config: { classes: [{ id: 1, label: '3B' }, { id: 2, label: '3C' }], subjectCounts: {}, activePeriodIds: [1, 2] },
        schedule: schedule3,
      },
      {
        id: 2, name: '中1・中2',
        config: { classes: [{ id: 1, label: '1S' }], subjectCounts: {}, activePeriodIds: [3] },
        schedule: schedule12,
      },
    ],
  };
}

describe('computeNgViolationList', () => {
  it('他学年セッションの自動NG・手動NG に当たる割当を全タブから理由つきで返す', () => {
    const project = makeProject({
      schedule3: {
        [makeKey(2, 1, 2)]: { subject: '理科', teacher: '滝澤' },
        [makeKey(2, 2, 1)]: { subject: '英語', teacher: '堀上' },
      },
      schedule12: {
        [makeKey(1, 3, 1)]: { subject: '国語', teacher: '小松' },
      },
      externalSessions: [
        { id: 1, date: '12/26(土)', teacherName: '滝澤', label: '12:25-13:35', memo: '予備校３限 理科基礎', startTime: '12:25', endTime: '13:35' },
        { id: 2, date: '12/26(土)', teacherName: '滝澤', label: '13:45-14:55', memo: '予備校４限', startTime: '13:45', endTime: '14:55' },
      ],
    });
    const auto = computeAutoNgByTeacher(project.teachers, project.externalSessions, project.periods);
    const list = computeNgViolationList(project, auto);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      tabId: 1, tabName: '中３', key: makeKey(2, 1, 2), classLabels: ['3C'], subject: '理科', teacher: '滝澤',
      reasons: ['予備校３限 理科基礎 12:25〜13:35', '予備校４限 13:45〜14:55'],
    });
    expect(list[1]).toMatchObject({ tabId: 2, teacher: '小松', reasons: ['手動NG'] });
    expect(describeNgViolation(list[0])).toBe('中３ 12/26(土) 1限 3C 理科 滝澤');
    expect(describeNgViolation(list[0], { withTab: false })).toBe('12/26(土) 1限 3C 理科 滝澤');
  });

  it('合同のように同じ割当が複数クラスにあれば 1 件にまとめ、タブで使わない時限・未定は数えない', () => {
    const project = makeProject({
      teachers: [{ name: '小松', subjects: ['国語'], ngSlots: [makeNgKey('12/25(金)', '1限 (13:00~14:00)'), makeNgKey('12/25(金)', '夜1 (18:30~19:15)')] }],
      schedule3: {
        [makeKey(1, 1, 1)]: { subject: '国語', teacher: '小松' },
        [makeKey(1, 1, 2)]: { subject: '国語', teacher: '小松' },
        // 中３ は夜1 を使わない (stale セル)
        [makeKey(1, 3, 1)]: { subject: '国語', teacher: '小松' },
        [makeKey(1, 2, 1)]: { subject: '国語', teacher: '未定' },
      },
    });
    const list = computeNgViolationList(project, new Map());
    expect(list).toHaveLength(1);
    expect(list[0].classLabels).toEqual(['3B', '3C']);
  });

  it('出勤可能調査の × は理由に「出勤可能調査で ×」', () => {
    const project = makeProject({
      teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: [], availability: { '12/25(金)': { '1限 (13:00~14:00)': 'ng' } } }],
      schedule3: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
    });
    const auto = computeAutoNgByTeacher(project.teachers, [], project.periods);
    expect(computeNgViolationList(project, auto)[0].reasons).toEqual(['出勤可能調査で ×']);
  });
});

describe('shortPeriodLabel', () => {
  it('時刻の括弧を落とす', () => {
    expect(shortPeriodLabel('1限 (13:00~14:00)')).toBe('1限');
    expect(shortPeriodLabel('1限（13:00）')).toBe('1限');
    expect(shortPeriodLabel('朝')).toBe('朝');
  });
});
