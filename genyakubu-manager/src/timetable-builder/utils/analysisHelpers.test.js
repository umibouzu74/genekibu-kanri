import { describe, expect, it } from 'vitest';
import {
  computeGlobalUsage as _computeGlobalUsage,
  computeActiveAnalysis,
  computeDashboard,
  computeTabViolationCounts as _computeTabViolationCounts,
  computeViolations,
  computeInfeasibilities,
} from './analysisHelpers';
import { makeKey, makeExternalKey, makeNgKey } from './scheduleKey';

// v4: dates / periods は project 共通になり、computeGlobalUsage /
// computeTabViolationCounts は引数で受け取る。本テストの fixture は従来どおり
// tab.config に dates / periods を持たせているので、その値を引数へ橋渡しする
// 薄いシムを噛ませる (全 call site を無改修に保つ)。tab を跨いだ dates /
// periods は共通である前提なので tabs[0].config を代表値として使う。
const computeGlobalUsage = (tabs, combined = [], ext = {}, sessions = []) =>
  _computeGlobalUsage(tabs, combined, ext, sessions, tabs[0].config.dates, tabs[0].config.periods);
const computeTabViolationCounts = (args) =>
  _computeTabViolationCounts({ ...args, dates: args.tabs[0].config.dates, periods: args.tabs[0].config.periods });

// テスト用ヘルパー: config (実効: dates/periods 含む) と schedule を組み立てる。
function makeConfig(overrides = {}) {
  return {
    dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
    subjectCounts: { '英語': 2, '数学': 2 },
    ...overrides,
  };
}

function makeTab(id, schedule, configOverrides = {}) {
  return { id, name: `tab-${id}`, config: makeConfig(configOverrides), schedule };
}

// ─── computeGlobalUsage ──────────────────────────────────────────

