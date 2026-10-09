import { describe, expect, it } from 'vitest';
import { projectReducer } from './projectReducer';
import { normalizeTeacherFields, migrateProject } from '../utils/scheduleKey';

// 出勤可能調査 (Teacher.availability) の reducer アクションとラベル追従。

function makeProject(overrides = {}) {
  return {
    version: 4,
    name: 'test',
    teachers: [
      { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      { name: '田中', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      { name: '未定', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
    ],
    activeTabId: 1,
    dates: [{ id: 1, label: '7/29(水)' }, { id: 2, label: '7/30(木)' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    tabs: [{
      id: 1,
      name: '中3',
      config: { classes: [{ id: 1, label: '３S' }], subjectCounts: { '英語': 1 } },
      schedule: {},
    }],
    combinedGroups: [],
    externalCounts: {},
    externalSessions: [],
    subjects: ['英語', '数学'],
    subjectColors: {},
    ...overrides,
  };
}

function makeState(overrides) {
  const project = makeProject(overrides);
  return { project, history: [project], historyIndex: 0, loadError: null };
}

const run = (state, action) => projectReducer(state, action);
const teacher = (state, name) => state.project.teachers.find(t => t.name === name);

describe('teacher/setAvailability', () => {
  it('記号を書き、履歴に積む', () => {
    const s = run(makeState(), {
      type: 'teacher/setAvailability',
      payload: { name: '堀上', cells: [{ date: '7/29(水)', period: '1限' }, { date: '7/29(水)', period: '2限' }], mark: 'ok' },
    });
    expect(teacher(s, '堀上').availability).toEqual({ '7/29(水)': { '1限': 'ok', '2限': 'ok' } });
    expect(s.history).toHaveLength(2);
  });

  it('同じ記号の再設定は no-op (履歴を汚さない)', () => {
    const s1 = run(makeState(), {
      type: 'teacher/setAvailability',
      payload: { name: '堀上', cells: [{ date: '7/29(水)', period: '1限' }], mark: 'ng' },
    });
    const s2 = run(s1, {
      type: 'teacher/setAvailability',
      payload: { name: '堀上', cells: [{ date: '7/29(水)', period: '1限' }], mark: 'ng' },
    });
    expect(s2).toBe(s1);
  });

  it('mark=null で未記入に戻し、空になればフィールドごと消える', () => {
    const s1 = run(makeState(), {
      type: 'teacher/setAvailability',
      payload: { name: '堀上', cells: [{ date: '7/29(水)', period: '1限' }], mark: 'ok' },
    });
    const s2 = run(s1, {
      type: 'teacher/setAvailability',
      payload: { name: '堀上', cells: [{ date: '7/29(水)', period: '1限' }], mark: null },
    });
    expect(teacher(s2, '堀上')).not.toHaveProperty('availability');
  });

  it('不正な記号・未知の講師・未定・空の cells は no-op', () => {
    const s = makeState();
    const cells = [{ date: '7/29(水)', period: '1限' }];
    expect(run(s, { type: 'teacher/setAvailability', payload: { name: '堀上', cells, mark: 'yes' } })).toBe(s);
    expect(run(s, { type: 'teacher/setAvailability', payload: { name: '居ない', cells, mark: 'ok' } })).toBe(s);
    expect(run(s, { type: 'teacher/setAvailability', payload: { name: '未定', cells, mark: 'ok' } })).toBe(s);
    expect(run(s, { type: 'teacher/setAvailability', payload: { name: '堀上', cells: [], mark: 'ok' } })).toBe(s);
  });
});

describe('teacher/clearAvailability / setAvailabilityMemo', () => {
  it('回答とメモをまとめて消す。何も無ければ no-op', () => {
    const s0 = makeState({
      teachers: [{ name: '堀上', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [],
        availability: { '7/29(水)': { '1限': 'ok' } }, availabilityMemo: '19時以降' }],
    });
    const s1 = run(s0, { type: 'teacher/clearAvailability', payload: { name: '堀上' } });
    expect(teacher(s1, '堀上')).not.toHaveProperty('availability');
    expect(teacher(s1, '堀上')).not.toHaveProperty('availabilityMemo');
    expect(run(s1, { type: 'teacher/clearAvailability', payload: { name: '堀上' } })).toBe(s1);
  });

  it('メモは trim して保存し、空なら消す。同値は no-op', () => {
    const s1 = run(makeState(), { type: 'teacher/setAvailabilityMemo', payload: { name: '堀上', memo: '  8/5 は 19 時以降  ' } });
    expect(teacher(s1, '堀上').availabilityMemo).toBe('8/5 は 19 時以降');
    expect(run(s1, { type: 'teacher/setAvailabilityMemo', payload: { name: '堀上', memo: '8/5 は 19 時以降' } })).toBe(s1);
    const s2 = run(s1, { type: 'teacher/setAvailabilityMemo', payload: { name: '堀上', memo: '  ' } });
    expect(teacher(s2, '堀上')).not.toHaveProperty('availabilityMemo');
  });
});

describe('ラベルの改名・削除への追従 (cascade)', () => {
  const answered = () => makeState({
    teachers: [{
      name: '堀上', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [],
      availability: { '7/29(水)': { '1限': 'ok', '2限': 'ng' }, '7/30(木)': { '1限': 'maybe' } },
    }],
  });

  it('日付の改名 (renameHeader) に追従', () => {
    const s = run(answered(), { type: 'schedule/renameHeader', payload: { type: 'date', oldVal: '7/29(水)', newVal: '7/29(水)補' } });
    expect(teacher(s, '堀上').availability).toEqual({
      '7/29(水)補': { '1限': 'ok', '2限': 'ng' },
      '7/30(木)': { '1限': 'maybe' },
    });
  });

  it('時限の改名 (renameHeader) に追従', () => {
    const s = run(answered(), { type: 'schedule/renameHeader', payload: { type: 'period', oldVal: '1限', newVal: '1限 (13:00~13:45)' } });
    expect(teacher(s, '堀上').availability).toEqual({
      '7/29(水)': { '1限 (13:00~13:45)': 'ok', '2限': 'ng' },
      '7/30(木)': { '1限 (13:00~13:45)': 'maybe' },
    });
  });

  it('日付をプールから消すと、その日の回答も消える (同ラベル再追加で復活しない)', () => {
    const s = run(answered(), { type: 'dates/removeFromPool', payload: { dateId: 1 } });
    expect(teacher(s, '堀上').availability).toEqual({ '7/30(木)': { '1限': 'maybe' } });
  });

  it('時限をプールから消すと (setList)、その時限の回答も消える', () => {
    const s = run(answered(), { type: 'config/setList', payload: { key: 'periods', value: '2限' } });
    expect(teacher(s, '堀上').availability).toEqual({ '7/29(水)': { '2限': 'ng' } });
  });

  it('講師の改名は講師に付いた回答ごと移る / 手動NG の全解除では消えない', () => {
    const s1 = run(answered(), { type: 'teacher/rename', payload: { idx: 0, newName: '堀上先生' } });
    expect(teacher(s1, '堀上先生').availability['7/29(水)']['2限']).toBe('ng');
    const s2 = run(s1, { type: 'teacher/clearAllNg' });
    expect(teacher(s2, '堀上先生').availability['7/29(水)']['2限']).toBe('ng');
  });
});

describe('読込時の正規化 (normalizeTeacherFields / migrateProject)', () => {
  it('崩れた回答・メモを落とす', () => {
    const [t] = normalizeTeacherFields([{
      name: '堀上', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [],
      availability: { '7/29(水)': { '1限': 'ok', '2限': 'x' }, bad: 'ng' },
      availabilityMemo: 42,
    }]);
    expect(t.availability).toEqual({ '7/29(水)': { '1限': 'ok' } });
    expect(t).not.toHaveProperty('availabilityMemo');
  });

  it('正しい形なら配列ごと同一参照 (no-op 判定)', () => {
    const teachers = [{
      name: '堀上', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [],
      availability: { '7/29(水)': { '1限': 'ok' } }, availabilityMemo: '可',
    }];
    expect(normalizeTeacherFields(teachers)).toBe(teachers);
  });

  it('日付ラベル統一 (「8/6」→「8/6(木)」) で回答もマージされる', () => {
    const project = makeProject({
      dates: [{ id: 1, label: '8/6' }, { id: 2, label: '8/6(木)' }],
      teachers: [{
        name: '堀上', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [],
        availability: { '8/6': { '1限': 'ok', '2限': 'ng' }, '8/6(木)': { '1限': 'maybe' } },
      }],
    });
    const migrated = migrateProject(project);
    expect(migrated.dates.map(d => d.label)).toEqual(['8/6(木)']);
    expect(migrated.teachers[0].availability).toEqual({ '8/6(木)': { '1限': 'maybe', '2限': 'ng' } });
  });
});
