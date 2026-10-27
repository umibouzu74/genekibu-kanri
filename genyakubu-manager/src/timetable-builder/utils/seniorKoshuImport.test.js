// 本体の「高校・予備校の講習」の取り込み (2026-10-27)
import { describe, expect, it } from 'vitest';
import { planSeniorKoshuImport } from './seniorKoshuImport';
import { migrateProject } from './scheduleKey';
import { projectReducer } from '../hooks/projectReducer';
import { buildKoshuLessons } from '../../utils/builderLessons';

const tab = (over = {}) => ({ id: 1, name: '中3', config: { classes: [{ id: 1, label: '3S' }], subjectCounts: {}, activeDateIds: [2, 3], ...over }, schedule: {} });
const base = (over = {}) => ({
  version: 4,
  name: '2026 冬期講習',
  updatedAt: '2026-11-20T00:00:00.000Z',
  createdAt: '2026-11-01T00:00:00.000Z',
  teachers: [
    { name: '滝澤', subjects: ['理科'], ngSlots: [], ngClasses: [], priorityClasses: [] },
    { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
  ],
  activeTabId: 1,
  dates: [
    { id: 2, label: '12/25(金)' },
    { id: 3, label: '12/26(土)' },
    // 前の季節の残り (タブが使っていない): 取り込みの対象にしない
    { id: 9, label: '7/24(金)' },
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
const item = (over = {}) => ({
  key: '1:2026-12-25',
  teacher: '滝澤',
  date: '2026-12-25',
  time: '12:25-13:35',
  termName: '高3 Ⅰ期',
  periodName: '予備校３限',
  grade: '高3',
  course: '共通テスト理科基礎(化学基礎)',
  ...over,
});
const today = { todayYmd: '2026-11-20' };
const reduce = (project, action) => projectReducer({ project, history: [project], historyIndex: 0, loadError: null }, action).project;

describe('planSeniorKoshuImport', () => {
  it('この講習の日に当たる予定を、時刻つき・印つきの他学年セッションにする', () => {
    const plan = planSeniorKoshuImport(base(), [item(), item({ key: '1:2026-12-26', date: '2026-12-26' })], today);
    expect(plan.toAdd).toEqual([
      {
        date: '12/25(金)', teacherName: '滝澤', label: '12:25-13:35', memo: '高3 Ⅰ期 予備校３限',
        course: '高3 共通テスト理科基礎(化学基礎)', startTime: '12:25', endTime: '13:35',
        source: 'seniorKoshu', sourceKey: '1:2026-12-25',
      },
      expect.objectContaining({ date: '12/26(土)', sourceKey: '1:2026-12-26' }),
    ]);
    expect(plan.missingDates).toEqual([]);
  });

  it('講習の講師にいない名前は取り込まない。講習の前後 14 日の、プールに無い日は知らせる。それより外は見ない', () => {
    const plan = planSeniorKoshuImport(base(), [
      item({ key: 'a', teacher: '伊藤' }),
      item({ key: 'b', date: '2026-12-24' }),
      item({ key: 'c', date: '2026-12-24', teacher: '堀上' }),
      // 夏の予定 (プールに 7/24 が残っていても、講習の日ではない)
      item({ key: 'd', date: '2026-07-24' }),
    ], today);
    expect(plan.unknownTeachers).toEqual(['伊藤']);
    expect(plan.missingDates).toEqual([{ ymd: '2026-12-24', label: '12/24(木)', count: 2 }]);
    expect(plan.toAdd).toEqual([]);
  });

  it('外部授業だけの日は取り込める', () => {
    const p = base({ dates: [...base().dates, { id: 4, label: '12/24(木)', externalOnly: true }] });
    const plan = planSeniorKoshuImport(p, [item({ key: 'b', date: '2026-12-24' })], today);
    expect(plan.toAdd.map(s => s.date)).toEqual(['12/24(木)']);
  });

  it('前に取り込んだもの: 同じなら何もしない / 変わったら入れ直す / 本体に無くなったら消す', () => {
    const first = planSeniorKoshuImport(base(), [item(), item({ key: '1:2026-12-26', date: '2026-12-26' })], today);
    const imported = reduce(base(), { type: 'teacher/replaceExternalSessions', payload: { removeIds: [], items: first.toAdd } });
    expect(imported.externalSessions.map(s => [s.id, s.source, s.sourceKey])).toEqual([
      [1, 'seniorKoshu', '1:2026-12-25'],
      [2, 'seniorKoshu', '1:2026-12-26'],
    ]);
    // そのまま: 何もしない
    const same = planSeniorKoshuImport(imported, [item(), item({ key: '1:2026-12-26', date: '2026-12-26' })], today);
    expect([same.unchanged, same.toAdd.length, same.changedIds, same.staleIds]).toEqual([2, 0, [], []]);
    // 12/25 の講座名が変わり、12/26 が無くなった
    const next = planSeniorKoshuImport(imported, [item({ course: '共通テスト理科基礎(生物基礎)' })], today);
    expect(next.changedIds).toEqual([1]);
    expect(next.staleIds).toEqual([2]);
    expect(next.toAdd.map(s => s.course)).toEqual(['高3 共通テスト理科基礎(生物基礎)']);
    const applied = reduce(imported, {
      type: 'teacher/replaceExternalSessions',
      payload: { removeIds: [...next.staleIds, ...next.changedIds], items: next.toAdd },
    });
    expect(applied.externalSessions.map(s => [s.id, s.course])).toEqual([[3, '高3 共通テスト理科基礎(生物基礎)']]);
  });

  it('手で入れた、講師・日・時刻が同じ他学年セッションは置き換える候補にする', () => {
    const p = base({
      externalSessions: [
        { id: 7, date: '12/25(金)', teacherName: '滝澤', label: '12:25-13:35', memo: 'Ⅰ期 予備校３限', startTime: '12:25', endTime: '13:35' },
        // 時刻が違う: 候補にしない
        { id: 8, date: '12/25(金)', teacherName: '滝澤', label: '9:00-10:10', memo: 'Ⅰ期 予備校１限', startTime: '09:00', endTime: '10:10' },
      ],
    });
    const plan = planSeniorKoshuImport(p, [item()], today);
    expect(plan.manualDuplicateIds).toEqual([7]);
    const applied = reduce(p, { type: 'teacher/replaceExternalSessions', payload: { removeIds: plan.manualDuplicateIds, items: plan.toAdd } });
    expect(applied.externalSessions.map(s => [s.id, s.source || ''])).toEqual([[8, ''], [9, 'seniorKoshu']]);
  });
});

describe('取り込んだ印 (source / sourceKey)', () => {
  it('読み込みで、知らない値・片方だけの印は外す', () => {
    const p = migrateProject(base({
      externalSessions: [
        { id: 1, date: '12/25(金)', teacherName: '滝澤', label: '', memo: '', source: 'seniorKoshu', sourceKey: '1:2026-12-25' },
        { id: 2, date: '12/25(金)', teacherName: '滝澤', label: '', memo: '', source: 'other', sourceKey: 'x' },
        { id: 3, date: '12/25(金)', teacherName: '滝澤', label: '', memo: '', source: 'seniorKoshu' },
      ],
    }));
    expect(p.externalSessions.map(s => [s.id, s.source ?? null, s.sourceKey ?? null])).toEqual([
      [1, 'seniorKoshu', '1:2026-12-25'],
      [2, null, null],
      [3, null, null],
    ]);
  });

  it('本体の月間には、取り込んだセッションを出さない (本体の登録の「講」カードが出る)', () => {
    const p = base({
      externalSessions: [
        { id: 1, date: '12/25(金)', teacherName: '滝澤', label: '12:25-13:35', memo: '高3 Ⅰ期 予備校３限', startTime: '12:25', endTime: '13:35', source: 'seniorKoshu', sourceKey: '1:2026-12-25' },
        { id: 2, date: '12/25(金)', teacherName: '滝澤', label: '9:00-10:10', memo: '予備校', startTime: '09:00', endTime: '10:10' },
      ],
    });
    const ext = buildKoshuLessons(p, { todayYmd: '2026-11-20' }).filter(l => l.kind === 'external');
    expect(ext.map(l => l.key)).toEqual(['ext:2']);
  });
});