describe('computeGlobalUsage', () => {
  it('単純な 1 タブの集計: 講師ごとの日次コマ数を返す', () => {
    const tab = makeTab(1, {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 2, 1)]: { subject: '数学', teacher: '田中' },
      [makeKey(1, 2, 2)]: { subject: '数学', teacher: '田中' },
    });
    const { teacherDailyCounts, globalUsage } = computeGlobalUsage([tab], [], {});

    expect(teacherDailyCounts[makeExternalKey('12/25(木)', '堀上')]).toEqual({
      current: 1, external: 0, total: 1,
    });
    expect(teacherDailyCounts[makeExternalKey('12/25(木)', '田中')]).toEqual({
      current: 2, external: 0, total: 2,
    });
    // globalUsage は (date, period, teacher) を key にして tabId 配列を持つ
    expect(globalUsage['12/25(木)-1限-堀上']).toEqual([{ tabId: 1, combinedGroupId: null }]);
    expect(globalUsage['12/25(木)-2限-田中']).toHaveLength(2);
  });

  it('"未定" の講師は集計対象外', () => {
    const tab = makeTab(1, {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '未定' },
      [makeKey(1, 2, 1)]: { subject: '数学', teacher: '田中' },
    });
    const { teacherDailyCounts, globalUsage } = computeGlobalUsage([tab], [], {});

    expect(Object.keys(teacherDailyCounts)).toHaveLength(1);
    expect(teacherDailyCounts[makeExternalKey('12/25(木)', '田中')].current).toBe(1);
    expect(globalUsage['12/25(木)-1限-未定']).toBeUndefined();
  });

  it('externalCounts は teacherDailyCounts.external / total に加算される', () => {
    const tab = makeTab(1, {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
    });
    const ext = { [makeExternalKey('12/25(木)', '堀上')]: 3 };
    const { teacherDailyCounts } = computeGlobalUsage([tab], [], ext);

    expect(teacherDailyCounts[makeExternalKey('12/25(木)', '堀上')]).toEqual({
      current: 1, external: 3, total: 4,
    });
  });

  it('externalSessions が登録されていれば externalCounts より優先して件数集計', () => {
    const tab = makeTab(1, {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
    });
    // externalCounts は 3 を入れているが、sessions が 2 件あるので 2 が採用される
    const ext = { [makeExternalKey('12/25(木)', '堀上')]: 3 };
    const sessions = [
      { id: 1, date: '12/25(木)', teacherName: '堀上', label: '1限', memo: '予備校' },
      { id: 2, date: '12/25(木)', teacherName: '堀上', label: '2限', memo: '予備校' },
    ];
    const { teacherDailyCounts } = computeGlobalUsage([tab], [], ext, sessions);
    expect(teacherDailyCounts[makeExternalKey('12/25(木)', '堀上')]).toEqual({
      current: 1, external: 2, total: 3,
    });
  });

  it('externalSessions が無ければ externalCounts (legacy) にフォールバック', () => {
    const tab = makeTab(1, {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
    });
    const ext = { [makeExternalKey('12/25(木)', '堀上')]: 5 };
    const { teacherDailyCounts } = computeGlobalUsage([tab], [], ext, []);
    expect(teacherDailyCounts[makeExternalKey('12/25(木)', '堀上')].external).toBe(5);
  });

  it('合同グループ内の複数クラスは 1 コマとして集計される', () => {
    // ３S と ３A を英語で合同 → 同日同時限の同じ講師は 1 コマ扱い
    const tab = makeTab(1, {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' }, // ３S
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上' }, // ３A
    });
    const combinedGroups = [
      { id: 1, subject: '英語', classes: ['３S', '３A'], dates: null },
    ];
    const { teacherDailyCounts, globalUsage } = computeGlobalUsage([tab], combinedGroups, {});

    expect(teacherDailyCounts[makeExternalKey('12/25(木)', '堀上')].current).toBe(1);
    // globalUsage は両方の cell を記録 (conflict 判定で combinedGroupId を見て dedupe する)
    expect(globalUsage['12/25(木)-1限-堀上']).toHaveLength(2);
    expect(globalUsage['12/25(木)-1限-堀上'].every(u => u.combinedGroupId === 1)).toBe(true);
  });

  it('複数タブを横断して集計する', () => {
    const tab1 = makeTab(1, { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } });
    const tab2 = makeTab(2, { [makeKey(1, 1, 1)]: { subject: '数学', teacher: '堀上' } });
    const { teacherDailyCounts, globalUsage } = computeGlobalUsage([tab1, tab2], [], {});

    // 同日同講師は 2 コマ
    expect(teacherDailyCounts[makeExternalKey('12/25(木)', '堀上')].current).toBe(2);
    // globalUsage は同 (date, period, teacher) を 2 タブから記録
    expect(globalUsage['12/25(木)-1限-堀上']).toHaveLength(2);
    expect(globalUsage['12/25(木)-1限-堀上'].map(u => u.tabId).sort()).toEqual([1, 2]);
  });

  it('subject 未割当 (teacher のみ存在) でも teacher が "未定" でなければ集計', () => {
    // 実運用上は subject だけ先に決まる流れだが、teacher が "未定" 以外なら
    // 何らかの理由で集計される点は仕様として保つ。
    const tab = makeTab(1, {
      [makeKey(1, 1, 1)]: { teacher: '堀上' }, // subject なし
    });
    const { teacherDailyCounts } = computeGlobalUsage([tab], [], {});
    expect(teacherDailyCounts[makeExternalKey('12/25(木)', '堀上')]?.current).toBe(1);
  });
});

// ─── computeActiveAnalysis ───────────────────────────────────────

