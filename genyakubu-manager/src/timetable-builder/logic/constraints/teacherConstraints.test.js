import { describe, expect, it } from 'vitest';
import {
  canTeachSubject,
  isNgSlot,
  isNgClass,
  wouldExceedDailyLimit,
  wouldExceedTotalLimit,
  wouldExceedConsecutive,
  isTeacherCandidateFor,
  resolveTeacherDailyLimit,
} from './teacherConstraints';
import { makeNgKey, makeExternalKey } from '../../utils/scheduleKey';

const t = (overrides = {}) => ({
  name: '堀上',
  subjects: ['英語'],
  ngSlots: [],
  ngClasses: [],
  priorityClasses: [],
  ...overrides,
});

describe('canTeachSubject', () => {
  it('subjects に含まれるなら true', () => {
    expect(canTeachSubject(t({ subjects: ['英語'] }), '英語')).toBe(true);
  });
  it('subjects に含まれないなら false', () => {
    expect(canTeachSubject(t({ subjects: ['英語'] }), '数学')).toBe(false);
  });
  it('subjects 未定義でも false (落ちない)', () => {
    expect(canTeachSubject({ name: 'X' }, '英語')).toBe(false);
  });
});

describe('isNgSlot', () => {
  it('NG 一致なら true', () => {
    const teacher = t({ ngSlots: [makeNgKey('12/25', '1限')] });
    expect(isNgSlot(teacher, '12/25', '1限')).toBe(true);
  });
  it('NG 不一致なら false', () => {
    const teacher = t({ ngSlots: [makeNgKey('12/25', '1限')] });
    expect(isNgSlot(teacher, '12/25', '2限')).toBe(false);
  });
  it('ngSlots 未定義でも false', () => {
    expect(isNgSlot({ name: 'X' }, '12/25', '1限')).toBe(false);
  });

  it('autoNgEntries に該当キーがあれば true (手動NG 無くても)', () => {
    const teacher = t({ ngSlots: [] });
    const autoNg = new Map([[makeNgKey('12/25', '1限'), { sessions: [] }]]);
    expect(isNgSlot(teacher, '12/25', '1限', autoNg)).toBe(true);
  });

  it('autoNgEntries 未一致なら手動NGに従う', () => {
    const teacher = t({ ngSlots: [] });
    const autoNg = new Map([[makeNgKey('12/25', '2限'), { sessions: [] }]]);
    expect(isNgSlot(teacher, '12/25', '1限', autoNg)).toBe(false);
  });
});

describe('isNgClass', () => {
  it('NG class 一致で true', () => {
    expect(isNgClass(t({ ngClasses: ['３S'] }), '３S')).toBe(true);
  });
  it('NG class 不一致で false', () => {
    expect(isNgClass(t({ ngClasses: ['３S'] }), '３A')).toBe(false);
  });
  it('ngClasses 未定義でも false', () => {
    expect(isNgClass({ name: 'X' }, '３S')).toBe(false);
  });
});

describe('wouldExceedDailyLimit', () => {
  it('上限ちょうど (0+1 ≤ 6) は false', () => {
    expect(wouldExceedDailyLimit({
      teacherName: '堀上', date: '12/25', tempDaily: {}, maxDailyHours: 6,
    })).toBe(false);
  });

  it('上限を 1 超える (6+1 > 6) は true', () => {
    expect(wouldExceedDailyLimit({
      teacherName: '堀上', date: '12/25',
      tempDaily: { [makeExternalKey('12/25', '堀上')]: 6 },
      maxDailyHours: 6,
    })).toBe(true);
  });

  it('未定 (exempt) は上限を超えても false', () => {
    expect(wouldExceedDailyLimit({
      teacherName: '未定', date: '12/25',
      tempDaily: { [makeExternalKey('12/25', '未定')]: 100 },
      maxDailyHours: 6,
    })).toBe(false);
  });

  it('exemptName をカスタマイズできる', () => {
    expect(wouldExceedDailyLimit({
      teacherName: 'X', date: '12/25',
      tempDaily: { [makeExternalKey('12/25', 'X')]: 10 },
      maxDailyHours: 6, exemptName: 'X',
    })).toBe(false);
  });
});

