// 外部授業だけの日 (日付プールの印、2026-10-27)
import { describe, expect, it } from 'vitest';
import { activeDatesForTab, effectiveConfigForTab, migrateProject } from './scheduleKey';
import { sessionDateLabels, usedDateLabels } from './courseDates';
import { projectReducer } from '../hooks/projectReducer';
import { buildTeacherRows } from './excelExport';

const tab = (over = {}) => ({ id: 1, name: '中3', config: { classes: [{ id: 1, label: '3S' }], subjectCounts: {}, ...over }, schedule: {} });
const base = (over = {}) => ({
  version: 4,
  name: '2026 冬期講習',
  updatedAt: '2026-11-20T00:00:00.000Z',
  createdAt: '2026-11-01T00:00:00.000Z',
  teachers: [{ name: '滝澤', subjects: ['理科'], ngSlots: [], ngClasses: [], priorityClasses: [] }],
  activeTabId: 1,
  dates: [
    { id: 1, label: '12/24(木)', externalOnly: true },
    { id: 2, label: '12/25(金)' },
    { id: 3, label: '12/26(土)' },
  ],
  periods: [{ id: 1, label: '1限 (13:00~14:20)' }],
  tabs: [tab()],
  subjects: ['理科'],
  subjectColors: {},
  combinedGroups: [],
  externalCounts: {},
  externalSessions: [],
  externalSessionPresets: [],
  snapshots: [],
  ...over,
});
const reduce = (project, action) => projectReducer({ project, history: [project], historyIndex: 0, loadError: null }, action).project;

describe('外部授業だけの日', () => {
  it('どのタブの時間割にも出さない (全日使うタブでも・使う日に入っていても)', () => {
    const p = base();
    expect(activeDatesForTab(p.dates, p.tabs[0]).map(d => d.id)).toEqual([2, 3]);
    expect(effectiveConfigForTab(p, tab({ activeDateIds: [1, 2] })).dates.map(d => d.id)).toEqual([2]);
    expect([...usedDateLabels(p)]).toEqual(['12/25(金)', '12/26(土)']);
    // 外部授業 (他学年セッション) は出す
    expect([...sessionDateLabels(p)].sort()).toEqual(['12/24(木)', '12/25(金)', '12/26(土)']);
  });

  it('足す: プールに無い日は印つきで足し、使われていない日には印を付ける。講習の日は触らない', () => {
    const p = base({ dates: [{ id: 2, label: '12/25(金)' }, { id: 5, label: '7/24(金)' }], tabs: [tab({ activeDateIds: [2] })] });
    const next = reduce(p, { type: 'dates/addExternalOnly', payload: { labels: ['12/24(木)', '12/25(金)', '7/24(金)'] } });
    expect(next.dates).toEqual([
      { id: 2, label: '12/25(金)' },
      { id: 5, label: '7/24(金)', externalOnly: true },
      { id: 6, label: '12/24(木)', externalOnly: true },
    ]);
    // 全日使うタブがあると、印の無い日はどれも講習の日
    const allDays = base({ dates: [{ id: 2, label: '12/25(金)' }] });
    expect(reduce(allDays, { type: 'dates/addExternalOnly', payload: { labels: ['12/25(金)'] } })).toBe(allDays);
  });

  it('タブが使い始めたら印を外す (生成・手動で足す / チェック)', () => {
    const p = base({ tabs: [tab({ activeDateIds: [2] })] });
    const bySet = reduce(p, { type: 'tabDates/setByLabels', payload: { labels: ['12/24(木)', '12/25(金)'] } });
    expect(bySet.dates.find(d => d.id === 1)).toEqual({ id: 1, label: '12/24(木)' });
    expect(bySet.tabs[0].config.activeDateIds).toEqual([1, 2]);
    const byToggle = reduce(p, { type: 'tabDates/toggle', payload: { dateId: 1 } });
    expect(byToggle.dates.find(d => d.id === 1).externalOnly).toBeUndefined();
  });

  it('全日使うタブで 1 日外しても、外部授業だけの日は使う日に入れない', () => {
    const next = reduce(base(), { type: 'tabDates/toggle', payload: { dateId: 3 } });
    expect(next.tabs[0].config.activeDateIds).toEqual([2]);
    expect(next.dates[0].externalOnly).toBe(true);
  });

  it('「未使用の日を一括削除」では消さない', () => {
    const p = base({ dates: [...base().dates, { id: 9, label: '7/24(金)' }], tabs: [tab({ activeDateIds: [2, 3] })] });
    const next = reduce(p, { type: 'dates/removeUnusedFromPool' });
    expect(next.dates.map(d => d.id)).toEqual([1, 2, 3]);
  });

  it('読込: true 以外の印は落とし、タブが使う日の印は外す', () => {
    const migrated = migrateProject(base({
      dates: [
        { id: 1, label: '12/24(木)', externalOnly: 'yes' },
        { id: 2, label: '12/25(金)', externalOnly: true },
        { id: 3, label: '12/26(土)', externalOnly: true },
      ],
      tabs: [tab({ activeDateIds: [2] })],
    }));
    expect(migrated.dates).toEqual([
      { id: 1, label: '12/24(木)' },
      { id: 2, label: '12/25(金)' },
      { id: 3, label: '12/26(土)', externalOnly: true },
    ]);
  });

  it('講師別 Excel に外部授業だけの日の外部授業も出す', () => {
    const p = base({
      tabs: [{ ...tab(), schedule: { 'd2-p1-c1': { subject: '理科', teacher: '滝澤' } } }],
      externalSessions: [
        { id: 1, date: '12/24(木)', teacherName: '滝澤', label: '', memo: 'Ⅰ期 予備校３限', course: '物理基礎', startTime: '12:25', endTime: '13:35' },
      ],
    });
    const rows = buildTeacherRows(p, '滝澤');
    expect(rows.map(r => [r.cells[0], r.isExternal])).toEqual([
      ['12/24(木)', true],
      ['12/25(金)', false],
    ]);
  });
});