describe('computeActiveAnalysis', () => {
  it('同一タブ内の同講師同時限は conflict として errorKeys に入る', () => {
    const config = makeConfig();
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 2)]: { subject: '数学', teacher: '堀上' }, // 同日同時限・別クラス
    };
    const { teacherDailyCounts: _, globalUsage } = computeGlobalUsage(
      [makeTab(1, schedule)], [], {},
    );
    void _;
    const { conflictMap, errorKeys } = computeActiveAnalysis(config, schedule, globalUsage);

    expect(conflictMap['12/25(木)-1限-堀上']).toBe(true);
    expect(errorKeys).toHaveLength(2);
    expect(errorKeys).toContain(makeKey(1, 1, 1));
    expect(errorKeys).toContain(makeKey(1, 1, 2));
  });

  it('合同グループ内の重複は conflict としてカウントしない', () => {
    const config = makeConfig();
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' }, // ３S
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上' }, // ３A
    };
    const combinedGroups = [
      { id: 1, subject: '英語', classes: ['３S', '３A'], dates: null },
    ];
    const { globalUsage } = computeGlobalUsage([makeTab(1, schedule)], combinedGroups, {});
    const { conflictMap, errorKeys } = computeActiveAnalysis(config, schedule, globalUsage);

    expect(conflictMap['12/25(木)-1限-堀上']).toBeUndefined();
    expect(errorKeys).toEqual([]);
  });

  it('タブ横断の conflict も errorKeys に入る (現タブのセルだけ)', () => {
    const config = makeConfig();
    const tab1Schedule = { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } };
    const tab2Schedule = { [makeKey(1, 1, 1)]: { subject: '数学', teacher: '堀上' } };
    const { globalUsage } = computeGlobalUsage(
      [makeTab(1, tab1Schedule), makeTab(2, tab2Schedule)],
      [], {},
    );
    // 現タブが tab1 視点
    const { conflictMap, errorKeys } = computeActiveAnalysis(config, tab1Schedule, globalUsage);
    expect(conflictMap['12/25(木)-1限-堀上']).toBe(true);
    expect(errorKeys).toContain(makeKey(1, 1, 1));
  });

  it('同一クラス・同一日に同じ科目が複数あれば dailySubjectMap > 1', () => {
    const config = makeConfig();
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 2, 1)]: { subject: '英語', teacher: '田中' }, // 同 class・同 date・同 subject
    };
    const { globalUsage } = computeGlobalUsage([makeTab(1, schedule)], [], {});
    const { dailySubjectMap } = computeActiveAnalysis(config, schedule, globalUsage);
    expect(dailySubjectMap['c1-d1-英語']).toBe(2);
    // 別クラスは別 key
    expect(dailySubjectMap['c2-d1-英語']).toBeUndefined();
  });

  it('subjectOrders は同一クラス内・順番に従って 1-based 連番', () => {
    const config = makeConfig();
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' }, // ３S, 12/25, 1限 → 1
      [makeKey(1, 2, 1)]: { subject: '英語', teacher: '田中' }, // ３S, 12/25, 2限 → 2
      [makeKey(2, 1, 1)]: { subject: '英語', teacher: '堀上' }, // ３S, 12/26, 1限 → 3
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '田中' }, // ３A, 12/25, 1限 → 1 (別クラスはリセット)
    };
    const { globalUsage } = computeGlobalUsage([makeTab(1, schedule)], [], {});
    const { subjectOrders } = computeActiveAnalysis(config, schedule, globalUsage);

    expect(subjectOrders[makeKey(1, 1, 1)]).toBe(1);
    expect(subjectOrders[makeKey(1, 2, 1)]).toBe(2);
    expect(subjectOrders[makeKey(2, 1, 1)]).toBe(3);
    expect(subjectOrders[makeKey(1, 1, 2)]).toBe(1);
  });

  it('空 schedule は全部空 object を返す', () => {
    const config = makeConfig();
    const result = computeActiveAnalysis(config, {}, {});
    expect(result.conflictMap).toEqual({});
    expect(result.errorKeys).toEqual([]);
    expect(result.dailySubjectMap).toEqual({});
    expect(result.subjectOrders).toEqual({});
  });

  it('teacher 未定のセルは conflict 判定の対象外', () => {
    const config = makeConfig();
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '未定' },
      [makeKey(1, 1, 2)]: { subject: '数学', teacher: '未定' },
    };
    const { globalUsage } = computeGlobalUsage([makeTab(1, schedule)], [], {});
    const { conflictMap, errorKeys } = computeActiveAnalysis(config, schedule, globalUsage);
    expect(conflictMap).toEqual({});
    expect(errorKeys).toEqual([]);
  });

  it('割当済み講師が ngSlots に該当するセルは ngViolationKeys に入る', () => {
    const config = makeConfig();
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
    };
    const teachers = [
      { name: '堀上', subjects: ['英語'], ngSlots: [makeNgKey('12/25(木)', '1限')] },
    ];
    const { globalUsage } = computeGlobalUsage([makeTab(1, schedule)], [], {});
    const { ngViolationKeys } = computeActiveAnalysis(config, schedule, globalUsage, teachers);
    expect(ngViolationKeys).toEqual([makeKey(1, 1, 1)]);
  });

  it('teachers が未指定なら ngViolationKeys は空 (後方互換)', () => {
    const config = makeConfig();
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
    };
    const { globalUsage } = computeGlobalUsage([makeTab(1, schedule)], [], {});
    const { ngViolationKeys } = computeActiveAnalysis(config, schedule, globalUsage);
    expect(ngViolationKeys).toEqual([]);
  });
});

// ─── computeDashboard ────────────────────────────────────────────

