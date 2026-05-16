import { describe, expect, it } from 'vitest';
import {
  cleanupOldCombined,
  propagateAssignment,
  propagateTeacherChange,
} from './combinedPropagation';
import { makeKey } from './scheduleKey';

// 共通の小さな config を使い回す。
const config = {
  dates: ['12/25(木)'],
  periods: ['1限'],
  classes: ['３S', '３A', '３B'],
  subjectCounts: { '英語': 1, '数学': 1 },
};

const combinedGroupsSA = [
  { id: 1, subject: '英語', classes: ['３S', '３A'], dates: null },
];

describe('cleanupOldCombined', () => {
  it('合同グループ無し → schedule をそのまま返す', () => {
    const sch = { [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' } };
    const result = cleanupOldCombined(sch, config, [], 0, 0, 0, '英語');
    expect(result).toBe(sch);
  });

  it('oldSubject が空 → schedule をそのまま返す', () => {
    const sch = { [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' } };
    const result = cleanupOldCombined(sch, config, combinedGroupsSA, 0, 0, 0, '');
    expect(result).toBe(sch);
  });

  it('合同セカンダリの旧 subject を削除する (非ロックのみ)', () => {
    const sch = {
      [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' }, // ３S
      [makeKey(0, 0, 1)]: { subject: '英語', teacher: '堀上' }, // ３A (合同)
    };
    const result = cleanupOldCombined(sch, config, combinedGroupsSA, 0, 0, 0, '英語');
    expect(result[makeKey(0, 0, 0)]).toBeDefined(); // 自分は触らない
    expect(result[makeKey(0, 0, 1)]).toBeUndefined(); // 合同セカンダリは削除
  });

  it('locked セカンダリは保持する', () => {
    const sch = {
      [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' },
      [makeKey(0, 0, 1)]: { subject: '英語', teacher: '堀上', locked: true },
    };
    const result = cleanupOldCombined(sch, config, combinedGroupsSA, 0, 0, 0, '英語');
    expect(result[makeKey(0, 0, 1)]).toMatchObject({ subject: '英語', locked: true });
  });

  it('subject が異なるセカンダリは触らない (合同で無いセル)', () => {
    const sch = {
      [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' },
      [makeKey(0, 0, 1)]: { subject: '数学', teacher: '田中' }, // 別の科目
    };
    const result = cleanupOldCombined(sch, config, combinedGroupsSA, 0, 0, 0, '英語');
    expect(result[makeKey(0, 0, 1)]).toEqual({ subject: '数学', teacher: '田中' });
  });

  it('グループに含まれないクラス (３B) は触らない', () => {
    const sch = {
      [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' },
      [makeKey(0, 0, 2)]: { subject: '英語', teacher: '堀上' }, // ３B (合同外)
    };
    const result = cleanupOldCombined(sch, config, combinedGroupsSA, 0, 0, 0, '英語');
    expect(result[makeKey(0, 0, 2)]).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('合同セカンダリが既に他の状態 → 変更なしなら同一参照を返す', () => {
    const sch = { [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' } };
    const result = cleanupOldCombined(sch, config, combinedGroupsSA, 0, 0, 0, '英語');
    expect(result).toBe(sch);
  });
});

describe('propagateAssignment', () => {
  it('entry.subject が空 → schedule をそのまま返す', () => {
    const sch = {};
    const result = propagateAssignment(sch, config, combinedGroupsSA, 0, 0, 0, { subject: '', teacher: '' });
    expect(result).toBe(sch);
  });

  it('合同グループ無し → schedule をそのまま返す', () => {
    const sch = {};
    const result = propagateAssignment(sch, config, [], 0, 0, 0, { subject: '英語', teacher: '堀上' });
    expect(result).toBe(sch);
  });

  it('合同セカンダリに entry を伝播する', () => {
    const sch = {};
    const result = propagateAssignment(sch, config, combinedGroupsSA, 0, 0, 0, {
      subject: '英語', teacher: '堀上',
    });
    expect(result[makeKey(0, 0, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('entry に teacher が無い時はセカンダリも teacher: "" になる', () => {
    const sch = {};
    const result = propagateAssignment(sch, config, combinedGroupsSA, 0, 0, 0, { subject: '英語' });
    expect(result[makeKey(0, 0, 1)]).toEqual({ subject: '英語', teacher: '' });
  });

  it('locked セカンダリは上書きされない', () => {
    const sch = {
      [makeKey(0, 0, 1)]: { subject: '数学', teacher: '田中', locked: true },
    };
    const result = propagateAssignment(sch, config, combinedGroupsSA, 0, 0, 0, {
      subject: '英語', teacher: '堀上',
    });
    expect(result[makeKey(0, 0, 1)]).toMatchObject({ subject: '数学', teacher: '田中', locked: true });
  });

  it('既存のセカンダリ (非ロック) はマージで上書きされる', () => {
    const sch = {
      [makeKey(0, 0, 1)]: { subject: '数学', teacher: '田中' },
    };
    const result = propagateAssignment(sch, config, combinedGroupsSA, 0, 0, 0, {
      subject: '英語', teacher: '堀上',
    });
    expect(result[makeKey(0, 0, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('プライマリ自身は触らない', () => {
    const sch = { [makeKey(0, 0, 0)]: { subject: '元', teacher: '別' } };
    const result = propagateAssignment(sch, config, combinedGroupsSA, 0, 0, 0, {
      subject: '英語', teacher: '堀上',
    });
    expect(result[makeKey(0, 0, 0)]).toEqual({ subject: '元', teacher: '別' });
  });
});

describe('propagateTeacherChange', () => {
  it('subject が一致するセカンダリの teacher を更新する', () => {
    const sch = {
      [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' },
      [makeKey(0, 0, 1)]: { subject: '英語', teacher: '堀上' },
    };
    const result = propagateTeacherChange(sch, config, combinedGroupsSA, 0, 0, 0, '英語', '田中');
    expect(result[makeKey(0, 0, 1)]).toEqual({ subject: '英語', teacher: '田中' });
  });

  it('subject が異なるセカンダリ (broken link) は触らない', () => {
    const sch = {
      [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' },
      [makeKey(0, 0, 1)]: { subject: '数学', teacher: '田中' },
    };
    const result = propagateTeacherChange(sch, config, combinedGroupsSA, 0, 0, 0, '英語', '佐藤');
    expect(result[makeKey(0, 0, 1)]).toEqual({ subject: '数学', teacher: '田中' });
  });

  it('locked セカンダリは触らない', () => {
    const sch = {
      [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' },
      [makeKey(0, 0, 1)]: { subject: '英語', teacher: '堀上', locked: true },
    };
    const result = propagateTeacherChange(sch, config, combinedGroupsSA, 0, 0, 0, '英語', '田中');
    expect(result[makeKey(0, 0, 1)]).toMatchObject({ teacher: '堀上', locked: true });
  });

  it('subject が空 / 合同グループ無し → schedule をそのまま返す', () => {
    const sch = { [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' } };
    expect(propagateTeacherChange(sch, config, combinedGroupsSA, 0, 0, 0, '', '田中')).toBe(sch);
    expect(propagateTeacherChange(sch, config, [], 0, 0, 0, '英語', '田中')).toBe(sch);
  });

  it('subject は変更せず teacher だけ書き換える', () => {
    const sch = { [makeKey(0, 0, 1)]: { subject: '英語', teacher: '堀上', extra: 'x' } };
    const result = propagateTeacherChange(sch, config, combinedGroupsSA, 0, 0, 0, '英語', '田中');
    // subject, extra は保たれる
    expect(result[makeKey(0, 0, 1)]).toEqual({ subject: '英語', teacher: '田中', extra: 'x' });
  });
});
