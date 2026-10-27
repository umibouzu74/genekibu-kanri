import { describe, expect, it } from 'vitest';
import {
  buildSessionCsvTemplate,
  normalizeTimeText,
  parseSessionCsv,
  resolveSessionDates,
} from './sessionCsvImport';

const POOL = [
  { id: 1, label: '12/25(金)' },
  { id: 2, label: '12/26(土)' },
  { id: 3, label: '12/28(月)' },
  { id: 4, label: '1/4(月)' },
  { id: 5, label: '1/5(火)' },
  { id: 6, label: '1/6(水)' },
  { id: 7, label: '1/7(木)' },
];
const TEACHERS = ['半田', '滝澤', '武下', '井上'];

describe('normalizeTimeText', () => {
  it('いろいろな書き方の時刻を HH:mm にそろえる', () => {
    expect(normalizeTimeText('9:00')).toBe('09:00');
    expect(normalizeTimeText('09:00')).toBe('09:00');
    expect(normalizeTimeText('９：３０')).toBe('09:30');
    expect(normalizeTimeText('1210')).toBe('12:10');
    expect(normalizeTimeText('900')).toBe('09:00');
    expect(normalizeTimeText('9時')).toBe('09:00');
    expect(normalizeTimeText('9時30分')).toBe('09:30');
    expect(normalizeTimeText('9時半')).toBe('09:30');
  });

  it('読めない時刻は null', () => {
    expect(normalizeTimeText('')).toBeNull();
    expect(normalizeTimeText('25:00')).toBeNull();
    expect(normalizeTimeText('午前')).toBeNull();
    expect(normalizeTimeText('9')).toBeNull();
  });
});

describe('resolveSessionDates', () => {
  it('月日でプールのラベルに合わせる (曜日つき・年つき・漢字も)', () => {
    expect(resolveSessionDates('12/25', POOL).labels).toEqual(['12/25(金)']);
    expect(resolveSessionDates('12/25(金)', POOL).labels).toEqual(['12/25(金)']);
    expect(resolveSessionDates('2026-12-26', POOL).labels).toEqual(['12/26(土)']);
    expect(resolveSessionDates('12月28日', POOL).labels).toEqual(['12/28(月)']);
  });

  it('「・」で並べた日と、月を省いた日を読む', () => {
    expect(resolveSessionDates('12/25・26・28', POOL).labels).toEqual(['12/25(金)', '12/26(土)', '12/28(月)']);
    expect(resolveSessionDates('1/4、1/5', POOL).labels).toEqual(['1/4(月)', '1/5(火)']);
  });

  it('期間は年をまたいでもプールの日だけ', () => {
    expect(resolveSessionDates('12/25〜12/28', POOL).labels).toEqual(['12/25(金)', '12/26(土)', '12/28(月)']);
    expect(resolveSessionDates('12/28 ~ 1/5', POOL).labels).toEqual(['12/28(月)', '1/4(月)', '1/5(火)']);
    expect(resolveSessionDates('1/4〜7', POOL).labels).toEqual(['1/4(月)', '1/5(火)', '1/6(水)', '1/7(木)']);
  });

  it('プールに無い日・読めない語は unknown に返す', () => {
    const r = resolveSessionDates('12/25・12/27・あした', POOL);
    expect(r.labels).toEqual(['12/25(金)']);
    expect(r.unknown).toEqual(['12/27', 'あした']);
  });
});