describe('computeDashboard', () => {
  it('空 schedule は progress 0%', () => {
    const config = makeConfig(); // 2 subjects × 2 each × 2 classes = 8 total
    const result = computeDashboard({}, config);
    expect(result).toEqual({ progress: 0, filled: 0, total: 8 });
  });

  it('半分埋まると progress 50%', () => {
    const config = makeConfig({ subjectCounts: { '英語': 2 }, classes: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }] });
    // total = 2 × 2 = 4。filled = 2 にする
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 2, 1)]: { subject: '英語', teacher: '田中' },
    };
    expect(computeDashboard(schedule, config)).toEqual({ progress: 50, filled: 2, total: 4 });
  });

  it('全埋まると progress 100%', () => {
    const config = makeConfig({ subjectCounts: { '英語': 2 }, classes: [{ id: 1, label: 'A' }] });
    // total = 2 × 1 = 2
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 2, 1)]: { subject: '英語', teacher: '田中' },
    };
    expect(computeDashboard(schedule, config)).toEqual({ progress: 100, filled: 2, total: 2 });
  });

  it('subjectCounts 空・classes 空でも total=0 で progress=0', () => {
    const config = makeConfig({ subjectCounts: {}, classes: [] });
    expect(computeDashboard({}, config)).toEqual({ progress: 0, filled: 0, total: 0 });
  });

  it('subject 未割当の entry は filled に数えない (teacher だけあっても)', () => {
    const config = makeConfig({ subjectCounts: { '英語': 1 }, classes: [{ id: 1, label: 'A' }] });
    const schedule = {
      [makeKey(1, 1, 1)]: { teacher: '堀上' }, // subject 無し
    };
    expect(computeDashboard(schedule, config)).toEqual({ progress: 0, filled: 0, total: 1 });
  });
});

// ─── computeTabViolationCounts (D1c + M3) ────────────────────────

describe('computeTabViolationCounts', () => {
  it('全タブの違反件数 (teacherConflict + subjectDup + subjectOver) を {tabId: count} で返す', () => {
    // タブ 1: 堀上が 12/25 1限 ３S と ３A に重複 → teacherConflict 2 件
    // タブ 2: 重複なし
    const tab1 = makeTab(1, {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上' },
    });
    const tab2 = makeTab(2, {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '田中' },
    });
    const { globalUsage } = computeGlobalUsage([tab1, tab2], [], {});
    const counts = computeTabViolationCounts({ tabs: [tab1, tab2], globalUsage });
    expect(counts[1]).toBe(2);
    expect(counts[2]).toBe(0);
  });

  it('subjectDup と subjectOver も合算する (M3 修正)', () => {
    // ３S の 12/25 に 英語 2 コマ (subjectDup 1)、英語クォータ 2 を超えた
    // 配置にすると subjectOver も発生する
    const config = {
      dates: [{ id: 1, label: '12/25' }],
      periods: [{ id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' }],
      classes: [{ id: 1, label: 'A' }],
      subjectCounts: { '英語': 2 },
    };
    const tab = makeTab(1, {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 2, 1)]: { subject: '英語', teacher: '高松' },
      [makeKey(1, 3, 1)]: { subject: '英語', teacher: '南條' },
    }, config);
    const { globalUsage } = computeGlobalUsage([tab], [], {});
    const counts = computeTabViolationCounts({ tabs: [tab], globalUsage });
    // subjectDup: 3 - 1 = 2 件、subjectOver: 1 件
    expect(counts[1]).toBe(3);
  });

  it('"未定" は teacherConflict の対象外', () => {
    const tab = makeTab(1, {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '未定' },
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '未定' },
    });
    const { globalUsage } = computeGlobalUsage([tab], [], {});
    expect(computeTabViolationCounts({ tabs: [tab], globalUsage })).toEqual({ 1: 0 });
  });

  it('タブ横断の重複も各タブ側で件数として現れる', () => {
    const tab1 = makeTab(1, { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } });
    const tab2 = makeTab(2, { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } });
    const { globalUsage } = computeGlobalUsage([tab1, tab2], [], {});
    const counts = computeTabViolationCounts({ tabs: [tab1, tab2], globalUsage });
    expect(counts[1]).toBe(1);
    expect(counts[2]).toBe(1);
  });

  it('他学年セッションの時間重複も ngViolation としてバッジに加算', () => {
    // 堀上が 12/25 1限 (13:00-13:45) にアサインされているが、
    // 12/25 12:25-13:35 の予備校セッションが登録されている → 自動NG違反
    const config = {
      dates: [{ id: 1, label: '12/25(木)' }],
      periods: [{ id: 1, label: '1限 (13:00~13:45)' }],
      classes: [{ id: 1, label: 'A' }],
      subjectCounts: { '英語': 1 },
    };
    const tab = makeTab(1, {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
    }, config);
    const teachers = [{ name: '堀上', subjects: ['英語'], ngSlots: [] }];
    const sessions = [
      { id: 1, date: '12/25(木)', teacherName: '堀上', startTime: '12:25', endTime: '13:35' },
    ];
    const { globalUsage } = computeGlobalUsage([tab], [], {}, sessions);
    const counts = computeTabViolationCounts({
      tabs: [tab], globalUsage, teachers, externalSessions: sessions,
    });
    expect(counts[1]).toBe(1);
  });

  it('externalSessions が空ならバッジ値は手動NGのみで決まる', () => {
    const config = {
      dates: [{ id: 1, label: '12/25(木)' }],
      periods: [{ id: 1, label: '1限 (13:00~13:45)' }],
      classes: [{ id: 1, label: 'A' }],
      subjectCounts: { '英語': 1 },
    };
    const tab = makeTab(1, {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
    }, config);
    const teachers = [{ name: '堀上', subjects: ['英語'], ngSlots: [makeNgKey('12/25(木)', '1限 (13:00~13:45)')] }];
    const { globalUsage } = computeGlobalUsage([tab], [], {}, []);
    const counts = computeTabViolationCounts({
      tabs: [tab], globalUsage, teachers, externalSessions: [],
    });
    expect(counts[1]).toBe(1);
  });
});

