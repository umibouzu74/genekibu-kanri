import { describe, expect, it, vi } from 'vitest';
import { generateSinglePattern, generateSchedule } from './autoGenerator';
import { makeKey, makeNgKey } from '../utils/scheduleKey';

// ─── テストヘルパ ──────────────────────────────────────────────────
// 制約充足ソルバのテストは「最小限の構成 + 1 つの制約」で書くのが読みやすい。

// v3: dates / periods / classes をラベル文字列の配列で受け取り、
// { id: 1+, label } の entity 配列に自動 wrap する。
function wrapEntities(arr) {
  return arr.map((label, i) => ({ id: i + 1, label }));
}

function makeProject({
  teachers = [],
  dates = ['12/25(木)'],
  periods = ['1限'],
  classes = ['３S'],
  subjectCounts = { '英語': 1 },
  combinedGroups = [],
  schedule = {},
  externalCounts = {},
  maxDailyHours,
  maxIterations,
  maxConsecutivePeriods,
  activeDateIds,
  activePeriodIds,
} = {}) {
  return {
    version: 4,
    name: 'test',
    teachers,
    activeTabId: 1,
    // v4: dates / periods は project 共通。
    dates: wrapEntities(dates),
    periods: wrapEntities(periods),
    tabs: [{
      id: 1,
      name: 'tab1',
      config: {
        classes: wrapEntities(classes),
        subjectCounts,
        ...(activeDateIds !== undefined ? { activeDateIds } : {}),
        ...(activePeriodIds !== undefined ? { activePeriodIds } : {}),
      },
      schedule,
    }],
    externalCounts,
    combinedGroups,
    subjects: Object.keys(subjectCounts),
    subjectColors: {},
    ...(maxDailyHours !== undefined ? { maxDailyHours } : {}),
    ...(maxIterations !== undefined ? { maxIterations } : {}),
    ...(maxConsecutivePeriods !== undefined ? { maxConsecutivePeriods } : {}),
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
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.totalSlots).toBe(0);
    expect(r.solution).toEqual({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
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
    expect(r.solution[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
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

// ─── タブ別「使う日・使う時限」(E-3) の尊重 ─────────────────────────

describe('generateSinglePattern — activeDateIds / activePeriodIds', () => {
  it('タブが使わない時限はスロット化されず、クォータどおりで完全解になる', () => {
    // プールは 2 時限だが、このタブは 1限 だけ使う (2限 は他学年専用)。
    // クォータは可視セル数 (1 コマ) に一致 → 絞りが効いていれば完全解。
    // 絞りが効かないと 2 セル分のスロットに対しクォータ 1 なので解けない。
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      periods: ['1限', '2限'],
      activePeriodIds: [1],
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.totalSlots).toBe(1);
    expect(r.solution).not.toBeNull();
    // 使わない時限 (id=2) のセルには何も書き込まれない
    expect(r.solution[makeKey(1, 2, 1)]).toBeUndefined();
    expect(r.solution[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('タブが使わない日はスロット化されない (既存挙動の回帰確認)', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      dates: ['12/25(木)', '12/26(金)'],
      activeDateIds: [1],
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.totalSlots).toBe(1);
    expect(r.solution).not.toBeNull();
    expect(r.solution[makeKey(2, 1, 1)]).toBeUndefined();
  });
});

// ─── 探索上限 (maxIterations) のテスト ───────────────────────────────

describe('generateSinglePattern — project.maxIterations', () => {
  // 複数スロットの解ける問題を用意。十分な探索上限なら解け、
  // 上限を極端に小さくすると解に到達できず solution が null になる。
  // 別日に英語 2 コマ (同日同科目の禁止に抵触しない) → 解けるが
  // 解到達には複数回の再帰が必要なので maxIterations の効きを検証できる。
  const makeMultiSlot = (maxIterations) => makeProject({
    teachers: [teacher('堀上', ['英語'])],
    dates: ['12/25(木)', '12/26(金)'],
    subjectCounts: { '英語': 2 },
    maxIterations,
  });

  it('探索上限を超えると solution に到達できない (null + 部分解)', () => {
    const r = generateSinglePattern({ project: makeMultiSlot(1), activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
    expect(r.totalSlots).toBe(2);
  });

  it('上限が十分なら同じ問題でも解ける', () => {
    const r = generateSinglePattern({ project: makeMultiSlot(500000), activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(Object.keys(r.solution)).toHaveLength(2);
  });

  it('未指定ならデフォルト上限で解ける', () => {
    const r = generateSinglePattern({ project: makeMultiSlot(undefined), activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
  });
});

// ─── 生成統計 (E2f: iterations / hitLimit / stuckSlot) ───────────────

describe('generateSinglePattern — 生成統計 (E2f)', () => {
  it('iterations を返す (探索回数 > 0)', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(typeof r.iterations).toBe('number');
    expect(r.iterations).toBeGreaterThan(0);
  });

  it('解けるときは hitLimit=false / stuckSlot=null', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.hitLimit).toBe(false);
    expect(r.stuckSlot).toBeNull();
  });

  it('解けないときは stuckSlot に最初に詰まったコマのラベルが入る', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['数学'])], // 英語担当なし → 充填不能
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
    expect(r.stuckSlot).toMatchObject({ period: expect.any(String), class: expect.any(String) });
    expect(r.stuckSlot.date).toBeTruthy();
  });

  it('onProgress は任意。小さい問題では間引き閾値未満で呼ばれず、結果は不変', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      subjectCounts: { '英語': 1 },
    });
    const onProgress = vi.fn();
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1, onProgress });
    // 1 コマの問題は数十イテレーションで解けるので間引き (20000) に達せず未通知
    expect(onProgress).not.toHaveBeenCalled();
    expect(r.solution).not.toBeNull();
  });
});

// ─── 連続コマ数制約 (E2c) ────────────────────────────────────────────

describe('generateSinglePattern — project.maxConsecutivePeriods', () => {
  // 唯一の講師 (堀上) が英数国を担当。3 時限 1 クラスを全部埋めるには
  // 堀上を 3 連続で入れるしかない構成。
  const make3 = (maxConsecutivePeriods) => makeProject({
    teachers: [teacher('堀上', ['英語', '数学', '国語'])],
    periods: ['1限', '2限', '3限'],
    subjectCounts: { '英語': 1, '数学': 1, '国語': 1 },
    maxConsecutivePeriods,
  });

  it('制限なし (0) なら 3 連続でも完全解', () => {
    const r = generateSinglePattern({ project: make3(0), activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(Object.keys(r.solution)).toHaveLength(3);
  });

  it('連続上限 2 だと 3 連続が作れず完全解にならない', () => {
    const r = generateSinglePattern({ project: make3(2), activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
    // 部分解では 2 コマまでは埋まる
    expect(r.filledCount).toBeLessThanOrEqual(2);
  });

  it('「未定」は連続上限の対象外', () => {
    const project = makeProject({
      teachers: [teacher('未定', ['英語', '数学', '国語'])],
      periods: ['1限', '2限', '3限'],
      subjectCounts: { '英語': 1, '数学': 1, '国語': 1 },
      maxConsecutivePeriods: 1,
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(Object.keys(r.solution)).toHaveLength(3);
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
    expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('田中');
  });

  it('他学年セッションと時間重複する時限は自動でNG扱い (auto-NG)', () => {
    // 堀上は 7/29 12:25-13:35 に予備校 → 1限 (13:00~13:45) は重複でNG
    // 田中は外部セッション無し → 候補として残る
    const project = makeProject({
      teachers: [teacher('堀上', ['英語']), teacher('田中', ['英語'])],
      dates: ['7/29(水)'],
      periods: ['1限 (13:00~13:45)'],
      subjectCounts: { '英語': 1 },
    });
    project.externalSessions = [
      { id: 1, date: '7/29(水)', teacherName: '堀上', label: '', memo: '予備校',
        startTime: '12:25', endTime: '13:35' },
    ];
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 42 });
    expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('田中');
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
    expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('田中');
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
      r.solution[makeKey(1, 1, 1)].subject,
      r.solution[makeKey(1, 2, 1)].subject,
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
    const t1 = r.solution[makeKey(1, 1, 1)].teacher;
    const t2 = r.solution[makeKey(1, 1, 2)].teacher;
    expect(t1).not.toBe(t2);
  });

  it('完全に埋まった既存セルは solver が触らない (未充填判定で除外)', () => {
    // subject も teacher も埋まっていれば slots[] に入らず、solver は触らない。
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      schedule: {
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '田中', locked: true },
      },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution[makeKey(1, 1, 1)]).toEqual({
      subject: '英語',
      teacher: '田中',
      locked: true,
    });
  });

  it('「科目だけ固定 + locked」のセルを solver が埋めても locked が保持される', () => {
    // teacher 空のセルは slots[] に入って solver が埋めるが、その際 locked
    // フラグが落ちると UI 側のロック表示と齟齬が出る。
    const project = makeProject({
      teachers: [teacher('堀上', ['数学']), teacher('田中', ['英語'])],
      subjectCounts: { '英語': 1, '数学': 1 },
      schedule: {
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '', locked: true },
      },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution[makeKey(1, 1, 1)]).toEqual({
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
        [makeKey(1, 1, 1)]: { subject: '数学', teacher: '' },
      },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution[makeKey(1, 1, 1)]).toEqual({ subject: '数学', teacher: '田中' });
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
    expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('堀上');
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
    const a = r.solution[makeKey(1, 1, 1)];
    const b = r.solution[makeKey(1, 1, 2)];
    expect(a).toEqual({ subject: '英語', teacher: '堀上' });
    expect(b).toEqual({ subject: '英語', teacher: '堀上' });
  });
});

// ─── 日別コマ数上限 (externalCounts + maxDailyHours) ────────────────

describe('generateSinglePattern — 日別コマ数上限', () => {
  // デフォルト上限は 6。externalCounts と既存割当を合算して、これを超える講師は
  // 候補から外す。

  it('externalCounts が上限以上の講師は候補から外される', () => {
    // 堀上: 既に他学年で 6 コマ持っている → 当該タブで割り当て不可
    // 田中: external 0 → 割り当て可
    const project = makeProject({
      teachers: [teacher('堀上', ['英語']), teacher('田中', ['英語'])],
      subjectCounts: { '英語': 1 },
      externalCounts: { '12/25(木)-堀上': 6 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('田中');
  });

  it('externalCounts と既存割当を合算して上限判定する', () => {
    // 堀上: external 5 + 既存ロック 1 コマ = 6 (上限ちょうど) → 追加割当不可
    // 田中: 候補として残る
    // 「同日・同クラス同科目」制約があるため、subjects は分けて配置する
    const project = makeProject({
      teachers: [
        teacher('堀上', ['英語', '数学']),
        teacher('田中', ['英語', '数学']),
      ],
      periods: ['1限', '2限'],
      subjectCounts: { '英語': 1, '数学': 1 },
      externalCounts: { '12/25(木)-堀上': 5 },
      schedule: {
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上', locked: true },
      },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    // 2 限目 (数学) の割当は堀上以外 (= 田中)
    expect(r.solution[makeKey(1, 2, 1)].teacher).toBe('田中');
  });

  it('project.maxDailyHours で上限を上書きできる', () => {
    // maxDailyHours = 2 に絞った場合、external 2 の講師は候補から外れる
    const project = makeProject({
      teachers: [teacher('堀上', ['英語']), teacher('田中', ['英語'])],
      subjectCounts: { '英語': 1 },
      externalCounts: { '12/25(木)-堀上': 2 },
      maxDailyHours: 2,
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('田中');
  });

  it('未定 は上限の対象外 (placeholder 扱い)', () => {
    // 未定 は external 10 でも割り当て可能 (useAnalysis の集計対象外と整合)
    const project = makeProject({
      teachers: [teacher('未定', ['英語'])],
      subjectCounts: { '英語': 1 },
      externalCounts: { '12/25(木)-未定': 10 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('未定');
  });

  it('externalCounts 無し + 上限の範囲内 → 従来通り割当てる (回帰)', () => {
    // 上限 6 / 候補 1 人 / 3 コマだけなら問題なし
    // 「同日・同クラス同科目」制約があるため、subjects は 3 つに分ける
    const project = makeProject({
      teachers: [teacher('堀上', ['英語', '数学', '国語'])],
      periods: ['1限', '2限', '3限'],
      classes: ['３S'],
      subjectCounts: { '英語': 1, '数学': 1, '国語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(Object.values(r.solution).every(e => e.teacher === '堀上')).toBe(true);
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

  it('違う seed なら結果が変わる (複数解空間で seed が解多様性を担う)', () => {
    // 講師 2 人 × 科目 2 つ × 時限 2 × クラス 2 = 解空間が広い構成で、
    // 複数の seed ペアのうち少なくとも 1 ペアで異なる解が出ることを確認。
    // 単一ペアだけだと偶然同じ解になることもあるので、複数を試す。
    const baseline = flatten(generateSinglePattern({ project, activeTabId: 1, seed: 0 }).solution);
    let foundDifferent = false;
    for (const seed of [1, 7, 42, 100, 999, 31337]) {
      const sol = flatten(generateSinglePattern({ project, activeTabId: 1, seed }).solution);
      if (JSON.stringify(sol) !== JSON.stringify(baseline)) {
        foundDifferent = true;
        break;
      }
    }
    expect(foundDifferent).toBe(true);
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
