import { describe, expect, it } from 'vitest';
import {
  canTeachSubject,
  isNgSlot,
  isNgClass,
  wouldExceedDailyLimit,
  isTeacherCandidateFor,
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
});