// ─── computeViolations (D1c) ─────────────────────────────────────

describe('computeViolations', () => {
  function buildAndCompute(schedule, configOverrides = {}, opts = {}) {
    const tab = makeTab(1, schedule, configOverrides);
    const { teacherDailyCounts, globalUsage } = computeGlobalUsage([tab], [], opts.externalCounts || {});
    const activeAnalysis = computeActiveAnalysis(tab.config, schedule, globalUsage);
    return computeViolations({
      currentConfig: tab.config,
      currentSchedule: schedule,
      errorKeys: activeAnalysis.errorKeys,
      dailySubjectMap: activeAnalysis.dailySubjectMap,
      subjectOrders: activeAnalysis.subjectOrders,
      teacherDailyCounts,
      maxDailyHours: opts.maxDailyHours ?? 6,
      teachers: opts.teachers,
    });
  }

  it('違反ゼロなら全て count=0', () => {
    const v = buildAndCompute({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
    });
    expect(v.teacherConflict).toEqual({ count: 0, firstKey: null });
    expect(v.subjectDup).toEqual({ count: 0, firstKey: null });
    expect(v.subjectOver).toEqual({ count: 0, firstKey: null });
    expect(v.teacherOverDaily).toEqual({ count: 0, items: [] });
  });

  it('teacherConflict: errorKeys と同数で firstKey は errorKeys[0]', () => {
    const v = buildAndCompute({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上' },
    });
    expect(v.teacherConflict.count).toBe(2);
    // 最初のキーは d1-p1-c1 (config 順)
    expect(v.teacherConflict.firstKey).toBe(makeKey(1, 1, 1));
  });

  it('subjectDup: 同クラス同日に同科目 2 回以上を count - 1 で集計、firstKey は 2 個目のセル', () => {
    // ３S の 12/25 に 英語 が 2 コマ → 超過 1 件
    // 新仕様 (S3 修正): firstKey は「超過の起点」つまり 2 個目以降の最初のセル
    const v = buildAndCompute({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 2, 1)]: { subject: '英語', teacher: '高松' },
    });
    expect(v.subjectDup.count).toBe(1);
    expect(v.subjectDup.firstKey).toBe(makeKey(1, 2, 1));
  });

  it('subjectOver: subjectCounts を超えた割当を count', () => {
    // 英語クォータ 2 のところ ３S 1日目に英語 3 コマ → 3 つ目が超過
    const config = {
      dates: [{ id: 1, label: '12/25' }],
      periods: [{ id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' }],
      classes: [{ id: 1, label: 'A' }],
      subjectCounts: { '英語': 2 },
    };
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 2, 1)]: { subject: '英語', teacher: '高松' },
      [makeKey(1, 3, 1)]: { subject: '英語', teacher: '南條' },
    };
    const v = buildAndCompute(schedule, config);
    expect(v.subjectOver.count).toBe(1);
    expect(v.subjectOver.firstKey).toBe(makeKey(1, 3, 1));
  });

  it('teacherOverDaily: maxDailyHours 超過した (date, teacher) を列挙 + firstKey に当該講師の最初のセル', () => {
    // 堀上が 12/25 に 3 コマ、maxDailyHours=2 → 超過 1 件
    const v = buildAndCompute({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 2, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上' },
    }, {}, { maxDailyHours: 2, teachers: [{ name: '堀上' }] });
    expect(v.teacherOverDaily.count).toBe(1);
    expect(v.teacherOverDaily.items[0]).toEqual({
      date: '12/25(木)', teacher: '堀上', total: 3, max: 2, firstKey: makeKey(1, 1, 1),
    });
  });

  it('teacherOverDaily: maxDailyHours ぎりぎり (==) は超過扱いしない', () => {
    const v = buildAndCompute({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 2, 1)]: { subject: '英語', teacher: '堀上' },
    }, {}, { maxDailyHours: 2, teachers: [{ name: '堀上' }] });
    expect(v.teacherOverDaily.count).toBe(0);
  });

  it('teacherOverDaily: 日付ラベルに "-" を含んでも teachers の suffix match で復元できる (M1)', () => {
    // 日付ラベル "2026-01-04" に "-" が含まれるケース。teachers list を渡せば復元可能。
    const config = {
      dates: [{ id: 1, label: '2026-01-04' }],
      periods: [{ id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' }],
      classes: [{ id: 1, label: 'A' }],
      subjectCounts: { '英語': 3 },
    };
    const v = buildAndCompute({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 2, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 3, 1)]: { subject: '英語', teacher: '堀上' },
    }, config, { maxDailyHours: 2, teachers: [{ name: '堀上' }] });
    expect(v.teacherOverDaily.items[0]).toMatchObject({
      date: '2026-01-04',
      teacher: '堀上',
      total: 3,
    });
  });

  it('teacherOverDaily: 講師名が部分一致するケースは長い方を優先 (suffix match の longest-first)', () => {
    // 「堀上」「堀上一郎」が両方居る場合、堀上一郎の dayKey が 堀上 にマッチしないように
    const config = {
      dates: [{ id: 1, label: '12/25' }],
      periods: [{ id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' }],
      classes: [{ id: 1, label: 'A' }],
      subjectCounts: { '英語': 3 },
    };
    const v = buildAndCompute({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上一郎' },
      [makeKey(1, 2, 1)]: { subject: '英語', teacher: '堀上一郎' },
      [makeKey(1, 3, 1)]: { subject: '英語', teacher: '堀上一郎' },
    }, config, { maxDailyHours: 2, teachers: [{ name: '堀上' }, { name: '堀上一郎' }] });
    expect(v.teacherOverDaily.items[0]).toMatchObject({
      date: '12/25', teacher: '堀上一郎',
    });
  });
});

