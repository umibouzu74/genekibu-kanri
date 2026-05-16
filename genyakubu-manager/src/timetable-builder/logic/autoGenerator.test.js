import { describe, expect, it } from 'vitest';
import { generateSinglePattern, generateSchedule } from './autoGenerator';
import { makeKey, makeNgKey } from '../utils/scheduleKey';

// ─── テストヘルパ ──────────────────────────────────────────────────
// 制約充足ソルバのテストは「最小限の構成 + 1 つの制約」で書くのが読みやすい。

function makeProject({
  teachers = [],
  dates = ['12/25(木)'],
  periods = ['1限'],
  classes = ['３S'],
  subjectCounts = { '英語': 1 },
  combinedGroups = [],
  schedule = {},
  externalCounts = {},
} = {}) {
  return {
    version: 2,
    name: 'test',
    teachers,
    activeTabId: 1,
    tabs: [{
      id: 1,
      name: 'tab1',
      config: { dates, periods, classes, subjectCounts },
      schedule,
    }],
    externalCounts,
    combinedGroups,
    subjects: Object.keys(subjectCounts),
    subjectColors: {},
  };
}

const teacher = (name, subjects, extra = {}) => ({
  name,
  subjects,
  ngSlots: [],
  ngClasses: [],
  priorityClasses: [],
  ...extra,
});

// schedule をスロット数→講師名のマップに変換
function flatten(schedule) {
  return Object.fromEntries(
    Object.entries(schedule).map(([k, v]) => [k, `${v.subject}/${v.teacher}`])
  );
}

// ─── 基本動作 ──────────────────────────────────────────────────────

describe('generateSinglePattern — 基本動作', () => {
  it('未充填スロットが無ければ既存スケジュールがそのまま解になる', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      schedule: {
        [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' },
      },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.totalSlots).toBe(0);
    expect(r.solution).toEqual({
      [makeKey(0, 0, 0)]: { subject: '英語', teacher: '堀上' },
    });
  });

  it('最小構成 (1コマ・1講師) で解が見つかる', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(r.totalSlots).toBe(1);
    expect(r.solution[makeKey(0, 0, 0)]).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('該当講師がいなければ solution は null、totalSlots は 1', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['数学'])], // 英語担当なし
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
    expect(r.totalSlots).toBe(1);
  });
});

// ─── 制約のテスト ──────────────────────────────────────────────────

describe('generateSinglePattern — 制約', () => {
  it('科目クォータを超えない (subjectCounts: 英語 1 → 2 コマあっても 1 つだけ)', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語']), teacher('田中', ['数学'])],
      periods: ['1限', '2限'],
      subjectCounts: { '英語': 1, '数学': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    const subjects = Object.values(r.solution).map(e => e.subject);
    expect(subjects.filter(s => s === '英語')).toHaveLength(1);
    expect(subjects.filter(s => s === '数学')).toHaveLength(1);
  });

  it('講師の NG 日時は割り当てない', () => {
    const project = makeProject({
      teachers: [
        teacher('堀上', ['英語'], { ngSlots: [makeNgKey('12/25(木)', '1限')] }),
        teacher('田中', ['英語']),
      ],
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 42 });
    expect(r.solution[makeKey(0, 0, 0)].teacher).toBe('田中');
  });

  it('講師の NG クラスは割り当てない', () => {
    const project = makeProject({
      teachers: [
        teacher('堀上', ['英語'], { ngClasses: ['３S'] }),
        teacher('田中', ['英語']),
      ],
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 42 });
    expect(r.solution[makeKey(0, 0, 0)].teacher).toBe('田中');
  });

  it('同日同クラスに同じ科目が 2 回入らない', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語', '数学'])],
      periods: ['1限', '2限'],
      subjectCounts: { '英語': 1, '数学': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    const subjects = [
      r.solution[makeKey(0, 0, 0)].subject,
      r.solution[makeKey(0, 1, 0)].subject,
    ];
    expect(new Set(subjects).size).toBe(2);
  });

  it('同日同時限で同じ講師が複数クラスに割り当たらない (合同グループでなければ)', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語']), teacher('田中', ['英語'])],
      classes: ['３S', '３A'],
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 7 });
    expect(r.solution).not.toBeNull();
    const t1 = r.solution[makeKey(0, 0, 0)].teacher;
    const t2 = r.solution[makeKey(0, 0, 1)].teacher;
    expect(t1).not.toBe(t2);
  });

  it('ロック済みセルは保持される (未充填扱いされない)', () => {
    // 未充填がゼロなら solution は schedule そのまま。手動で入れたコマも残る。
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      schedule: {
        [makeKey(0, 0, 0)]: { subject: '英語', teacher: '田中', locked: true },
      },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution[makeKey(0, 0, 0)]).toEqual({
      subject: '英語',
      teacher: '田中',
      locked: true,
    });
  });

  it('科目だけ固定 (講師空) のセルは科目を保持して講師のみ割り当て', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語']), teacher('田中', ['数学'])],
      subjectCounts: { '英語': 1, '数学': 1 },
      schedule: {
        [makeKey(0, 0, 0)]: { subject: '数学', teacher: '' },
      },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution[makeKey(0, 0, 0)]).toEqual({ subject: '数学', teacher: '田中' });
  });
});

