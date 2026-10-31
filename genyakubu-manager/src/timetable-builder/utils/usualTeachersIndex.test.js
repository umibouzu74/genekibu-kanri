import { describe, expect, it } from 'vitest';
import { applyUsualTeachersToWrites, buildBuilderUsualIndex, computeUsualMismatches, koshuFirstYmd } from './usualTeachersIndex';
import { makeKey } from './scheduleKey';

const REGULAR = [
  { id: 1, day: '火', grade: '中1', cls: 'S', subj: '英語', teacher: '堀上', note: '', timetableId: 1 },
  { id: 2, day: '火', grade: '中1', cls: 'S', subj: '数学', teacher: '片岡', note: '', timetableId: 1 },
  // 去年は中1 担当で、今年は中2 担当
  { id: 3, day: '月', grade: '中2', cls: 'S', subj: '英語', teacher: '河野', note: '', timetableId: 1 },
];
const TTS = [{ id: 1, name: '2学期', startDate: '2026-09-01', endDate: null, grades: [] }];

const project = () => ({
  updatedAt: '2026-12-01T00:00:00Z',
  teachers: ['堀上', '片岡', '河野'].map(name => ({ name, subjects: ['英語', '数学'], ngSlots: [], ngClasses: [], priorityClasses: [] })),
  dates: [{ id: 1, label: '12/24(木)' }, { id: 2, label: '12/25(金)' }],
  periods: [{ id: 1, label: '1限' }],
  subjects: ['英語', '数学'],
  activeTabId: 1,
  combinedGroups: [],
  tabs: [{
    id: 1,
    name: '中1',
    config: { classes: [{ id: 1, label: '1S', regular: { grade: '中1', classes: ['S'] } }, { id: 2, label: '1A' }], subjectCounts: {} },
    schedule: {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '河野' },
      [makeKey(2, 1, 1)]: { subject: '数学', teacher: '片岡' },
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '河野' },
    },
  }],
});

describe('講習の普段の担当 (B1)', () => {
  it('講習の初日を基準日に、結び付けたクラスの普段の担当を引く', () => {
    const p = project();
    expect(koshuFirstYmd(p)).toBe('2026-12-24');
    const idx = buildBuilderUsualIndex(p, REGULAR, TTS);
    expect(idx.forClass(1, 1, '英語')).toEqual(['堀上']);
    expect(idx.forClass(1, 2, '英語')).toEqual([]);
  });

  it('普段の担当と違うセルを並べ、写すときは普段の担当で入れ直せる', () => {
    const p = project();
    const idx = buildBuilderUsualIndex(p, REGULAR, TTS);
    const mis = computeUsualMismatches(p, idx);
    expect(mis.map((m) => `${m.classLabel} ${m.subject} ${m.teacher}→${m.usual.join('・')}`)).toEqual(['1S 英語 河野→堀上']);
    const writes = [
      { tabId: 1, key: makeKey(1, 1, 1), subject: '英語', teacher: '河野' },
      { tabId: 1, key: makeKey(2, 1, 1), subject: '英語', teacher: '河野' },
      { tabId: 1, key: makeKey(1, 1, 2), subject: '英語', teacher: '河野' },
    ];
    const r = applyUsualTeachersToWrites(writes, p, idx, (t, d) => t === '堀上' && d === '12/25(金)');
    expect(r.writes.map((w) => w.teacher)).toEqual(['堀上', '', '河野']);
    expect(r).toMatchObject({ replaced: 1, blanked: 1 });
  });
});