// ─── computeInfeasibilities (D1c-C) ──────────────────────────────

describe('computeInfeasibilities', () => {
  const baseConfig = () => ({
    dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    classes: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }],
    subjectCounts: { '英語': 2, '数学': 2 },
  });

  it('講師が十分にいれば noTeacherForSlot も capacity shortage も 0', () => {
    const r = computeInfeasibilities({
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [] },
        { name: '田中', subjects: ['数学'], ngSlots: [] },
      ],
      commonSubjects: ['英語', '数学'],
      currentConfig: baseConfig(),
      maxDailyHours: 6,
    });
    expect(r.noTeacherForSlot.count).toBe(0);
    expect(r.subjectCapacityShortage.count).toBe(0);
  });

  it('"未定" のみの状態は全 (date,period,subject) で noTeacherForSlot として検出', () => {
    const r = computeInfeasibilities({
      teachers: [{ name: '未定', subjects: ['英語', '数学'], ngSlots: [] }],
      commonSubjects: ['英語', '数学'],
      currentConfig: baseConfig(),
      maxDailyHours: 6,
    });
    // 2 dates × 2 periods × 2 subjects = 8
    expect(r.noTeacherForSlot.count).toBe(8);
  });

  it('該当時限が NG の場合 noTeacherForSlot に出る', () => {
    const r = computeInfeasibilities({
      teachers: [
        // 堀上が 12/25 1限 のみ NG、他の人は居ない
        { name: '堀上', subjects: ['英語'], ngSlots: [makeNgKey('12/25', '1限')] },
        { name: '田中', subjects: ['数学'], ngSlots: [] },
      ],
      commonSubjects: ['英語', '数学'],
      currentConfig: baseConfig(),
      maxDailyHours: 6,
    });
    expect(r.noTeacherForSlot.count).toBe(1);
    expect(r.noTeacherForSlot.items[0]).toEqual({ date: '12/25', period: '1限', subject: '英語' });
  });

  it('autoNgByTeacher で塞がれた時限も noTeacherForSlot に入る', () => {
    // 堀上は手動NG なし、田中は数学担当 → 英語の担当は堀上のみ。
    // 自動NG (12/25 1限) で堀上が塞がれているため英語が誰も担当できない。
    const autoNgByTeacher = new Map([
      ['堀上', new Map([[makeNgKey('12/25', '1限'), { sessions: [] }]])],
    ]);
    const r = computeInfeasibilities({
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [] },
        { name: '田中', subjects: ['数学'], ngSlots: [] },
      ],
      commonSubjects: ['英語', '数学'],
      currentConfig: baseConfig(),
      maxDailyHours: 6,
      autoNgByTeacher,
    });
    expect(r.noTeacherForSlot.count).toBe(1);
    expect(r.noTeacherForSlot.items[0]).toEqual({ date: '12/25', period: '1限', subject: '英語' });
  });

  it('autoNgByTeacher が null なら従来通り (後方互換)', () => {
    const r = computeInfeasibilities({
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [] },
        { name: '田中', subjects: ['数学'], ngSlots: [] },
      ],
      commonSubjects: ['英語', '数学'],
      currentConfig: baseConfig(),
      maxDailyHours: 6,
    });
    expect(r.noTeacherForSlot.count).toBe(0);
  });

  it('subjectCapacityShortage: 必要 > capacity で検出', () => {
    // 英語: 必要 = subjectCounts(2) * classes(2) = 4 コマ
    //       capacity = teachers(1) * dates(2) * max(1) = 2 → 不足
    const r = computeInfeasibilities({
      teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: [] }],
      commonSubjects: ['英語'],
      currentConfig: baseConfig(),
      maxDailyHours: 1,
    });
    expect(r.subjectCapacityShortage.count).toBe(1);
    expect(r.subjectCapacityShortage.items[0]).toEqual({
      subject: '英語', demand: 4, capacity: 2, teacherCount: 1,
    });
  });

  it('subjectCapacityShortage: "未定" を除外して capacity を計算する', () => {
    // 「未定」だけでは capacity ゼロ扱い → 全 subject で不足
    const r = computeInfeasibilities({
      teachers: [{ name: '未定', subjects: ['英語', '数学'], ngSlots: [] }],
      commonSubjects: ['英語', '数学'],
      currentConfig: baseConfig(),
      maxDailyHours: 6,
    });
    expect(r.subjectCapacityShortage.count).toBe(2);
    r.subjectCapacityShortage.items.forEach(it => expect(it.teacherCount).toBe(0));
  });

  it('subjectCounts に登録されていない (= 0) subject は capacity 判定をスキップ', () => {
    const r = computeInfeasibilities({
      teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: [] }],
      commonSubjects: ['英語', '理科'], // 理科 は subjectCounts に無い
      currentConfig: baseConfig(),
      maxDailyHours: 6,
    });
    // 理科 は capacity チェック対象外。英語 は capacity 十分。
    expect(r.subjectCapacityShortage.count).toBe(0);
  });
});