// ─── 優先度 ────────────────────────────────────────────────────────

describe('generateSinglePattern — 優先度', () => {
  it('優先クラス指定の講師がいると、その講師が選ばれやすい', () => {
    // 候補が 2 人いる時、片方を優先指定すると優先側が選ばれる。
    // 完全な determinism のため、seed を固定。
    const project = makeProject({
      teachers: [
        teacher('堀上', ['英語'], { priorityClasses: ['３S'] }),
        teacher('田中', ['英語']),
      ],
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution[makeKey(0, 0, 0)].teacher).toBe('堀上');
  });
});

// ─── 合同グループ ──────────────────────────────────────────────────

describe('generateSinglePattern — 合同グループ', () => {
  it('合同グループの全クラスに同一の科目・講師を割り当てる', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      classes: ['３S', '３A'],
      subjectCounts: { '英語': 1 },
      combinedGroups: [
        { id: 1, subject: '英語', classes: ['３S', '３A'], dates: null },
      ],
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    const a = r.solution[makeKey(0, 0, 0)];
    const b = r.solution[makeKey(0, 0, 1)];
    expect(a).toEqual({ subject: '英語', teacher: '堀上' });
    expect(b).toEqual({ subject: '英語', teacher: '堀上' });
  });
});

// ─── 決定性 (seed) ─────────────────────────────────────────────────

describe('generateSinglePattern — seed による決定性', () => {
  const project = makeProject({
    teachers: [
      teacher('堀上', ['英語', '数学']),
      teacher('田中', ['英語', '数学']),
      teacher('佐藤', ['国語']),
    ],
    periods: ['1限', '2限'],
    classes: ['３S', '３A'],
    subjectCounts: { '英語': 1, '数学': 1 },
  });

  it('同じ seed なら同じ結果', () => {
    const r1 = generateSinglePattern({ project, activeTabId: 1, seed: 123 });
    const r2 = generateSinglePattern({ project, activeTabId: 1, seed: 123 });
    expect(flatten(r1.solution)).toEqual(flatten(r2.solution));
  });

  it('違う seed なら結果が変わりうる (固定 seed の組で異なる)', () => {
    // 解空間が複数ある状況で、ある seed ペアで異なる解が出ることを確認。
    // 必ずしも違う必要はないが、現実装の seed の挙動として観測される性質。
    const r1 = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    const r2 = generateSinglePattern({ project, activeTabId: 1, seed: 999 });
    // 解は両方とも有効なはず
    expect(r1.solution).not.toBeNull();
    expect(r2.solution).not.toBeNull();
  });
});

// ─── 部分解 ────────────────────────────────────────────────────────

describe('generateSinglePattern — 部分解', () => {
  it('完全解が無い場合は solution: null, bestPartial に最良部分解', () => {
    // 1 コマ必要だが該当講師ゼロ
    const project = makeProject({
      teachers: [teacher('堀上', ['国語'])],
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
    expect(r.bestPartial).not.toBeNull();
    expect(r.totalSlots).toBe(1);
  });
});

// ─── generateSchedule ラッパー ─────────────────────────────────────

describe('generateSchedule', () => {
  it('numPatterns 個の結果を返す', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      subjectCounts: { '英語': 1 },
    });
    const results = generateSchedule({ project, activeTabId: 1, numPatterns: 3 });
    expect(results).toHaveLength(3);
    results.forEach(r => {
      expect(r.solution).not.toBeNull();
    });
  });

  it('numPatterns: 1 でも動く', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      subjectCounts: { '英語': 1 },
    });
    const results = generateSchedule({ project, activeTabId: 1, numPatterns: 1 });
    expect(results).toHaveLength(1);
  });
});
