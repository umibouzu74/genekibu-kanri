import { describe, expect, it } from 'vitest';
import { computeAutoNgEntries, computeAutoNgByTeacher, isEffectivelyNg } from './autoNg';
import { makeNgKey } from './scheduleKey';

const PERIODS = [
  { id: 1, label: '1限 (13:00~13:45)' },
  { id: 2, label: '2限 (14:00~14:45)' },
  { id: 3, label: '3限 (15:00~15:45)' },
];

describe('computeAutoNgEntries', () => {
  it('時間が重なる時限のみをNGとして返す', () => {
    // 予備校 12:25-13:35 は 1限 (13:00-13:45) と重なる
    const sessions = [
      { id: 1, date: '7/29(水)', teacherName: '堀上', label: '', memo: '予備校',
        startTime: '12:25', endTime: '13:35' },
    ];
    const entries = computeAutoNgEntries('堀上', sessions, PERIODS);
    expect(entries.size).toBe(1);
    const k = makeNgKey('7/29(水)', '1限 (13:00~13:45)');
    expect(entries.has(k)).toBe(true);
    expect(entries.get(k).sessions[0].id).toBe(1);
  });

  it('他講師のセッションは無視', () => {
    const sessions = [
      { id: 1, date: '7/29(水)', teacherName: '田中', label: '', memo: '',
        startTime: '13:00', endTime: '13:30' },
    ];
    const entries = computeAutoNgEntries('堀上', sessions, PERIODS);
    expect(entries.size).toBe(0);
  });

  it('時刻情報の無いセッションは自動NGを生成しない', () => {
    const sessions = [
      { id: 1, date: '7/29(水)', teacherName: '堀上', label: '', memo: '予備校' },
    ];
    expect(computeAutoNgEntries('堀上', sessions, PERIODS).size).toBe(0);
  });

  it('label に時刻が書かれていれば構造化フィールド無しでも検出', () => {
    const sessions = [
      { id: 1, date: '7/29(水)', teacherName: '堀上', label: '12:25-13:35', memo: '' },
    ];
    const entries = computeAutoNgEntries('堀上', sessions, PERIODS);
    expect(entries.size).toBe(1);
  });

  it('複数日 × 複数時限の overlap を網羅', () => {
    // 予備校 14:30-16:00 → 2限 (14:00-14:45) と 3限 (15:00-15:45) と重なる
    const sessions = [
      { id: 1, date: '7/29(水)', teacherName: '堀上', label: '', memo: '',
        startTime: '14:30', endTime: '16:00' },
      { id: 2, date: '7/30(木)', teacherName: '堀上', label: '', memo: '',
        startTime: '14:30', endTime: '16:00' },
    ];
    const entries = computeAutoNgEntries('堀上', sessions, PERIODS);
    expect(entries.size).toBe(4);
    expect(entries.has(makeNgKey('7/29(水)', '2限 (14:00~14:45)'))).toBe(true);
    expect(entries.has(makeNgKey('7/29(水)', '3限 (15:00~15:45)'))).toBe(true);
    expect(entries.has(makeNgKey('7/30(木)', '2限 (14:00~14:45)'))).toBe(true);
    expect(entries.has(makeNgKey('7/30(木)', '3限 (15:00~15:45)'))).toBe(true);
  });

  it('同じNGキーが複数セッション由来なら sessions 配列に集約', () => {
    const sessions = [
      { id: 1, date: '7/29(水)', teacherName: '堀上', label: '', memo: '予備校A',
        startTime: '12:25', endTime: '13:35' },
      { id: 2, date: '7/29(水)', teacherName: '堀上', label: '', memo: '予備校B',
        startTime: '13:10', endTime: '13:50' },
    ];
    const entries = computeAutoNgEntries('堀上', sessions, PERIODS);
    const k = makeNgKey('7/29(水)', '1限 (13:00~13:45)');
    expect(entries.get(k).sessions).toHaveLength(2);
  });

  it('時限ラベルが時刻を含まない場合は overlap 不可なのでNGにならない', () => {
    const sessions = [
      { id: 1, date: '7/29(水)', teacherName: '堀上', label: '', memo: '',
        startTime: '12:25', endTime: '13:35' },
    ];
    const periodsNoTime = [{ id: 1, label: '1限' }];
    expect(computeAutoNgEntries('堀上', sessions, periodsNoTime).size).toBe(0);
  });

  it('引数が異常でも壊れない', () => {
    expect(computeAutoNgEntries('', [], PERIODS).size).toBe(0);
    expect(computeAutoNgEntries('堀上', null, PERIODS).size).toBe(0);
    expect(computeAutoNgEntries('堀上', [], null).size).toBe(0);
  });
});

describe('computeAutoNgByTeacher', () => {
  it('講師ごとの Map を一度に構築', () => {
    const teachers = [{ name: '堀上' }, { name: '田中' }];
    const sessions = [
      { id: 1, date: '7/29(水)', teacherName: '堀上', startTime: '13:00', endTime: '13:30' },
      { id: 2, date: '7/29(水)', teacherName: '田中', startTime: '14:00', endTime: '14:30' },
    ];
    const map = computeAutoNgByTeacher(teachers, sessions, PERIODS);
    expect(map.get('堀上').size).toBe(1);
    expect(map.get('田中').size).toBe(1);
  });
});

describe('isEffectivelyNg', () => {
  it('手動NG が含まれていれば true', () => {
    const teacher = { name: '堀上', ngSlots: [makeNgKey('7/29(水)', '1限')] };
    expect(isEffectivelyNg(teacher, new Map(), '7/29(水)', '1限')).toBe(true);
  });

  it('自動NG が含まれていれば true', () => {
    const teacher = { name: '堀上', ngSlots: [] };
    const auto = new Map([[makeNgKey('7/29(水)', '1限'), { sessions: [] }]]);
    expect(isEffectivelyNg(teacher, auto, '7/29(水)', '1限')).toBe(true);
  });

  it('どちらにも無ければ false', () => {
    const teacher = { name: '堀上', ngSlots: [] };
    expect(isEffectivelyNg(teacher, new Map(), '7/29(水)', '1限')).toBe(false);
  });
});