// ─── M7b: 合同 dedupe キーの講師名 / M8: 静的 infeasibility 追加分 ────

describe('computeGlobalUsage — 合同グループの講師別カウント (M7b)', () => {
  it('合同の各クラスに別々の講師が入っている場合、両講師の日次がカウントされる', () => {
    const config = makeConfig();
    const tabs = [{
      id: 1,
      config,
      schedule: {
        // 同じ合同グループ (英語, ３S+３A, 全日) の 2 セルに別講師
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
        [makeKey(1, 1, 2)]: { subject: '英語', teacher: '石原' },
      },
    }];
    const combined = [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }];
    const { teacherDailyCounts } = computeGlobalUsage(tabs, combined);
    expect(teacherDailyCounts[makeExternalKey('12/25(木)', '堀上')]?.total).toBe(1);
    // 旧実装は dedupe キーに講師名が無く、2 人目 (石原) の日次が欠落していた
    expect(teacherDailyCounts[makeExternalKey('12/25(木)', '石原')]?.total).toBe(1);
  });

  it('同一講師の合同セルは従来どおり 1 コマ扱い', () => {
    const config = makeConfig();
    const tabs = [{
      id: 1,
      config,
      schedule: {
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
        [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上' },
      },
    }];
    const combined = [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }];
    const { teacherDailyCounts } = computeGlobalUsage(tabs, combined);
    expect(teacherDailyCounts[makeExternalKey('12/25(木)', '堀上')]?.total).toBe(1);
  });
});

