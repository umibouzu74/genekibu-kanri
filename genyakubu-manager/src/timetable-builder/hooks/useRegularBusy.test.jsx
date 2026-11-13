// @vitest-environment jsdom
// 通常授業との講師の重なりが、作業領域 (ProjectProvider) の analysis に合流するか。
// 本体のデータ (HostDataContext) が無いとき (単体で描く) は従来どおり。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ProjectProvider } from '../contexts/ProjectContext';
import { useProjectContext } from '../contexts/projectContextValue';
import { HostDataContext } from '../contexts/hostDataContext';
import { EMPTY_REGULAR_BUSY } from '../utils/autoNg';
import { makeKey, makeNgKey } from '../utils/scheduleKey';
import { seasonStorage } from '../utils/seasons';

const P1 = '1限 (18:00~19:00)';
const P2 = '2限 (19:10~20:10)';
const T = (name) => ({ name, subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] });

function project() {
  return {
    version: 4,
    name: '2026 冬期講習',
    createdAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T00:00:00.000Z',
    teachers: [T('片岡'), T('福江')],
    activeTabId: 1,
    dates: [{ id: 1, label: '1/13(水)' }, { id: 2, label: '1/14(木)' }],
    periods: [{ id: 1, label: P1 }, { id: 2, label: P2 }],
    tabs: [{
      id: 1,
      name: '中3',
      config: { classes: [{ id: 1, label: '3S' }], subjectCounts: { 数学: 2 } },
      schedule: {
        [makeKey(1, 2, 1)]: { subject: '数学', teacher: '片岡' },
        [makeKey(2, 2, 1)]: { subject: '数学', teacher: '片岡' },
      },
    }],
    subjects: ['数学'],
    subjectColors: {},
    combinedGroups: [],
    externalCounts: {},
    externalSessions: [],
    externalSessionPresets: [],
    snapshots: [],
  };
}

const HOST = {
  offsiteLessons: [],
  holidays: [],
  partTimeStaffNames: [],
  retiredTeacherNames: [],
  regularTimetables: [{ id: 4, name: '3学期', type: 'regular', startDate: '2027-01-08', endDate: null, grades: [] }],
  regularSlots: [
    { id: 1, timetableId: 4, day: '水', time: '19:55-20:55', grade: '附中1', cls: '-', room: '601', subj: '数学', teacher: '片岡', note: '' },
  ],
};

function capture(host) {
  localStorage.setItem(seasonStorage('winter').storageKey, JSON.stringify(project()));
  let ctx = null;
  function Capture() {
    ctx = useProjectContext();
    return null;
  }
  const provider = (
    <ProjectProvider storage={seasonStorage('winter')}>
      <Capture />
    </ProjectProvider>
  );
  render(host ? <HostDataContext.Provider value={host}>{provider}</HostDataContext.Provider> : provider);
  return ctx;
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('useRegularBusy (ProjectProvider)', () => {
  it('本体の通常授業と重なる時限が自動NG になり、⚠ の一覧・タブの違反の数に出る', () => {
    const { analysis } = capture(HOST);
    expect(analysis.regularBusy).toEqual({ 片岡: { '1/13(水)': [{ time: '19:55-20:55', label: '附中1 数学' }] } });
    const entry = analysis.autoNgByTeacher.get('片岡').get(makeNgKey('1/13(水)', P2));
    expect(entry.regular).toHaveLength(1);
    expect(analysis.autoNgByTeacher.get('片岡').has(makeNgKey('1/14(木)', P2))).toBe(false);
    expect(analysis.ngViolationList.map(v => [v.dateLabel, v.teacher, v.reasons])).toEqual([
      ['1/13(水)', '片岡', ['通常授業 附中1 数学 19:55-20:55']],
    ]);
    expect(analysis.ngViolationKeys).toEqual([makeKey(1, 2, 1)]);
    expect(analysis.tabErrorCounts[1]).toBeGreaterThan(0);
  });

  it('本体のデータが無ければ (単体で描く) 従来どおり NG なし', () => {
    const { analysis } = capture(null);
    expect(analysis.regularBusy).toBe(EMPTY_REGULAR_BUSY);
    expect(analysis.autoNgByTeacher.get('片岡').size).toBe(0);
    expect(analysis.ngViolationList).toEqual([]);
  });
});
