import { describe, expect, it } from 'vitest';
import {
  cleanupOldCombined,
  propagateAssignment,
  propagateTeacherChange,
} from './combinedPropagation';
import { makeKey } from './scheduleKey';

// v3: config の dates/classes は { id, label } 配列。引数は dateId, periodId, classId。
const config = {
  dates: [{ id: 1, label: '12/25(木)' }],
  periods: [{ id: 1, label: '1限' }],
  classes: [
    { id: 1, label: '３S' },
    { id: 2, label: '３A' },
    { id: 3, label: '３B' },
  ],
  subjectCounts: { '英語': 1, '数学': 1 },
};

const combinedGroupsSA = [
  { id: 1, subject: '英語', classes: ['３S', '３A'], dates: null },
];

describe('cleanupOldCombined', () => {
  it('合同グループ無し → schedule をそのまま返す', () => {
    const sch = { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } };
    const result = cleanupOldCombined(sch, config, [], 1, 1, 1, '英語');
    expect(result).toBe(sch);
  });

  it('oldSubject が空 → schedule をそのまま返す', () => {
    const sch = { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } };
    const result = cleanupOldCombined(sch, config, combinedGroupsSA, 1, 1, 1, '');
    expect(result).toBe(sch);
  });

  it('合同セカンダリの旧 subject を削除する (非ロックのみ)', () => {
    const sch = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' }, // ３S
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上' }, // ３A (合同)
    };
    const result = cleanupOldCombined(sch, config, combinedGroupsSA, 1, 1, 1, '英語');
    expect(result[makeKey(1, 1, 1)]).toBeDefined();
    expect(result[makeKey(1, 1, 2)]).toBeUndefined();
  });

  it('locked セカンダリは保持する', () => {
    const sch = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上', locked: true },
    };
    const result = cleanupOldCombined(sch, config, combinedGroupsSA, 1, 1, 1, '英語');
    expect(result[makeKey(1, 1, 2)]).toMatchObject({ subject: '英語', locked: true });
  });

  it('subject が異なるセカンダリは触らない (合同で無いセル)', () => {
    const sch = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
    };
    const result = cleanupOldCombined(sch, config, combinedGroupsSA, 1, 1, 1, '英語');
    expect(result[makeKey(1, 1, 2)]).toEqual({ subject: '数学', teacher: '田中' });
  });

  it('グループに含まれないクラス (３B) は触らない', () => {
    const sch = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 3)]: { subject: '英語', teacher: '堀上' },
    };
    const result = cleanupOldCombined(sch, config, combinedGroupsSA, 1, 1, 1, '英語');
    expect(result[makeKey(1, 1, 3)]).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('合同セカンダリが既に他の状態 → 変更なしなら同一参照を返す', () => {
    const sch = { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } };
    const result = cleanupOldCombined(sch, config, combinedGroupsSA, 1, 1, 1, '英語');
    expect(result).toBe(sch);
  });
});

describe('propagateAssignment', () => {
  it('entry.subject が空 → schedule をそのまま返す', () => {
    const sch = {};
    const result = propagateAssignment(sch, config, combinedGroupsSA, 1, 1, 1, { subject: '', teacher: '' });
    expect(result).toBe(sch);
  });

  it('合同グループ無し → schedule をそのまま返す', () => {
    const sch = {};
    const result = propagateAssignment(sch, config, [], 1, 1, 1, { subject: '英語', teacher: '堀上' });
    expect(result).toBe(sch);
  });

  it('合同セカンダリに entry を伝播する', () => {
    const sch = {};
    const result = propagateAssignment(sch, config, combinedGroupsSA, 1, 1, 1, {
      subject: '英語', teacher: '堀上',
    });
    expect(result[makeKey(1, 1, 2)]).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('entry に teacher が無い時はセカンダリも teacher: "" になる', () => {
    const sch = {};
    const result = propagateAssignment(sch, config, combinedGroupsSA, 1, 1, 1, { subject: '英語' });
    expect(result[makeKey(1, 1, 2)]).toEqual({ subject: '英語', teacher: '' });
  });

  it('locked セカンダリは上書きされない', () => {
    const sch = {
      [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中', locked: true },
    };
    const result = propagateAssignment(sch, config, combinedGroupsSA, 1, 1, 1, {
      subject: '英語', teacher: '堀上',
    });
    expect(result[makeKey(1, 1, 2)]).toMatchObject({ subject: '数学', teacher: '田中', locked: true });
  });

  it('既存のセカンダリ (非ロック) はマージで上書きされる', () => {
    const sch = {
      [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
    };
    const result = propagateAssignment(sch, config, combinedGroupsSA, 1, 1, 1, {
      subject: '英語', teacher: '堀上',
    });
    expect(result[makeKey(1, 1, 2)]).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('プライマリ自身は触らない', () => {
    const sch = { [makeKey(1, 1, 1)]: { subject: '元', teacher: '別' } };
    const result = propagateAssignment(sch, config, combinedGroupsSA, 1, 1, 1, {
      subject: '英語', teacher: '堀上',
    });
    expect(result[makeKey(1, 1, 1)]).toEqual({ subject: '元', teacher: '別' });
  });
});

describe('propagateTeacherChange', () => {
  it('subject が一致するセカンダリの teacher を更新する', () => {
    const sch = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上' },
    };
    const result = propagateTeacherChange(sch, config, combinedGroupsSA, 1, 1, 1, '英語', '田中');
    expect(result[makeKey(1, 1, 2)]).toEqual({ subject: '英語', teacher: '田中' });
  });

  it('subject が異なるセカンダリ (broken link) は触らない', () => {
    const sch = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
    };
    const result = propagateTeacherChange(sch, config, combinedGroupsSA, 1, 1, 1, '英語', '佐藤');
    expect(result[makeKey(1, 1, 2)]).toEqual({ subject: '数学', teacher: '田中' });
  });

  it('locked セカンダリは触らない', () => {
    const sch = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上', locked: true },
    };
    const result = propagateTeacherChange(sch, config, combinedGroupsSA, 1, 1, 1, '英語', '田中');
    expect(result[makeKey(1, 1, 2)]).toMatchObject({ teacher: '堀上', locked: true });
  });

  it('subject が空 / 合同グループ無し → schedule をそのまま返す', () => {
    const sch = { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } };
    expect(propagateTeacherChange(sch, config, combinedGroupsSA, 1, 1, 1, '', '田中')).toBe(sch);
    expect(propagateTeacherChange(sch, config, [], 1, 1, 1, '英語', '田中')).toBe(sch);
  });

  it('subject は変更せず teacher だけ書き換える', () => {
    const sch = { [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上', extra: 'x' } };
    const result = propagateTeacherChange(sch, config, combinedGroupsSA, 1, 1, 1, '英語', '田中');
    expect(result[makeKey(1, 1, 2)]).toEqual({ subject: '英語', teacher: '田中', extra: 'x' });
  });
});
