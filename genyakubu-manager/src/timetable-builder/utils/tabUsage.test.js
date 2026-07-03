import { describe, expect, it } from 'vitest';
import { forEachCountedAssignment } from './tabUsage';
import { makeKey } from './scheduleKey';

// F2j: ソルバ (collectOtherTabsUsage) と分析 (computeGlobalUsage) が共有する
// 「どのセルを 1 コマと数えるか」規則の単体テスト。消費側の統合的な挙動は
// autoGenerator.test.js (他タブ考慮) と analysisHelpers.test.js が固定する。

const pool = {
  dates: [{ id: 1, label: '7/1' }, { id: 2, label: '7/2' }],
  periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
};

const makeTab = (schedule, config = {}) => ({
  id: 1,
  name: 'タブ',
  config: {
    classes: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }],
    subjectCounts: {},
    ...config,
  },
  schedule,
});

const collect = (tab, groups = [], exempt = '未定') => {
  const visited = [];
  forEachCountedAssignment(pool, tab, groups, exempt, v => visited.push(v));
  return visited;
};

describe('forEachCountedAssignment (F2j)', () => {
  it('通常セルを label 解決付きで visit する', () => {
    const tab = makeTab({ [makeKey(1, 1, 1)]: { subject: '英語', teacher: '田中' } });
    const visited = collect(tab);
    expect(visited).toHaveLength(1);
    expect(visited[0].dateEnt.label).toBe('7/1');
    expect(visited[0].periodEnt.label).toBe('1限');
    expect(visited[0].classEnt.label).toBe('A');
    expect(visited[0].isCombinedDuplicate).toBe(false);
    expect(visited[0].group).toBeNull();
  });

  it('teacher 無し / exemptTeacher は数えない', () => {
    const tab = makeTab({
      [makeKey(1, 1, 1)]: { subject: '英語' },
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '未定' },
      [makeKey(1, 2, 1)]: { subject: '数学', teacher: '田中' },
    });
    const visited = collect(tab);
    expect(visited).toHaveLength(1);
    expect(visited[0].entry.teacher).toBe('田中');
  });

  it('パース不能キー / stale セル (使わない日・時限・消えたクラス) は数えない', () => {
    const tab = makeTab(
      {
        broken: { subject: '英語', teacher: '田中' },
        [makeKey(2, 1, 1)]: { subject: '英語', teacher: '田中' }, // 使わない日
        [makeKey(1, 2, 1)]: { subject: '英語', teacher: '田中' }, // 使わない時限
        [makeKey(1, 1, 99)]: { subject: '英語', teacher: '田中' }, // 消えたクラス
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '田中' }, // 有効
      },
      { activeDateIds: [1], activePeriodIds: [1] },
    );
    const visited = collect(tab);
    expect(visited).toHaveLength(1);
    expect(visited[0].key).toBe(makeKey(1, 1, 1));
  });

  it('合同グループは (date, period, group, teacher) につき 2 枚目以降が duplicate 扱い', () => {
    const groups = [{ id: 1, subject: '英語', classes: ['A', 'B'], dates: null }];
    const tab = makeTab({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '田中' },
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '田中' },
    });
    const visited = collect(tab, groups);
    expect(visited).toHaveLength(2); // busy 判定用に両方 visit される
    expect(visited.map(v => v.isCombinedDuplicate)).toEqual([false, true]);
    expect(visited[0].group).toBe(groups[0]);
  });

  it('合同でも講師が違えば別コマとして数える (壊れた状態の日次カウント欠落防止)', () => {
    const groups = [{ id: 1, subject: '英語', classes: ['A', 'B'], dates: null }];
    const tab = makeTab({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '田中' },
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '佐藤' },
    });
    const visited = collect(tab, groups);
    expect(visited.map(v => v.isCombinedDuplicate)).toEqual([false, false]);
  });

  it('schedule / combinedGroups が無くても安全', () => {
    expect(collect(makeTab(undefined), null)).toEqual([]);
  });
});
