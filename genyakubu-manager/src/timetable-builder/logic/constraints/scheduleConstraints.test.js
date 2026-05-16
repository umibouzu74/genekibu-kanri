import { describe, expect, it } from 'vitest';
import {
  hasSubjectInSameDayClass,
  hasSubjectInSameDayClassExcept,
  hasTeacherInSamePeriod,
  hasSubjectQuotaRemaining,
} from './scheduleConstraints';
import { makeKey } from '../../utils/scheduleKey';

const periods = ['1限', '2限', '3限'];
const classes = ['３S', '３A', '３B'];

describe('hasSubjectInSameDayClass', () => {
  it('同日同クラスに subject があれば true', () => {
    const schedule = { [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' } };
    expect(hasSubjectInSameDayClass(schedule, periods, 0, 0, '英語')).toBe(true);
  });

  it('別の subject なら false', () => {
    const schedule = { [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' } };
    expect(hasSubjectInSameDayClass(schedule, periods, 0, 0, '数学')).toBe(false);
  });

  it('別の class なら false', () => {
    const schedule = { [makeKey(0, 0, 1)]: { subject: '英語', teacher: '堀上' } };
    expect(hasSubjectInSameDayClass(schedule, periods, 0, 0, '英語')).toBe(false);
  });
});

describe('hasSubjectInSameDayClassExcept', () => {
  it('除外 pIdx 以外で subject 一致なら true', () => {
    const schedule = { [makeKey(0, 1, 0)]: { subject: '英語', teacher: '堀上' } };
    expect(hasSubjectInSameDayClassExcept(schedule, periods, 0, 0, '英語', 0)).toBe(true);
  });

  it('除外 pIdx でしか subject が無ければ false', () => {
    const schedule = { [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' } };
    expect(hasSubjectInSameDayClassExcept(schedule, periods, 0, 0, '英語', 0)).toBe(false);
  });
});

describe('hasTeacherInSamePeriod', () => {
  it('同日同時限の他クラスに同講師なら true', () => {
    const schedule = { [makeKey(0, 0, 1)]: { subject: '英語', teacher: '堀上' } };
    expect(hasTeacherInSamePeriod(schedule, classes, 0, 0, 0, '堀上')).toBe(true);
  });

  it('別講師なら false', () => {
    const schedule = { [makeKey(0, 0, 1)]: { subject: '英語', teacher: '田中' } };
    expect(hasTeacherInSamePeriod(schedule, classes, 0, 0, 0, '堀上')).toBe(false);
  });

  it('自分のクラスは除外して判定 (cIdx の cell は無視)', () => {
    const schedule = { [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' } };
    expect(hasTeacherInSamePeriod(schedule, classes, 0, 0, 0, '堀上')).toBe(false);
  });

  it('合同グループの他クラスは excludedCIndices で除外できる', () => {
    const schedule = { [makeKey(0, 0, 1)]: { subject: '英語', teacher: '堀上' } };
    expect(hasTeacherInSamePeriod(schedule, classes, 0, 0, 0, '堀上', [1])).toBe(false);
  });
});

describe('hasSubjectQuotaRemaining', () => {
  const subjectCounts = { 英語: 3, 数学: 2 };

  it('残りがあれば true', () => {
    const tempCounts = { 0: { 英語: 2 } };
    expect(hasSubjectQuotaRemaining(tempCounts, 0, '英語', subjectCounts)).toBe(true);
  });

  it('上限ちょうどなら false', () => {
    const tempCounts = { 0: { 英語: 3 } };
    expect(hasSubjectQuotaRemaining(tempCounts, 0, '英語', subjectCounts)).toBe(false);
  });

  it('上限を超えても false', () => {
    const tempCounts = { 0: { 英語: 4 } };
    expect(hasSubjectQuotaRemaining(tempCounts, 0, '英語', subjectCounts)).toBe(false);
  });

  it('subjectCounts に無い科目は 0 扱いで false', () => {
    const tempCounts = { 0: {} };
    expect(hasSubjectQuotaRemaining(tempCounts, 0, '未定義', subjectCounts)).toBe(false);
  });
});
