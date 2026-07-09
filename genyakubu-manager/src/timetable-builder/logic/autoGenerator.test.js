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
  classSubjectCounts,
  combinedGroups = [],
  schedule = {},
  externalCounts = {},
  maxDailyHours,
  maxIterations,
  maxConsecutivePeriods,
  activeDateIds,
  activePeriodIds,
  otherTabs = [], // H2: 他学年タブ (id/name/config/schedule をそのまま追加)
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
        ...(classSubjectCounts !== undefined ? { classSubjectCounts } : {}),
        ...(activeDateIds !== undefined ? { activeDateIds } : {}),
        ...(activePeriodIds !== undefined ? { activePeriodIds } : {}),
      },
      schedule,
    }, ...otherTabs],
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

// ─── §N: クラス別コマ数 (classSubjectCounts) の尊重 ─────────────────

describe('generateSinglePattern — クラス別コマ数 (§N)', () => {
  it('クラス別の上書きクォータどおりに各クラスへ配分して完全解になる', () => {
    // 2 日 × 2 時限 × 2 クラス = 8 セル。
    //   A (id=1, 共通値):   英2 数2 国0 = 4
    //   B (id=2, 上書き):   英1 数2 国1 = 4
    // 一律クォータではどちらかのクラスでセル数と合わず完全解が出ない構成。
    const project = makeProject({
      teachers: [
        teacher('堀上', ['英語', '数学', '国語']),
        teacher('田中', ['英語', '数学', '国語']),
      ],
      dates: ['12/25(木)', '12/26(金)'],
      periods: ['1限', '2限'],
      classes: ['１S', '２S'],
      subjectCounts: { '英語': 2, '数学': 2, '国語': 0 },
      classSubjectCounts: { '2': { '英語': 1, '国語': 1 } },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(r.totalSlots).toBe(8);

    // クラス × 科目のコマ数を集計して上書きクォータと一致することを確認
    const counts = { 1: {}, 2: {} };
    Object.entries(r.solution).forEach(([k, e]) => {
      const m = k.match(/^d\d+-p\d+-c(\d+)$/);
      counts[m[1]][e.subject] = (counts[m[1]][e.subject] || 0) + 1;
    });
    expect(counts[1]).toEqual({ '英語': 2, '数学': 2 });
    expect(counts[2]).toEqual({ '英語': 1, '数学': 2, '国語': 1 });
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

// ─── 他タブ (他学年) との整合 (H2) ──────────────────────────────────

describe('generateSinglePattern — 他タブの確定割当', () => {
  // 他タブ: 同じ日付/時限プール (id 共有)、クラスはタブ固有
  const otherTab = (schedule, config = {}) => [{
    id: 2,
    name: '他学年',
    config: { classes: [{ id: 1, label: '１S' }], subjectCounts: { '英語': 1 }, ...config },
    schedule,
  }];

  it('他タブで同日同時限に入っている講師は割り当てない', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語']), teacher('石原', ['英語'])],
      subjectCounts: { '英語': 1 },
      otherTabs: otherTab({
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' }, // 堀上は他学年で授業中
      }),
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('石原');
  });

  it('他タブで同日同時限に入っている講師しか居なければ解なし', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      subjectCounts: { '英語': 1 },
      otherTabs: otherTab({
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      }),
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
  });

  it('他タブの同日のコマ数は 1 日上限の基準に合算される', () => {
    // 同日の別時限に他タブで 1 コマ + 自タブ 1 コマ = 2 > maxDailyHours 1
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      periods: ['1限', '2限'],
      subjectCounts: { '英語': 1 },
      activePeriodIds: [1],
      maxDailyHours: 1,
      otherTabs: otherTab({
        [makeKey(1, 2, 1)]: { subject: '英語', teacher: '堀上' }, // 他学年 2限
      }, { activePeriodIds: [2] }),
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull(); // 堀上は日次上限で不可
  });

  it('他タブの stale セル (そのタブが使わない日) は数えない', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      dates: ['12/25(木)', '12/26(金)'],
      activeDateIds: [1],
      subjectCounts: { '英語': 1 },
      otherTabs: otherTab(
        // 他タブは 12/26 のみ使う。12/25 のセルは stale (温存されたゴミ)
        { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
        { activeDateIds: [2] },
      ),
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('堀上');
  });
});

// ─── ソルバ/分析の整合 (M5/M6/M7) ──────────────────────────────────

describe('generateSinglePattern — externalSessions の日次反映 (M5)', () => {
  it('externalCounts が無くてもセッション詳細が日次上限に効く', () => {
    // 12/25 に堀上のセッション 1 件 + 上限 1 → 同日は割り当て不可
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      subjectCounts: { '英語': 1 },
      maxDailyHours: 1,
    });
    project.externalSessions = [
      { teacherName: '堀上', date: '12/25(木)', note: '予備校' },
    ];
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
  });
});

describe('generateSinglePattern — 未定の扱い (M6)', () => {
  it('「未定」は同一時限に複数クラス置ける (placeholder 用途)', () => {
    const project = makeProject({
      teachers: [teacher('未定', ['英語'])],
      classes: ['３S', '３A'],
      subjectCounts: { '英語': 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('未定');
    expect(r.solution[makeKey(1, 1, 2)].teacher).toBe('未定');
  });
});

describe('generateSinglePattern — 合同グループの講師固定 (M7)', () => {
  it('合同の片側に講師が確定済みなら primary も同じ講師になる', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語']), teacher('石原', ['英語'])],
      classes: ['３S', '３A'],
      subjectCounts: { '英語': 1 },
      combinedGroups: [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }],
      schedule: {
        // ３A 側だけ手動で講師まで確定済み
        [makeKey(1, 1, 2)]: { subject: '英語', teacher: '石原' },
      },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    // 旧実装は primary に堀上を選べてしまい「合同なのに 2 講師」になり得た
    expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('石原');
  });

  it('確定済み講師との合同割当は日次を二重計上しない', () => {
    // ３A に石原が確定済み (日次 1)。上限 1 でも primary への石原の合同
    // 割当は同一コマ扱いなので成立する。
    const project = makeProject({
      teachers: [teacher('石原', ['英語'])],
      classes: ['３S', '３A'],
      subjectCounts: { '英語': 1 },
      maxDailyHours: 1,
      combinedGroups: [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }],
      schedule: {
        [makeKey(1, 1, 2)]: { subject: '英語', teacher: '石原' },
      },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(r.solution[makeKey(1, 1, 1)].teacher).toBe('石原');
  });
});

// ─── リスタート戦略 (P1) ────────────────────────────────────────────

describe('generateSinglePattern — リスタート戦略', () => {
  it('1 回目の探索順で解けなくても、リスタートで別の順序を試して解ける', () => {
    // 2 日 × 2 時限 × 2 クラス (8 スロット)、講師 2 名。restartInterval=12 は
    // 「深さ 8 + わずかなバックトラック」しか許さないので、探索順の運が
    // 悪い run は budget を使い切る。seed=17 は最初の run では解けず、
    // リスタート後の順序で解ける (iterations=28 > interval が発動の証拠)。
    // 注: リスタートは探索順を変えるだけで深さは増えないため、interval が
    // スロット数以下だと原理的に解けない。
    const project = makeProject({
      teachers: [teacher('堀上', ['英語']), teacher('片岡', ['数学'])],
      dates: ['12/25(木)', '12/26(金)'],
      periods: ['1限', '2限'],
      classes: ['３S', '３A'],
      subjectCounts: { '英語': 2, '数学': 2 },
      maxIterations: 100000,
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 17, restartInterval: 12 });
    expect(r.solution).not.toBeNull();
    expect(r.iterations).toBeGreaterThan(12); // 2 回以上の run を跨いだ
    expect(r.hitLimit).toBe(false);
  });

  it('解なし問題では探索空間を使い切った時点で打ち切る (上限まで空回りしない)', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['数学'])], // 英語の担当者ゼロ
      subjectCounts: { '英語': 1 },
      // maxIterations は既定 (500,000)
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
    expect(r.hitLimit).toBe(false);
    expect(r.iterations).toBeLessThan(100); // リスタートで空回りしていない
  });

  it('同じ seed なら同じ結果 (リスタート込みの決定性)', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語']), teacher('石原', ['英語'])],
      dates: ['12/25(木)', '12/26(金)'],
      subjectCounts: { '英語': 2 },
    });
    const a = generateSinglePattern({ project, activeTabId: 1, seed: 42 });
    const b = generateSinglePattern({ project, activeTabId: 1, seed: 42 });
    expect(a.solution).toEqual(b.solution);
    expect(a.iterations).toBe(b.iterations);
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

  it('講師個別の maxConsecutivePeriods が全体値より優先される (N3a)', () => {
    // 全体は制限なし (0) だが堀上の個人上限は 2 → 3 連続が作れず部分解
    const project = makeProject({
      teachers: [teacher('堀上', ['英語', '数学', '国語'], { maxConsecutivePeriods: 2 })],
      periods: ['1限', '2限', '3限'],
      subjectCounts: { '英語': 1, '数学': 1, '国語': 1 },
      maxConsecutivePeriods: 0,
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
    expect(r.filledCount).toBeLessThanOrEqual(2);
  });

  it('個別上限が全体値より緩ければ個別値が勝つ (N3a: 全体 1 でも個別 3 で完全解)', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語', '数学', '国語'], { maxConsecutivePeriods: 3 })],
      periods: ['1限', '2限', '3限'],
      subjectCounts: { '英語': 1, '数学': 1, '国語': 1 },
      maxConsecutivePeriods: 1,
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
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

// ─── 連続コマ数制約の他タブ考慮 (F5t) / 歯抜け時限 (F5y) ─────────────

describe('generateSinglePattern — 連続コマ制約の整合 (F5t/F5y)', () => {
  const otherTab = (schedule, config = {}) => [{
    id: 2,
    name: '他学年',
    config: { classes: [{ id: 1, label: '１S' }], subjectCounts: { '英語': 1 }, ...config },
    schedule,
  }];

  it('他タブ (他学年) の確定割当も連続ランに含めて判定する (F5t)', () => {
    // 他学年で 1限・2限 に確定済み。自タブが 3限 に置くと実質 3 連続 > 上限 2。
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      periods: ['1限', '2限', '3限'],
      subjectCounts: { '英語': 1 },
      activePeriodIds: [3],
      maxConsecutivePeriods: 2,
      otherTabs: otherTab({
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
        [makeKey(1, 2, 1)]: { subject: '英語', teacher: '堀上' },
      }, { activePeriodIds: [1, 2] }),
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
  });

  it('他タブの割当と連続しなければ配置できる (F5t の対照)', () => {
    // 他学年は 1限 のみ。自タブの 3限 は 2限 (空き) を挟むので 2 連続にならない。
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      periods: ['1限', '2限', '3限'],
      subjectCounts: { '英語': 1 },
      activePeriodIds: [3],
      maxConsecutivePeriods: 2,
      otherTabs: otherTab({
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      }, { activePeriodIds: [1] }),
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
  });

  it('歯抜けの使う時限 (1限・3限) は休憩を挟むため連続と判定しない (F5y)', () => {
    // 旧実装はタブの使う時限 [1限,3限] を隣接扱いし、maxConsecutive=1 で
    // 3限 への配置を誤って弾いていた (実時間では 2限 が休憩)。
    const project = makeProject({
      teachers: [teacher('堀上', ['英語', '数学'])],
      periods: ['1限', '2限', '3限'],
      subjectCounts: { '英語': 1, '数学': 1 },
      activePeriodIds: [1, 3],
      maxConsecutivePeriods: 1,
      schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(r.solution[makeKey(1, 3, 1)]).toMatchObject({ teacher: '堀上' });
  });

  it('本当に隣接する時限では従来どおり弾く (F5y の対照)', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語', '数学'])],
      periods: ['1限', '2限'],
      subjectCounts: { '英語': 1, '数学': 1 },
      maxConsecutivePeriods: 1,
      schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    // 2限 は 1限 と連続するため堀上を置けず、完全解は存在しない
    expect(r.solution).toBeNull();
  });
});

// ─── 空 + ロック済みセルの扱い (F5w) ─────────────────────────────────

describe('generateSinglePattern — 空 + ロック済みセル (F5w)', () => {
  it('空ロックセルは生成対象にせず {locked:true} のまま残す', () => {
    // 1 日 × 2 時限 × 1 クラス = 2 セル、うち 2限 を空ロック。
    // クォータ 1 = 生成対象セル 1 で完全解になる。
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      periods: ['1限', '2限'],
      subjectCounts: { '英語': 1 },
      schedule: { [makeKey(1, 2, 1)]: { locked: true } },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.totalSlots).toBe(1);
    expect(r.solution).not.toBeNull();
    expect(r.solution[makeKey(1, 1, 1)]).toMatchObject({ subject: '英語', teacher: '堀上' });
    // 空ロックセルには書き込まれない (旧仕様はここに科目・講師が入った)
    expect(r.solution[makeKey(1, 2, 1)]).toEqual({ locked: true });
  });

  it('科目だけ事前指定 + ロックのセルは従来どおり講師を埋める (仕様維持)', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      subjectCounts: { '英語': 1 },
      schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '', locked: true } },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    expect(r.solution[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上', locked: true });
  });

  it('合同グループの相手クラスが空ロックなら合同は成立しない (既存挙動の固定)', () => {
    // 合同の secondary (3A) が空ロック → その科目では置けず、解なし
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'])],
      classes: ['３S', '３A'],
      subjectCounts: { '英語': 1 },
      combinedGroups: [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }],
      schedule: { [makeKey(1, 1, 2)]: { locked: true } },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
  });
});

describe('generateSinglePattern — 講師個別の上限 (L3a/L3b)', () => {
  it('講師個別の maxDailyHours が全体値より優先される (L3a)', () => {
    // 1 日 2 コマ (英語 + 数学)、全体上限 6 だが堀上の個人上限は 1 →
    // 兼任の堀上しか居ないので 1 コマしか埋まらない (部分解)
    const project = makeProject({
      teachers: [teacher('堀上', ['英語', '数学'], { maxDailyHours: 1 })],
      periods: ['1限', '2限'],
      subjectCounts: { '英語': 1, '数学': 1 },
      maxDailyHours: 6,
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
    expect(r.filledCount).toBe(1);
  });

  it('個人上限が無ければ全体値どおり解ける (L3a の対照)', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語', '数学'])],
      periods: ['1限', '2限'],
      subjectCounts: { '英語': 1, '数学': 1 },
      maxDailyHours: 6,
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
  });

  it('maxTotalHours で通算コマ数が制限される (L3b)', () => {
    // 3 日 × 1 限 × 英語 3 コマ。堀上の通算上限 2 → 2 コマまで (部分解)
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'], { maxTotalHours: 2 })],
      dates: ['12/25(木)', '12/26(金)', '12/27(土)'],
      subjectCounts: { '英語': 3 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
    expect(r.filledCount).toBe(2);
  });

  it('通算上限が足りていれば完全解 (L3b の対照)', () => {
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'], { maxTotalHours: 3 })],
      dates: ['12/25(木)', '12/26(金)', '12/27(土)'],
      subjectCounts: { '英語': 3 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
  });

  it('maxTotalHours は externalCounts (ツール外の負荷) も合算する (L3b)', () => {
    // 2 日 × 英語 2 コマ。堀上 通算上限 2 で外部コマ 1 → builder 側は 1 コマだけ
    const project = makeProject({
      teachers: [teacher('堀上', ['英語'], { maxTotalHours: 2 })],
      dates: ['12/25(木)', '12/26(金)'],
      subjectCounts: { '英語': 2 },
      externalCounts: { [`12/25(木)-堀上`]: 1 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).toBeNull();
    expect(r.filledCount).toBe(1);
  });

  it('通算上限に達した講師の残りは他講師にフォールバックする (L3b)', () => {
    const project = makeProject({
      teachers: [
        teacher('堀上', ['英語'], { maxTotalHours: 1 }),
        teacher('田中', ['英語']),
      ],
      dates: ['12/25(木)', '12/26(金)'],
      subjectCounts: { '英語': 2 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
    const teachers = Object.values(r.solution).map(e => e.teacher);
    expect(teachers.filter(n => n === '堀上').length).toBeLessThanOrEqual(1);
    expect(teachers.filter(n => n === '田中').length).toBeGreaterThanOrEqual(1);
  });

  it('「未定」は通算上限の対象外 (L3b)', () => {
    const project = makeProject({
      teachers: [teacher('未定', ['英語'], { maxTotalHours: 1 })],
      dates: ['12/25(木)', '12/26(金)', '12/27(土)'],
      subjectCounts: { '英語': 3 },
    });
    const r = generateSinglePattern({ project, activeTabId: 1, seed: 1 });
    expect(r.solution).not.toBeNull();
  });
});
