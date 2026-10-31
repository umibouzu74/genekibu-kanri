import { describe, expect, it } from 'vitest';
import { applyWritesToSchedule, cellsToTsv, newProblemsAfterWrites, parseCellTsv } from './cellTsv';
import { makeKey, makeNgKey } from './scheduleKey';

const project = () => ({
  name: 'x',
  activeTabId: 1,
  subjects: ['英語', '数学'],
  teachers: [
    { name: '堀上', subjects: ['英語'], ngSlots: [makeNgKey('12/26(土)', '1限 (13:00~)')], ngClasses: [], priorityClasses: [] },
    { name: '片岡', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
  ],
  dates: [{ id: 1, label: '12/25(金)' }, { id: 2, label: '12/26(土)' }],
  periods: [{ id: 1, label: '1限 (13:00~)' }],
  combinedGroups: [],
  externalSessions: [],
  tabs: [
    {
      id: 1,
      name: '中3',
      config: { classes: [{ id: 1, label: '3S' }, { id: 2, label: '3A' }], subjectCounts: {} },
      schedule: {
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上', locked: true },
        [makeKey(1, 1, 2)]: { subject: '数学', teacher: '片岡' },
      },
    },
  ],
});

describe('セルの表 (B5)', () => {
  it('書き出した表を貼り戻すと変わらない', () => {
    const p = project();
    const tsv = cellsToTsv(p);
    expect(tsv.split('\n')[1]).toBe('中3\t12/25(金)\t1限 (13:00~)\t3S\t英語\t堀上\t○');
    const r = parseCellTsv(tsv, p, 1);
    expect(r.errorCount).toBe(0);
    expect(r.writes).toEqual([]);
  });

  it('貼った行だけ変え、空の行は空にする。ロックの列があればロックしたセルも書き換える', () => {
    const p = project();
    const text = [
      'タブ\t日付\t時限\tクラス\t科目\t講師\tロック',
      '中3\t12/25\t1限\t3S\t英語\t堀上\t',
      '中3\t12/25\t1限\t3A\t\t\t',
      '中3\t12/26\t1限\t3A\t数学\t片岡\t○',
    ].join('\n');
    const r = parseCellTsv(text, p, 1);
    expect(r.errorCount).toBe(0);
    const out = applyWritesToSchedule(p.tabs[0].schedule, r.writes).schedule;
    expect(out[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
    expect(out[makeKey(1, 1, 2)]).toBeUndefined();
    expect(out[makeKey(2, 1, 2)]).toEqual({ subject: '数学', teacher: '片岡', locked: true });
  });

  it('ロックの列が無ければロックしたセルは書き換えない。知らない科目・講師・セルはエラー', () => {
    const p = project();
    const text = [
      '日付\t時限\tクラス\t科目\t講師',
      '12/25\t1限\t3S\t数学\t片岡',
      '12/25\t1限\t3B\t英語\t堀上',
      '12/26\t1限\t3S\t理科\t堀上',
      '12/26\t1限\t3S\t英語\t誰か',
    ].join('\n');
    const r = parseCellTsv(text, p, 1);
    expect(r.rows.map((x) => x.status)).toEqual(['skipped', 'error', 'error', 'error']);
  });

  it('貼った後に増える問題 (NG・講師の重なり) を出す', () => {
    const p = project();
    const text = ['日付\t時限\tクラス\t科目\t講師', '12/26\t1限\t3S\t英語\t堀上', '12/25\t1限\t3A\t英語\t堀上'].join('\n');
    const r = parseCellTsv(text, p, 1);
    const problems = newProblemsAfterWrites(p, r.writes);
    expect(problems.some((x) => x.startsWith('NG: 堀上 12/26(土)'))).toBe(true);
    expect(problems.some((x) => x.startsWith('講師の重なり'))).toBe(true);
  });
});