describe('isTeacherCandidateFor', () => {
  const base = {
    teacher: t({ subjects: ['英語'], ngSlots: [], ngClasses: [] }),
    subject: '英語',
    date: '12/25',
    period: '1限',
    className: '３S',
    secondaryClassNames: [],
  };

  it('全制約 OK で true', () => {
    expect(isTeacherCandidateFor(base)).toBe(true);
  });

  it('subject NG (担当外) で false', () => {
    expect(isTeacherCandidateFor({ ...base, subject: '数学' })).toBe(false);
  });

  it('NG slot で false', () => {
    expect(isTeacherCandidateFor({
      ...base,
      teacher: t({ subjects: ['英語'], ngSlots: [makeNgKey('12/25', '1限')] }),
    })).toBe(false);
  });

  it('プライマリ NG class で false', () => {
    expect(isTeacherCandidateFor({
      ...base,
      teacher: t({ subjects: ['英語'], ngClasses: ['３S'] }),
    })).toBe(false);
  });

  it('secondary NG class でも false', () => {
    expect(isTeacherCandidateFor({
      ...base,
      teacher: t({ subjects: ['英語'], ngClasses: ['３A'] }),
      secondaryClassNames: ['３A'],
    })).toBe(false);
  });

  it('secondary に NG class が無ければ true', () => {
    expect(isTeacherCandidateFor({
      ...base,
      teacher: t({ subjects: ['英語'], ngClasses: [] }),
      secondaryClassNames: ['３A'],
    })).toBe(true);
  });

  it('autoNgEntries に該当キーがあれば false (自動NGを尊重)', () => {
    expect(isTeacherCandidateFor({
      ...base,
      autoNgEntries: new Map([[makeNgKey('12/25', '1限'), { sessions: [] }]]),
    })).toBe(false);
  });
});

describe('wouldExceedConsecutive', () => {
  const periodsOrder = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  // occupied: 講師が割り当て済みの periodId 集合
  const occ = (...ids) => (pid) => ids.includes(pid);

  it('maxConsecutive 0 / 未設定なら常に false (制限なし)', () => {
    expect(wouldExceedConsecutive({ periodsOrder, periodId: 2, isOccupied: occ(1), maxConsecutive: 0 })).toBe(false);
    expect(wouldExceedConsecutive({ periodsOrder, periodId: 2, isOccupied: occ(1), maxConsecutive: undefined })).toBe(false);
  });

  it('p1 既割当 + p2 を置くと連続2。上限2なら OK、上限1なら超過', () => {
    expect(wouldExceedConsecutive({ periodsOrder, periodId: 2, isOccupied: occ(1), maxConsecutive: 2 })).toBe(false);
    expect(wouldExceedConsecutive({ periodsOrder, periodId: 2, isOccupied: occ(1), maxConsecutive: 1 })).toBe(true);
  });

  it('p1,p3 既割当 + p2 を置くと連続3 (前後が繋がる)。上限2なら超過', () => {
    expect(wouldExceedConsecutive({ periodsOrder, periodId: 2, isOccupied: occ(1, 3), maxConsecutive: 2 })).toBe(true);
  });

  it('間が空いていれば連続にならない (p1 割当 + p3 を置く → run 1)', () => {
    expect(wouldExceedConsecutive({ periodsOrder, periodId: 3, isOccupied: occ(1), maxConsecutive: 1 })).toBe(false);
  });

  it('未知の periodId は false', () => {
    expect(wouldExceedConsecutive({ periodsOrder, periodId: 99, isOccupied: occ(1, 2), maxConsecutive: 1 })).toBe(false);
  });
});

describe('resolveTeacherDailyLimit (L3a)', () => {
  it('講師個別値 (正の有限数) があればそれを返す', () => {
    expect(resolveTeacherDailyLimit(t({ maxDailyHours: 2 }), 6)).toBe(2);
  });

  it('未設定 / 0 / 不正値は project 全体値へフォールバック', () => {
    expect(resolveTeacherDailyLimit(t(), 6)).toBe(6);
    expect(resolveTeacherDailyLimit(t({ maxDailyHours: 0 }), 6)).toBe(6);
    expect(resolveTeacherDailyLimit(t({ maxDailyHours: -1 }), 6)).toBe(6);
    expect(resolveTeacherDailyLimit(t({ maxDailyHours: NaN }), 6)).toBe(6);
    expect(resolveTeacherDailyLimit(null, 6)).toBe(6);
    expect(resolveTeacherDailyLimit(undefined, 6)).toBe(6);
  });
});

describe('wouldExceedTotalLimit (L3b)', () => {
  it('上限に達していれば true (次の 1 コマで超過)', () => {
    expect(wouldExceedTotalLimit({
      teacher: t({ maxTotalHours: 3 }),
      tempTotal: { '堀上': 3 },
    })).toBe(true);
  });

  it('上限未満なら false', () => {
    expect(wouldExceedTotalLimit({
      teacher: t({ maxTotalHours: 3 }),
      tempTotal: { '堀上': 2 },
    })).toBe(false);
    expect(wouldExceedTotalLimit({
      teacher: t({ maxTotalHours: 3 }),
      tempTotal: {},
    })).toBe(false);
  });

  it('上限未設定 / 0 / 不正値は制約なし', () => {
    expect(wouldExceedTotalLimit({ teacher: t(), tempTotal: { '堀上': 99 } })).toBe(false);
    expect(wouldExceedTotalLimit({ teacher: t({ maxTotalHours: 0 }), tempTotal: { '堀上': 99 } })).toBe(false);
    expect(wouldExceedTotalLimit({ teacher: t({ maxTotalHours: NaN }), tempTotal: { '堀上': 99 } })).toBe(false);
  });

  it('未定 (exemptName) は対象外', () => {
    expect(wouldExceedTotalLimit({
      teacher: t({ name: '未定', maxTotalHours: 1 }),
      tempTotal: { '未定': 5 },
    })).toBe(false);
  });
});