describe('computeInfeasibilities — M8 追加分', () => {
  const twoByTwo = () => ({
    dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    classes: [{ id: 1, label: 'A' }],
    subjectCounts: { '英語': 2, '数学': 2 },
  });
  const teachers = [
    { name: '堀上', subjects: ['英語'], ngSlots: [] },
    { name: '田中', subjects: ['数学'], ngSlots: [] },
  ];

  it('capacity は min(maxDailyHours, 時限数) で評価する (過大評価の修正)', () => {
    // 1 講師 × 2 日 × min(6, 2 時限) = capacity 4 < demand 6 → 検出。
    // 旧式 (× maxDailyHours) だと 12 で見逃していた。
    const config = { ...twoByTwo(), classes: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }], subjectCounts: { '英語': 2, '数学': 2 } };
    const r = computeInfeasibilities({
      teachers,
      commonSubjects: ['英語'],
      currentConfig: config,
      maxDailyHours: 6,
    });
    expect(r.subjectCapacityShortage.count).toBe(1);
    expect(r.subjectCapacityShortage.items[0]).toMatchObject({ subject: '英語', demand: 6, capacity: 4 });
  });

  it('クォータ合計 ≠ セル数を quotaCellMismatch として検出', () => {
    const config = { ...twoByTwo(), subjectCounts: { '英語': 1, '数学': 1 } }; // 合計 2 ≠ セル 4
    const r = computeInfeasibilities({
      teachers,
      commonSubjects: ['英語', '数学'],
      currentConfig: config,
      maxDailyHours: 6,
    });
    expect(r.quotaCellMismatch.count).toBe(1);
    expect(r.quotaCellMismatch.items[0]).toEqual({ totalQuota: 2, cells: 4 });
  });

  it('クォータ合計 = セル数なら quotaCellMismatch は 0', () => {
    const r = computeInfeasibilities({
      teachers,
      commonSubjects: ['英語', '数学'],
      currentConfig: twoByTwo(), // 合計 4 = 2 日 × 2 時限
      maxDailyHours: 6,
    });
    expect(r.quotaCellMismatch.count).toBe(0);
  });

  it('コマ数 > 日数を subjectQuotaOverDays として検出 (同日重複禁止で達成不能)', () => {
    const config = { ...twoByTwo(), subjectCounts: { '英語': 3, '数学': 1 } };
    const r = computeInfeasibilities({
      teachers,
      commonSubjects: ['英語', '数学'],
      currentConfig: config,
      maxDailyHours: 6,
    });
    expect(r.subjectQuotaOverDays.count).toBe(1);
    expect(r.subjectQuotaOverDays.items[0]).toEqual({ subject: '英語', quota: 3, days: 2 });
  });
});

describe('computeInfeasibilities — 合同グループの capacity 割引 (校正レビュー対応)', () => {
  it('常時合同 (dates:null) のクラス群は 1 クラス相当に割り引いて false positive を出さない', () => {
    // 2 クラス常時合同・講師 1 名・1 日 1 時限・クォータ 1:
    // 割引なしだと demand=2 > capacity=1 で誤警告になる構成
    const r = computeInfeasibilities({
      teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: [] }],
      commonSubjects: ['英語'],
      currentConfig: {
        dates: [{ id: 1, label: '12/25' }],
        periods: [{ id: 1, label: '1限' }],
        classes: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }],
        subjectCounts: { '英語': 1 },
      },
      maxDailyHours: 6,
      combinedGroups: [{ id: 1, subject: '英語', classes: ['A', 'B'], dates: null }],
    });
    expect(r.subjectCapacityShortage.count).toBe(0);
  });

  it('日付限定の合同 (dates 指定あり) は保守的に割引しない', () => {
    const r = computeInfeasibilities({
      teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: [] }],
      commonSubjects: ['英語'],
      currentConfig: {
        dates: [{ id: 1, label: '12/25' }],
        periods: [{ id: 1, label: '1限' }],
        classes: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }],
        subjectCounts: { '英語': 1 },
      },
      maxDailyHours: 6,
      combinedGroups: [{ id: 1, subject: '英語', classes: ['A', 'B'], dates: ['12/26'] }],
    });
    expect(r.subjectCapacityShortage.count).toBe(1);
  });
});