describe('parseSessionCsv', () => {
  it('講師 × 日付に展開し、時刻とメモを持たせる', () => {
    const r = parseSessionCsv(
      '講師,日付,開始,終了,メモ\n半田,12/25・26,9:00,10:10,予備校１限\n滝澤・武下,1/4,12:25,13:35,予備校３限',
      { teacherNames: TEACHERS, poolDates: POOL },
    );
    expect(r.errors).toEqual([]);
    expect(r.rows.map(x => [x.teacherName, x.date, x.startTime, x.endTime, x.memo])).toEqual([
      ['半田', '12/25(金)', '09:00', '10:10', '予備校１限'],
      ['半田', '12/26(土)', '09:00', '10:10', '予備校１限'],
      ['滝澤', '1/4(月)', '12:25', '13:35', '予備校３限'],
      ['武下', '1/4(月)', '12:25', '13:35', '予備校３限'],
    ]);
  });

  it('タブ区切り (Excel からの貼り付け) と英語の見出しも読む', () => {
    const r = parseSessionCsv('teacher\tdate\tstart\tend\tmemo\n井上\t12/28\t9:00\t16:10\t高3', {
      teacherNames: TEACHERS, poolDates: POOL,
    });
    expect(r.rows).toEqual([{ line: 2, teacherName: '井上', date: '12/28(月)', startTime: '09:00', endTime: '16:10', memo: '高3', course: '' }]);
  });

  it('「時刻」の列 1 つでも、開始の欄の範囲でもよい', () => {
    const a = parseSessionCsv('講師,日付,時刻\n半田,12/25,9:00〜10:10', { teacherNames: TEACHERS, poolDates: POOL });
    expect(a.rows[0]).toMatchObject({ startTime: '09:00', endTime: '10:10' });
    const b = parseSessionCsv('講師,日付,開始\n半田,12/25,9:00-10:10', { teacherNames: TEACHERS, poolDates: POOL });
    expect(b.rows[0]).toMatchObject({ startTime: '09:00', endTime: '10:10' });
  });

  it('同じ内容の行は 1 件にまとめる', () => {
    const r = parseSessionCsv('講師,日付,開始,終了\n半田,12/25,9:00,10:10\n半田,12/25,9:00,10:10', {
      teacherNames: TEACHERS, poolDates: POOL,
    });
    expect(r.rows).toHaveLength(1);
  });

  it('講師マスタに無い名前・プールに無い日は登録せずに知らせる', () => {
    const r = parseSessionCsv('講師,日付,開始,終了\n半田・高松,12/25・12/27,9:00,10:10', {
      teacherNames: TEACHERS, poolDates: POOL,
    });
    expect(r.rows.map(x => `${x.teacherName} ${x.date}`)).toEqual(['半田 12/25(金)']);
    expect(r.unknownTeachers).toEqual(['高松']);
    expect(r.unknownDates).toEqual(['12/27']);
  });

  it('読めない行は理由つきのエラー', () => {
    const r = parseSessionCsv(
      '講師,日付,開始,終了\n,12/25,9:00,10:10\n半田,,9:00,10:10\n半田,12/25,あさ,10:10\n半田,12/25,11:00,10:10\n半田,12/24,9:00,10:10\n半田,12/25,,10:10',
      { teacherNames: TEACHERS, poolDates: POOL },
    );
    expect(r.rows).toEqual([]);
    expect(r.errors.map(e => e.line)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(r.errors[2].message).toContain('あさ');
    expect(r.errors[4].message).toContain('日付プールにありません');
  });

  it('時刻の無い行は登録するが数を返す', () => {
    const r = parseSessionCsv('講師,日付,メモ\n半田,12/25,予備校', { teacherNames: TEACHERS, poolDates: POOL });
    expect(r.rows).toEqual([{ line: 2, teacherName: '半田', date: '12/25(金)', memo: '予備校', course: '' }]);
    expect(r.untimedCount).toBe(1);
  });

  it('見出しに講師・日付が無ければエラー', () => {
    const r = parseSessionCsv('name,when\n半田,12/25', { teacherNames: TEACHERS, poolDates: POOL });
    expect(r.rows).toEqual([]);
    expect(r.errors[0].message).toContain('講師');
  });
});

describe('buildSessionCsvTemplate', () => {
  it('今の講師・日付で雛形を作り、そのまま読める', () => {
    const text = buildSessionCsvTemplate(['未定', ...TEACHERS], POOL.map(d => d.label));
    expect(text.split('\n')[0]).toBe('講師,日付,開始,終了,メモ,講座名');
    const r = parseSessionCsv(text, { teacherNames: TEACHERS, poolDates: POOL });
    expect(r.errors).toEqual([]);
    expect(r.rows.length).toBe(5);
  });
});
