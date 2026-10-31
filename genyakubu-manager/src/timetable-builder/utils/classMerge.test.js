import { describe, expect, it } from 'vitest';
import { effectiveConfigForTab, makeKey, mergedClassesForTab } from './scheduleKey';
import { classLabelWithRoom } from './classRoom';
import { forEachCountedAssignment } from './tabUsage';
import { projectReducer as reduce } from '../hooks/projectReducer';
const st = (project) => ({ project, history: [project], historyIndex: 0, loadError: null });
const projectReducer = (project, action) => reduce(st(project), action).project;
import { buildKoshuLessons } from '../../utils/builderLessons';

const tab = (classes, schedule = {}) => ({ id: 1, name: '中3', config: { classes, subjectCounts: {} }, schedule });
const C403 = { id: 1, label: '3A403', room: '403' };
const C404 = { id: 2, label: '3A404', room: '404' };

describe('クラスの丸ごと合同 (B4)', () => {
  it('従うクラスを外し、相手のクラスに名前と教室を並べる。印が壊れていれば無かったことに', () => {
    const t = tab([C403, { ...C404, mergedInto: 1 }]);
    const cls = mergedClassesForTab(t);
    expect(cls.map((c) => c.id)).toEqual([1]);
    expect(classLabelWithRoom(cls[0])).toBe('3A403・3A404 (403/404)');
    expect(mergedClassesForTab(tab([C403, { ...C404, mergedInto: 9 }])).map((c) => c.id)).toEqual([1, 2]);
    expect(effectiveConfigForTab({ dates: [], periods: [] }, t).classes.map((c) => c.id)).toEqual([1]);
  });

  it('従うクラスのセルは消さずに持っておき、数えない (講師の計・本体の月間は 1 件)', () => {
    const dates = [{ id: 1, label: '12/24(木)' }];
    const periods = [{ id: 1, label: '1限 (13:00~)' }];
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 2)]: { subject: '数学', teacher: '片岡' },
    };
    const t = tab([C403, { ...C404, mergedInto: 1 }], schedule);
    const seen = [];
    forEachCountedAssignment({ dates, periods }, t, [], '未定', (a) => seen.push(a.entry.teacher));
    expect(seen).toEqual(['堀上']);
    const project = {
      updatedAt: '2026-12-01T00:00:00Z',
      name: '冬期',
      dates,
      periods,
      tabs: [t],
      teachers: [],
      combinedGroups: [],
    };
    const lessons = buildKoshuLessons(project, { todayYmd: '2026-12-01' });
    expect(lessons.filter((l) => l.kind === 'koshu').map((l) => [l.teacher, l.cls, l.room])).toEqual([
      ['堀上', '3A403・3A404', '403/404'],
    ]);
  });

  it('reducer: 合同にする / 外す (連鎖はしない)。外すと従うクラスのセルが戻る', () => {
    const p0 = {
      activeTabId: 1,
      tabs: [tab([C403, C404, { id: 3, label: '3A405' }], { [makeKey(1, 1, 2)]: { subject: '数学', teacher: '片岡' } })],
    };
    const p1 = projectReducer(p0, { type: 'config/setClassMerge', payload: { classId: 2, into: 1 } });
    expect(p1.tabs[0].config.classes[1].mergedInto).toBe(1);
    // 3A405 を 3A404 (従っているクラス) に従わせることはできない
    expect(projectReducer(p1, { type: 'config/setClassMerge', payload: { classId: 3, into: 2 } })).toBe(p1);
    const p2 = projectReducer(p1, { type: 'config/setClassMerge', payload: { classId: 2, into: null } });
    expect(p2.tabs[0].config.classes[1]).not.toHaveProperty('mergedInto');
    expect(p2.tabs[0].schedule[makeKey(1, 1, 2)]).toEqual({ subject: '数学', teacher: '片岡' });
  });
});
