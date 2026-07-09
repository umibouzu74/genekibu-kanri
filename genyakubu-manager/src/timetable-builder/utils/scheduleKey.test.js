import { describe, expect, it, vi } from 'vitest';
import {
  makeKey,
  parseKey,
  makeNgKey,
  makeExternalKey,
  findCombinedGroup,
  isPrimaryCombinedClass,
  countTeacherHoursWithCombined,
  isLegacyKey,
  migrateScheduleKeys,
  migrateTabV2toV3,
  migrateProject,
  normalizeTeacherFields,
  normalizeCombinedGroups,
  findEntityById,
  nextId,
  activeDatesForTab,
  activePeriodsForTab,
  effectiveConfigForTab,
  findConflictingCombinedGroup,
} from './scheduleKey';

describe('activeDatesForTab', () => {
  const pool = [{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }];
  it('activeDateIds 未指定 (undefined) はプール全体を返す', () => {
    expect(activeDatesForTab(pool, { config: {} })).toBe(pool);
    expect(activeDatesForTab(pool, {})).toBe(pool);
  });
  it('activeDateIds で絞った subset をプール順で返す', () => {
    expect(activeDatesForTab(pool, { config: { activeDateIds: [3, 1] } })).toEqual([
      { id: 1, label: 'A' }, { id: 3, label: 'C' },
    ]);
  });
  it('空配列なら 0 件', () => {
    expect(activeDatesForTab(pool, { config: { activeDateIds: [] } })).toEqual([]);
  });
  it('pool が空/未定義でも安全', () => {
    expect(activeDatesForTab(undefined, { config: { activeDateIds: [1] } })).toEqual([]);
  });
  it('挿入順のプールをカレンダー順に並べ替えて返す (時間割の行順)', () => {
    // tabDates/setByLabels は新規日付を末尾 push するため、タブ別に後から
    // 追加した日はプール上でカレンダー順とずれる (F5j と同根)。
    const shuffled = [
      { id: 1, label: '7/29(水)' }, { id: 2, label: '8/4(火)' }, { id: 3, label: '7/24(金)' },
    ];
    expect(activeDatesForTab(shuffled, { config: {} }).map(d => d.label)).toEqual([
      '7/24(金)', '7/29(水)', '8/4(火)',
    ]);
    expect(activeDatesForTab(shuffled, { config: { activeDateIds: [2, 3] } }).map(d => d.label)).toEqual([
      '7/24(金)', '8/4(火)',
    ]);
  });
  it('既にカレンダー順のプールは参照をそのまま返す (identity 保持)', () => {
    const sortedPool = [{ id: 1, label: '7/24(金)' }, { id: 2, label: '7/29(水)' }];
    expect(activeDatesForTab(sortedPool, { config: {} })).toBe(sortedPool);
  });
  it('M/D として解釈できないラベルは末尾 (安定順)', () => {
    const mixed = [
      { id: 1, label: '予備日' }, { id: 2, label: '7/29(水)' }, { id: 3, label: '7/24(金)' },
    ];
    expect(activeDatesForTab(mixed, { config: {} }).map(d => d.label)).toEqual([
      '7/24(金)', '7/29(水)', '予備日',
    ]);
  });
});

describe('activePeriodsForTab', () => {
  const pool = [{ id: 1, label: '1限' }, { id: 2, label: '2限' }, { id: 3, label: '3限' }];
  it('activePeriodIds 未指定 (undefined) はプール全体を返す', () => {
    expect(activePeriodsForTab(pool, { config: {} })).toBe(pool);
    expect(activePeriodsForTab(pool, {})).toBe(pool);
  });
  it('activePeriodIds で絞った subset をプール順で返す', () => {
    expect(activePeriodsForTab(pool, { config: { activePeriodIds: [3, 1] } })).toEqual([
      { id: 1, label: '1限' }, { id: 3, label: '3限' },
    ]);
  });
  it('空配列なら 0 件', () => {
    expect(activePeriodsForTab(pool, { config: { activePeriodIds: [] } })).toEqual([]);
  });
  it('pool が空/未定義でも安全', () => {
    expect(activePeriodsForTab(undefined, { config: { activePeriodIds: [1] } })).toEqual([]);
  });
});

describe('effectiveConfigForTab (F2i)', () => {
  const project = {
    dates: [{ id: 1, label: '7/1' }, { id: 2, label: '7/2' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
  };
  it('tab.config を保ちつつ dates / periods を絞った実効 config を返す', () => {
    const tab = {
      config: {
        classes: [{ id: 1, label: 'A' }],
        subjectCounts: { 英語: 2 },
        activeDateIds: [2],
        activePeriodIds: [1],
      },
    };
    const eff = effectiveConfigForTab(project, tab);
    expect(eff.classes).toEqual([{ id: 1, label: 'A' }]);
    expect(eff.subjectCounts).toEqual({ 英語: 2 });
    expect(eff.dates).toEqual([{ id: 2, label: '7/2' }]);
    expect(eff.periods).toEqual([{ id: 1, label: '1限' }]);
  });
  it('activeDateIds / activePeriodIds 未指定はプール全体を使う', () => {
    const eff = effectiveConfigForTab(project, { config: { classes: [] } });
    expect(eff.dates).toBe(project.dates);
    expect(eff.periods).toBe(project.periods);
  });
  it('project / tab が欠けていても安全 (dates / periods は空配列)', () => {
    const eff = effectiveConfigForTab(undefined, undefined);
    expect(eff.dates).toEqual([]);
    expect(eff.periods).toEqual([]);
  });
  it('日付プールが挿入順でも実効 config の dates はカレンダー順', () => {
    const proj = {
      dates: [{ id: 1, label: '7/29(水)' }, { id: 2, label: '7/24(金)' }],
      periods: [{ id: 1, label: '1限' }],
    };
    const eff = effectiveConfigForTab(proj, { config: {} });
    expect(eff.dates.map(d => d.label)).toEqual(['7/24(金)', '7/29(水)']);
    // periods は手打ちの並び (プール順) を維持する
    expect(eff.periods).toBe(proj.periods);
  });
});

describe('findConflictingCombinedGroup (F5z)', () => {
  const groups = [
    { id: 1, subject: '英語', classes: ['A', 'B'], dates: null },
    { id: 2, subject: '数学', classes: ['A', 'B'], dates: ['7/1'] },
  ];
  it('同じ科目でクラスと日程が重なる既存グループを返す', () => {
    expect(findConflictingCombinedGroup(groups, { subject: '英語', classes: ['B', 'C'], dates: ['7/2'] }))
      .toBe(groups[0]);
    expect(findConflictingCombinedGroup(groups, { subject: '数学', classes: ['A'], dates: null }))
      .toBe(groups[1]);
  });
  it('科目が違えば競合しない', () => {
    expect(findConflictingCombinedGroup(groups, { subject: '国語', classes: ['A', 'B'], dates: null })).toBeNull();
  });
  it('クラスが交差しなければ競合しない', () => {
    expect(findConflictingCombinedGroup(groups, { subject: '英語', classes: ['C', 'D'], dates: null })).toBeNull();
  });
  it('日程が交差しなければ競合しない (null = 全日程は常に交差)', () => {
    expect(findConflictingCombinedGroup(groups, { subject: '数学', classes: ['A', 'B'], dates: ['7/2'] })).toBeNull();
    expect(findConflictingCombinedGroup(groups, { subject: '数学', classes: ['A', 'B'], dates: null })).toBe(groups[1]);
  });
  it('excludeId で編集中の自分自身は除外する', () => {
    expect(findConflictingCombinedGroup(groups, { subject: '英語', classes: ['A', 'B'], dates: null }, 1)).toBeNull();
  });
  it('groups / candidate が空でも安全', () => {
    expect(findConflictingCombinedGroup(null, { subject: '英語', classes: ['A'] })).toBeNull();
    expect(findConflictingCombinedGroup(groups, null)).toBeNull();
    expect(findConflictingCombinedGroup(groups, { subject: '英語' })).toBeNull();
  });
});

describe('makeKey / parseKey', () => {
  it('makeKey は ID から "dN-pN-cN" 形式の文字列を生成する', () => {
    expect(makeKey(1, 2, 3)).toBe('d1-p2-c3');
    expect(makeKey(99, 7, 11)).toBe('d99-p7-c11');
  });

  it('parseKey は ID をフィールドとして返す', () => {
    expect(parseKey('d1-p2-c3')).toEqual({ dateId: 1, periodId: 2, classId: 3 });
    expect(parseKey('d99-p7-c11')).toEqual({ dateId: 99, periodId: 7, classId: 11 });
  });

  it('parseKey は不正な形式に null を返す', () => {
    expect(parseKey('12/25(木)-1限-３S')).toBeNull();
    expect(parseKey('d1-p2')).toBeNull();
    expect(parseKey('')).toBeNull();
    expect(parseKey('foo')).toBeNull();
  });

  it('makeKey と parseKey は round-trip する', () => {
    for (const [d, p, c] of [[1, 1, 1], [5, 3, 2], [99, 7, 11]]) {
      expect(parseKey(makeKey(d, p, c))).toEqual({ dateId: d, periodId: p, classId: c });
    }
  });
});

describe('findEntityById / nextId', () => {
  const entities = [{ id: 1, label: 'a' }, { id: 3, label: 'b' }, { id: 5, label: 'c' }];

  it('findEntityById は ID 一致 entity を返す', () => {
    expect(findEntityById(entities, 3)).toEqual({ id: 3, label: 'b' });
    expect(findEntityById(entities, 999)).toBeUndefined();
    expect(findEntityById(undefined, 1)).toBeUndefined();
  });

  it('nextId は max + 1 を返す (空なら 1)', () => {
    expect(nextId(entities)).toBe(6);
    expect(nextId([])).toBe(1);
    expect(nextId(null)).toBe(1);
  });
});

describe('makeNgKey / makeExternalKey', () => {
  it('NG キーは日付・時限の文字列を結合する (config 変更耐性)', () => {
    expect(makeNgKey('12/25(木)', '1限 (13:00~)')).toBe('12/25(木)-1限 (13:00~)');
  });

  it('外部カウントキーは日付と講師名を結合する', () => {
    expect(makeExternalKey('12/25(木)', '堀上')).toBe('12/25(木)-堀上');
  });
});

describe('findCombinedGroup', () => {
  const groups = [
    { id: 1, subject: '英語', classes: ['３S', '３A'], dates: null },
    { id: 2, subject: '数学', classes: ['３B', '３C'], dates: ['12/25(木)'] },
  ];

  it('科目とクラスにマッチするグループを返す (dates が null なら全日)', () => {
    expect(findCombinedGroup(groups, '英語', '３S', '12/25(木)')?.id).toBe(1);
    expect(findCombinedGroup(groups, '英語', '３A', '12/27(日)')?.id).toBe(1);
  });

  it('dates が指定されている場合は日付も一致する必要がある', () => {
    expect(findCombinedGroup(groups, '数学', '３B', '12/25(木)')?.id).toBe(2);
    expect(findCombinedGroup(groups, '数学', '３B', '12/26(金)')).toBeNull();
  });

  it('該当なしには null を返す', () => {
    expect(findCombinedGroup(groups, '国語', '３S', '12/25(木)')).toBeNull();
    expect(findCombinedGroup(groups, '英語', '３C', '12/25(木)')).toBeNull();
  });

  it('空配列・未定義の subject に対しても安全', () => {
    expect(findCombinedGroup([], '英語', '３S', '12/25(木)')).toBeNull();
    expect(findCombinedGroup(groups, null, '３S', '12/25(木)')).toBeNull();
  });
});

describe('isPrimaryCombinedClass', () => {
  it('グループの先頭クラスのみ true', () => {
    const group = { id: 1, classes: ['３S', '３A', '３B'] };
    expect(isPrimaryCombinedClass(group, '３S')).toBe(true);
    expect(isPrimaryCombinedClass(group, '３A')).toBe(false);
    expect(isPrimaryCombinedClass(null, '３S')).toBeFalsy();
    expect(isPrimaryCombinedClass(undefined, '３S')).toBeFalsy();
  });
});

describe('countTeacherHoursWithCombined', () => {
  // v3: config.dates/periods/classes は { id, label } の entity 配列
  const config = {
    dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }, { id: 3, label: '３B' }],
  };

  it('通常のコマは講師ごとにカウント', () => {
    const schedule = {
      'd1-p1-c1': { subject: '英語', teacher: '堀上' },
      'd1-p1-c2': { subject: '英語', teacher: '田中' },
      'd1-p2-c1': { subject: '数学', teacher: '堀上' },
    };
    const totals = countTeacherHoursWithCombined(schedule, config, []);
    expect(totals).toEqual({ '堀上': 2, '田中': 1 });
  });

  it('合同グループは同じ時間枠で重複カウントしない', () => {
    const groups = [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }];
    const schedule = {
      'd1-p1-c1': { subject: '英語', teacher: '堀上' },
      'd1-p1-c2': { subject: '英語', teacher: '堀上' },
    };
    const totals = countTeacherHoursWithCombined(schedule, config, groups);
    expect(totals).toEqual({ '堀上': 1 });
  });

  it('「未定」は無視する', () => {
    const schedule = { 'd1-p1-c1': { subject: '英語', teacher: '未定' } };
    expect(countTeacherHoursWithCombined(schedule, config, [])).toEqual({});
  });
});

describe('isLegacyKey', () => {
  it('新形式は false', () => {
    expect(isLegacyKey('d0-p0-c0')).toBe(false);
    expect(isLegacyKey('d99-p7-c11')).toBe(false);
  });

  it('旧形式・未知の形式は true', () => {
    expect(isLegacyKey('12/25(木)-1限 (13:00~)-３S')).toBe(true);
    expect(isLegacyKey('something-random')).toBe(true);
  });
});

// migrateScheduleKeys は v1 -> v2 専用 (旧 string キー -> インデックスキー)。
describe('migrateScheduleKeys (v1 → v2)', () => {
  const config = {
    dates: ['12/25(木)', '12/26(金)'],
    periods: ['1限 (13:00~)', '2限 (14:10~)'],
    classes: ['３S', '３A'],
  };

  it('旧形式キーを v2 インデックスキーへ変換', () => {
    const legacy = {
      '12/25(木)-1限 (13:00~)-３S': { subject: '英語', teacher: '堀上' },
      '12/26(金)-2限 (14:10~)-３A': { subject: '数学', teacher: '田中' },
    };
    const migrated = migrateScheduleKeys(legacy, config);
    expect(migrated).toEqual({
      'd0-p0-c0': { subject: '英語', teacher: '堀上' },
      'd1-p1-c1': { subject: '数学', teacher: '田中' },
    });
  });

  it('既に新形式ならそのまま返す (object reference identity も保持)', () => {
    const newSch = { 'd0-p0-c0': { subject: '英語', teacher: '堀上' } };
    expect(migrateScheduleKeys(newSch, config)).toBe(newSch);
  });

  it('config 変更でマッチしないキーは破棄し warning を出す', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const legacy = {
      '12/25(木)-1限 (13:00~)-３S': { subject: '英語', teacher: '堀上' },
      '12/99(木)-1限-存在しないクラス': { subject: '数学', teacher: '田中' },
    };
    const migrated = migrateScheduleKeys(legacy, config);
    expect(migrated).toEqual({ 'd0-p0-c0': { subject: '英語', teacher: '堀上' } });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('migrateTabV2toV3', () => {
  const v2Tab = {
    id: 1,
    name: 'main',
    config: {
      dates: ['12/25(木)', '12/26(金)'],
      periods: ['1限', '2限'],
      classes: ['３S', '３A'],
      subjectCounts: { 英語: 1 },
    },
    schedule: {
      'd0-p0-c0': { subject: '英語', teacher: '堀上' },
      'd1-p1-c1': { subject: '数学', teacher: '田中' },
    },
  };

  it('dates/periods/classes が { id, label } 配列になる', () => {
    const result = migrateTabV2toV3(v2Tab);
    expect(result.config.dates).toEqual([
      { id: 1, label: '12/25(木)' },
      { id: 2, label: '12/26(金)' },
    ]);
    expect(result.config.periods).toEqual([
      { id: 1, label: '1限' },
      { id: 2, label: '2限' },
    ]);
    expect(result.config.classes).toEqual([
      { id: 1, label: '３S' },
      { id: 2, label: '３A' },
    ]);
  });

  it('schedule キーがインデックス → ID に書き換わる', () => {
    const result = migrateTabV2toV3(v2Tab);
    expect(result.schedule).toEqual({
      'd1-p1-c1': { subject: '英語', teacher: '堀上' },
      'd2-p2-c2': { subject: '数学', teacher: '田中' },
    });
  });

  it('既に v3 形式の tab はそのまま返す', () => {
    const v3Tab = {
      id: 1, name: 'main',
      config: {
        dates: [{ id: 1, label: '12/25' }],
        periods: [{ id: 1, label: '1限' }],
        classes: [{ id: 1, label: '３S' }],
        subjectCounts: {},
      },
      schedule: {},
    };
    expect(migrateTabV2toV3(v3Tab)).toBe(v3Tab);
  });

  it('全 dimension が空配列 (v3 互換) ならそのまま返す', () => {
    // 空配列は v3 schema として有効。再 wrap して corruption しないこと。
    const tab = {
      id: 1, name: 'main',
      config: { dates: [], periods: [], classes: [], subjectCounts: {} },
      schedule: {},
    };
    expect(migrateTabV2toV3(tab)).toBe(tab);
  });

  it('混在: 1 次元だけ空で他は v3 でも残りを破壊しない', () => {
    // 回帰テスト: 旧実装では isV3() が length>0 を要求するため、片方が空だと
    // 全 dimension が wrap() を経由して既存 v3 entity が二重ネスト化した。
    const tab = {
      id: 1, name: 'main',
      config: {
        dates: [],
        periods: [{ id: 1, label: '1限' }],
        classes: [{ id: 1, label: '３S' }],
        subjectCounts: {},
      },
      schedule: {},
    };
    const result = migrateTabV2toV3(tab);
    expect(result.config.periods).toEqual([{ id: 1, label: '1限' }]);
    expect(result.config.classes).toEqual([{ id: 1, label: '３S' }]);
    expect(result.config.dates).toEqual([]);
  });

  it('混在: v2 string と v3 object が次元別に混在しても各次元を独立処理', () => {
    const tab = {
      id: 1, name: 'main',
      config: {
        dates: ['12/25', '12/26'],          // v2 string
        periods: [{ id: 5, label: '1限' }],  // v3 (ID 5)
        classes: ['３S'],                    // v2 string
        subjectCounts: {},
      },
      schedule: {},
    };
    const result = migrateTabV2toV3(tab);
    // v2 だった dates は 1 始まり ID で wrap
    expect(result.config.dates).toEqual([
      { id: 1, label: '12/25' },
      { id: 2, label: '12/26' },
    ]);
    // v3 だった periods は ID を維持
    expect(result.config.periods).toEqual([{ id: 5, label: '1限' }]);
    // v2 だった classes は wrap
    expect(result.config.classes).toEqual([{ id: 1, label: '３S' }]);
  });

  it('混在: v3 次元の schedule キー成分は ID として解釈する (F5f: シフト/消失しない)', () => {
    // dates は v3 で ID が歯抜け ([1, 3])、periods / classes は v2 string。
    // 旧実装は v3 次元もインデックス解釈したため、d1 (ID 1) を「位置 1」と
    // 読んで ID 3 へシフト、d3 (ID 3) は「位置 3 = 範囲外」で消失した。
    const tab = {
      id: 1, name: 'main',
      config: {
        dates: [{ id: 1, label: '12/25' }, { id: 3, label: '12/27' }], // v3 (歯抜け ID)
        periods: ['1限'],   // v2 → index 0 = id 1
        classes: ['３S'],   // v2 → index 0 = id 1
        subjectCounts: {},
      },
      schedule: {
        'd1-p0-c0': { subject: '英語', teacher: '堀上' }, // dateId=1 (ID として)
        'd3-p0-c0': { subject: '数学', teacher: '田中' }, // dateId=3 (ID として)
      },
    };
    const result = migrateTabV2toV3(tab);
    expect(result.schedule['d1-p1-c1']).toEqual({ subject: '英語', teacher: '堀上' });
    expect(result.schedule['d3-p1-c1']).toEqual({ subject: '数学', teacher: '田中' });
    expect(Object.keys(result.schedule)).toHaveLength(2);
  });

  it('混在: v3 次元に存在しない ID のキーは drop される (F5f)', () => {
    const tab = {
      id: 1, name: 'main',
      config: {
        dates: [{ id: 1, label: '12/25' }],
        periods: ['1限'],
        classes: ['３S'],
        subjectCounts: {},
      },
      schedule: {
        'd9-p0-c0': { subject: '英語', teacher: '堀上' }, // ID 9 は存在しない
      },
    };
    expect(migrateTabV2toV3(tab).schedule).toEqual({});
  });

  it('範囲外の v2 schedule キーは drop される', () => {
    const tab = {
      id: 1, name: 'main',
      config: {
        dates: ['12/25'],
        periods: ['1限'],
        classes: ['３S'],
        subjectCounts: {},
      },
      schedule: {
        'd0-p0-c0': { subject: '英語', teacher: '堀上' },  // valid
        'd99-p0-c0': { subject: '数学', teacher: '田中' }, // out-of-range date
        'd0-p99-c0': { subject: '国語', teacher: '佐藤' }, // out-of-range period
        'd0-p0-c99': { subject: '理科', teacher: '高松' }, // out-of-range class
        'not-a-key': { subject: 'x', teacher: 'y' },        // 不正形式
      },
    };
    const result = migrateTabV2toV3(tab);
    expect(Object.keys(result.schedule)).toEqual(['d1-p1-c1']);
    expect(result.schedule['d1-p1-c1']).toEqual({ subject: '英語', teacher: '堀上' });
  });
});

describe('migrateProject — externalCounts の補完', () => {
  it('externalCounts が欠落した JSON は {} に補完される (types.ts の必須宣言との整合)', () => {
    const project = {
      version: 4,
      dates: [{ id: 1, label: '12/25' }],
      periods: [{ id: 1, label: '1限' }],
      tabs: [{ id: 1, name: 'A', config: { classes: [], subjectCounts: {} }, schedule: {} }],
      teachers: [],
    };
    const migrated = migrateProject(project);
    expect(migrated.externalCounts).toEqual({});
  });
});

describe('migrateProject', () => {
  const makeLegacyProject = () => ({
    teachers: [{ name: '堀上', subjects: ['英語'] }],
    tabs: [{
      id: 1,
      name: '中3',
      config: {
        dates: ['12/25(木)'],
        periods: ['1限 (13:00~)'],
        classes: ['３S'],
        subjectCounts: { '英語': 1, '数学': 1 },
      },
      schedule: {
        '12/25(木)-1限 (13:00~)-３S': { subject: '英語', teacher: '堀上' },
      },
    }],
  });

  it('null/undefined を素通し', () => {
    expect(migrateProject(null)).toBeNull();
    expect(migrateProject(undefined)).toBeUndefined();
  });

  it('v1 → v4 までチェーンマイグレーション: version=4, createdAt/updatedAt/name 補完', () => {
    const result = migrateProject(makeLegacyProject());
    expect(result.version).toBe(4);
    expect(result.name).toBe('');
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('v1 → v4: schedule キーが ID ベースに、dates/periods は project 共通、classes は tab', () => {
    const result = migrateProject(makeLegacyProject());
    // v4: dates / periods は project レベルへ昇格
    expect(result.dates).toEqual([{ id: 1, label: '12/25(木)' }]);
    expect(result.periods).toEqual([{ id: 1, label: '1限 (13:00~)' }]);
    expect(result.tabs[0].config.dates).toBeUndefined();
    expect(result.tabs[0].config.periods).toBeUndefined();
    expect(result.tabs[0].config.classes).toEqual([{ id: 1, label: '３S' }]);
    expect(result.tabs[0].schedule).toEqual({
      'd1-p1-c1': { subject: '英語', teacher: '堀上' },
    });
  });

  it('v3→v4: タブ別の dates / periods は activeDateIds / activePeriodIds として保存される', () => {
    const p = {
      version: 3,
      teachers: [],
      activeTabId: 1,
      tabs: [
        {
          id: 1,
          name: '中３',
          config: {
            dates: [{ id: 1, label: '12/25(木)' }],
            periods: [{ id: 1, label: '昼1限' }],
            classes: [{ id: 1, label: '３S' }],
            subjectCounts: { '英語': 1 },
          },
          schedule: {},
        },
        {
          id: 2,
          name: '中１・２',
          config: {
            dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
            periods: [{ id: 1, label: '夜1限' }],
            classes: [{ id: 1, label: '１S' }],
            subjectCounts: { '英語': 1 },
          },
          schedule: {},
        },
      ],
    };
    const result = migrateProject(p);
    // union プール: 日付 2 件 / 時限 2 件
    expect(result.dates.map(d => d.label)).toEqual(['12/25(木)', '12/26(金)']);
    expect(result.periods.map(x => x.label)).toEqual(['昼1限', '夜1限']);
    // 中３ は 12/25 + 昼1限 のみ使う (旧 subset を保存)
    const tab1 = result.tabs.find(t => t.id === 1);
    expect(tab1.config.activeDateIds).toEqual([1]);
    expect(tab1.config.activePeriodIds).toEqual([1]);
    // 中１・２ は全日使う (プールと一致 → undefined = 全日) + 夜1限のみ
    const tab2 = result.tabs.find(t => t.id === 2);
    expect(tab2.config.activeDateIds).toBeUndefined();
    expect(tab2.config.activePeriodIds).toEqual([2]);
  });

  it('teachers 欠落 JSON は空配列で補完される (読込直後の crash 防止)', () => {
    const p = makeLegacyProject();
    delete p.teachers;
    const result = migrateProject(p);
    expect(result.teachers).toEqual([]);
  });

  it('dangling activeTabId は先頭タブへ正規化される', () => {
    const p = { ...makeLegacyProject(), activeTabId: 99 };
    const result = migrateProject(p);
    expect(result.activeTabId).toBe(1);
  });

  it('subjects が無ければ subjectCounts のキーから生成', () => {
    const result = migrateProject(makeLegacyProject());
    expect(result.subjects).toEqual(['英語', '数学']);
  });

  it('subjectColors / combinedGroups を空で補完', () => {
    const result = migrateProject(makeLegacyProject());
    expect(result.subjectColors).toEqual({});
    expect(result.combinedGroups).toEqual([]);
  });

  it('externalSessions が未設定なら空配列で補完', () => {
    const result = migrateProject(makeLegacyProject());
    expect(result.externalSessions).toEqual([]);
  });

  it('externalSessions が既にあれば上書きしない', () => {
    const p = makeLegacyProject();
    p.externalSessions = [{ id: 1, date: '7/29(水)', teacherName: '堀上', label: '1限', memo: '予備校' }];
    const result = migrateProject(p);
    expect(result.externalSessions).toHaveLength(1);
    expect(result.externalSessions[0].id).toBe(1);
  });

  it('externalSessionPresets が未設定なら空配列で補完', () => {
    const result = migrateProject(makeLegacyProject());
    expect(result.externalSessionPresets).toEqual([]);
  });

  it('externalSessionPresets が既にあれば上書きしない', () => {
    const p = makeLegacyProject();
    p.externalSessionPresets = [{ id: 1, name: '予備校（早朝）', startTime: '12:25', endTime: '13:35' }];
    const result = migrateProject(p);
    expect(result.externalSessionPresets).toHaveLength(1);
    expect(result.externalSessionPresets[0].name).toBe('予備校（早朝）');
  });

  it('講師名の重複は migration で " (2)" / " (3)" の suffix を付けて uniq 化', () => {
    const p = makeLegacyProject();
    p.teachers = [
      { name: '堀上', subjects: ['英語'] },
      { name: '堀上', subjects: ['数学'] },
      { name: '堀上', subjects: ['国語'] },
      { name: '田中', subjects: ['英語'] },
    ];
    const result = migrateProject(p);
    expect(result.teachers.map(t => t.name)).toEqual(['堀上', '堀上 (2)', '堀上 (3)', '田中']);
  });

  it('重複が無い teachers 配列は migration で参照そのまま (no-op)', () => {
    const p = makeLegacyProject();
    // F5b の要素正規化が no-op になるよう完全な形の teacher を使う
    // (配列フィールド欠落は補完されて参照が変わる、正規化テスト側で検証)
    p.teachers = [
      { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      { name: '田中', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
    ];
    const before = p.teachers;
    const result = migrateProject(p);
    expect(result.teachers).toBe(before);
  });

  it('v2 プロジェクトは v4 までマイグレーションされる', () => {
    const v2 = {
      version: 2,
      teachers: [],
      tabs: [{
        id: 1,
        name: 'a',
        config: { dates: ['x'], periods: ['y'], classes: ['z'], subjectCounts: { '英': 1 } },
        schedule: { 'd0-p0-c0': { subject: '英', teacher: 'T' } },
      }],
    };
    const result = migrateProject(v2);
    expect(result.version).toBe(4);
    expect(result.dates).toEqual([{ id: 1, label: 'x' }]);
    expect(result.periods).toEqual([{ id: 1, label: 'y' }]);
    expect(result.tabs[0].config.classes).toEqual([{ id: 1, label: 'z' }]);
    expect(result.tabs[0].schedule).toEqual({ 'd1-p1-c1': { subject: '英', teacher: 'T' } });
  });

  it('v3 プロジェクトは v4 へ昇格 (dates/periods を project へ移動)', () => {
    const v3 = {
      version: 3,
      teachers: [],
      tabs: [{
        id: 1,
        name: 'a',
        config: {
          dates: [{ id: 1, label: 'x' }],
          periods: [{ id: 1, label: 'y' }],
          classes: [{ id: 1, label: 'z' }],
          subjectCounts: { '英': 1 },
        },
        schedule: { 'd1-p1-c1': { subject: '英', teacher: 'T' } },
      }],
    };
    const result = migrateProject(v3);
    expect(result.version).toBe(4);
    expect(result.dates).toEqual([{ id: 1, label: 'x' }]);
    expect(result.periods).toEqual([{ id: 1, label: 'y' }]);
    expect(result.tabs[0].config.dates).toBeUndefined();
    expect(result.tabs[0].config.periods).toBeUndefined();
    expect(result.tabs[0].config.classes).toEqual([{ id: 1, label: 'z' }]);
    expect(result.tabs[0].schedule).toEqual({ 'd1-p1-c1': { subject: '英', teacher: 'T' } });
  });

  it('v4 プロジェクトはそのまま (再マイグレーション無し)', () => {
    const v4 = {
      version: 4,
      teachers: [],
      dates: [{ id: 1, label: 'x' }],
      periods: [{ id: 1, label: 'y' }],
      tabs: [{
        id: 1,
        name: 'a',
        config: { classes: [{ id: 1, label: 'z' }], subjectCounts: { '英': 1 } },
        schedule: { 'd1-p1-c1': { subject: '英', teacher: 'T' } },
      }],
    };
    const result = migrateProject(v4);
    expect(result.version).toBe(4);
    expect(result.dates).toBe(v4.dates);
    expect(result.tabs[0].schedule).toBe(v4.tabs[0].schedule);
  });

  it('v3 → v4: 複数タブの dates/periods を union し schedule を remap する', () => {
    // tab1 は [A, B] 日 / [1限] 時限、tab2 は [B, C] 日 / [1限]。
    // union = [A, B, C] (出現順保持)。schedule キーは旧 tab-local ID から
    // ラベル経由で新 project ID に remap される。
    const v3 = {
      version: 3,
      teachers: [],
      tabs: [
        {
          id: 1, name: 'tab1',
          config: {
            dates: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }],
            periods: [{ id: 1, label: '1限' }],
            classes: [{ id: 1, label: 'S' }],
            subjectCounts: {},
          },
          // B(id2)-1限(id1)-S(id1)
          schedule: { 'd2-p1-c1': { subject: '英', teacher: 'T1' } },
        },
        {
          id: 2, name: 'tab2',
          config: {
            dates: [{ id: 1, label: 'B' }, { id: 2, label: 'C' }],
            periods: [{ id: 1, label: '1限' }],
            classes: [{ id: 1, label: 'S' }],
            subjectCounts: {},
          },
          // C(id2)-1限(id1)-S(id1)
          schedule: { 'd2-p1-c1': { subject: '数', teacher: 'T2' } },
        },
      ],
    };
    const result = migrateProject(v3);
    expect(result.dates).toEqual([
      { id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' },
    ]);
    // tab1 の B コマは project の B(id2) を指す → d2-p1-c1 のまま
    expect(result.tabs[0].schedule).toEqual({ 'd2-p1-c1': { subject: '英', teacher: 'T1' } });
    // tab2 の C コマは project の C(id3) へ remap → d3-p1-c1
    expect(result.tabs[1].schedule).toEqual({ 'd3-p1-c1': { subject: '数', teacher: 'T2' } });
  });
});

// ─── F.5 系統 A: 型崩れ JSON の正規化 ────────────────────────────────

describe('normalizeTeacherFields', () => {
  it('配列フィールドが欠落した teacher に空配列を補完する', () => {
    const result = normalizeTeacherFields([{ name: 'A' }]);
    expect(result).toEqual([
      { name: 'A', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [] },
    ]);
  });

  it('object でない要素・name の無い要素は drop する', () => {
    const result = normalizeTeacherFields(['x', null, { subjects: ['英語'] }, { name: 'B', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] }]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('B');
  });

  it('全要素が正常なら同一参照を返す (no-op)', () => {
    const teachers = [{ name: 'A', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [] }];
    expect(normalizeTeacherFields(teachers)).toBe(teachers);
  });

  it('個別上限 3 種は正の有限数以外を落とす (M15 + N3a)', () => {
    const result = normalizeTeacherFields([{
      name: 'A', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [],
      maxDailyHours: '3', maxTotalHours: 8, maxConsecutivePeriods: -1,
    }]);
    expect(result[0]).not.toHaveProperty('maxDailyHours');
    expect(result[0].maxTotalHours).toBe(8);
    expect(result[0]).not.toHaveProperty('maxConsecutivePeriods');
  });
});

describe('normalizeCombinedGroups', () => {
  it('dates キー欠落 (undefined) は null (全日) に正規化する', () => {
    const result = normalizeCombinedGroups([{ id: 1, subject: '英語', classes: ['A', 'B'] }]);
    expect(result).toEqual([{ id: 1, subject: '英語', classes: ['A', 'B'], dates: null }]);
  });

  it('classes 非配列 / subject 非文字列のグループは drop する', () => {
    const result = normalizeCombinedGroups([
      { id: 1, subject: '英語', classes: 'A' },
      { id: 2, subject: 3, classes: ['A', 'B'], dates: null },
      { id: 3, subject: '数学', classes: ['A', 'B'], dates: ['7/1'] },
    ]);
    expect(result).toEqual([{ id: 3, subject: '数学', classes: ['A', 'B'], dates: ['7/1'] }]);
  });

  it('全要素が正常なら同一参照を返す (no-op)', () => {
    const groups = [{ id: 1, subject: '英語', classes: ['A', 'B'], dates: null }];
    expect(normalizeCombinedGroups(groups)).toBe(groups);
  });
});

describe('migrateProject — 型崩れ JSON の正規化 (F5a-F5e)', () => {
  const baseTab = () => ({
    id: 1,
    name: 'メイン',
    config: { classes: [{ id: 1, label: 'A' }], subjectCounts: { '英語': 1 } },
    schedule: {},
  });
  const v4base = (overrides = {}) => ({
    version: 4,
    dates: [{ id: 1, label: '7/1' }],
    periods: [{ id: 1, label: '1限' }],
    activeTabId: 1,
    tabs: [baseTab()],
    teachers: [],
    ...overrides,
  });

  it('combinedGroups: {} (truthy な非配列) は空配列に正規化される', () => {
    const p = migrateProject(v4base({ combinedGroups: {} }));
    expect(p.combinedGroups).toEqual([]);
  });

  it('externalSessions: {} は空配列に、非 object 要素は drop される', () => {
    expect(migrateProject(v4base({ externalSessions: {} })).externalSessions).toEqual([]);
    const p = migrateProject(v4base({ externalSessions: ['x', { id: 1, date: '7/1', teacherName: 'A' }] }));
    expect(p.externalSessions).toEqual([{ id: 1, date: '7/1', teacherName: 'A' }]);
  });

  it('subjects が文字列なら subjectCounts のキーから再生成される', () => {
    const p = migrateProject(v4base({ subjects: '英語' }));
    expect(p.subjects).toEqual(['英語']);
  });

  it('externalCounts が配列なら空オブジェクトに正規化される', () => {
    const p = migrateProject(v4base({ externalCounts: [1, 2] }));
    expect(p.externalCounts).toEqual({});
  });

  it('teacher.subjects 欠落は空配列補完され、name 無し要素は drop される', () => {
    const p = migrateProject(v4base({ teachers: [{ name: 'A' }, { subjects: ['数学'] }] }));
    expect(p.teachers).toEqual([
      { name: 'A', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [] },
    ]);
  });

  it('combinedGroups の dates キー欠落は null に正規化される', () => {
    const p = migrateProject(v4base({
      combinedGroups: [{ id: 1, subject: '英語', classes: ['A', 'B'] }],
    }));
    expect(p.combinedGroups[0].dates).toBeNull();
  });

  it('classSubjectCounts: 非オブジェクトはフィールドごと削除される (§N)', () => {
    const tab = baseTab();
    tab.config.classSubjectCounts = 'x';
    const p = migrateProject(v4base({ tabs: [tab] }));
    expect('classSubjectCounts' in p.tabs[0].config).toBe(false);
  });

  it('classSubjectCounts: 存在しないクラス id・数値でない値は drop、小数は丸める (§N)', () => {
    const tab = baseTab(); // classes = [{ id: 1 }]
    tab.config.classSubjectCounts = {
      '1': { '英語': 2.4, '数学': 'x', '国語': -1 },
      '9': { '英語': 5 },      // 存在しないクラス id
      '2': 'broken',           // 非オブジェクト
    };
    const p = migrateProject(v4base({ tabs: [tab] }));
    expect(p.tabs[0].config.classSubjectCounts).toEqual({ '1': { '英語': 2 } });
  });

  it('classSubjectCounts: 正常なデータは同一参照のまま (no-op)', () => {
    const tab = baseTab();
    tab.config.classSubjectCounts = { '1': { '英語': 2 } };
    const p = migrateProject(v4base({ tabs: [tab] }));
    expect(p.tabs[0].config.classSubjectCounts).toEqual({ '1': { '英語': 2 } });
  });

  it('snapshots: {} を含む v3 データでも migrateProjectV3toV4 が throw しない', () => {
    const v3 = {
      version: 3,
      activeTabId: 1,
      tabs: [{
        id: 1,
        name: 'メイン',
        config: {
          dates: [{ id: 1, label: '7/1' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: 'A' }],
          subjectCounts: { '英語': 1 },
        },
        schedule: {},
      }],
      teachers: [],
      snapshots: {},
    };
    const p = migrateProject(v3);
    expect(p.version).toBe(4);
    expect(p.snapshots).toEqual([]);
  });

  it('version 2 で config.dates が欠落したタブでも throw せず起動できる (F5e)', () => {
    const v2 = {
      version: 2,
      activeTabId: 1,
      tabs: [{
        id: 1,
        name: 'メイン',
        config: { classes: ['A'], subjectCounts: { '英語': 1 } },
        schedule: { 'd0-p0-c0': { subject: '英語', teacher: 'T' } },
      }],
      teachers: [],
    };
    const p = migrateProject(v2);
    expect(p.version).toBe(4);
    // 復元不能な schedule は drop されるが、クラスは v3 形に wrap される
    expect(p.tabs[0].config.classes).toEqual([{ id: 1, label: 'A' }]);
  });

  it('範囲外の生成パラメータは clamp される (F5d)、範囲内・未設定は不変', () => {
    const p = migrateProject(v4base({ maxDailyHours: 0, maxIterations: 99999999, numPatterns: 4 }));
    expect(p.maxDailyHours).toBe(1);
    expect(p.maxIterations).toBe(5000000);
    expect(p.numPatterns).toBe(4);
    const q = migrateProject(v4base());
    expect(q.maxDailyHours).toBeUndefined();
  });

  it('tab.dayStatuses: 非オブジェクトはフィールドごと削除、未知の値のエントリは drop される', () => {
    // 文字列 (truthy な非オブジェクト) → フィールドごと削除
    const broken = migrateProject(v4base({
      tabs: [{ ...baseTab(), dayStatuses: 'ok' }],
    }));
    expect(broken.tabs[0].dayStatuses).toBeUndefined();
    // 値レベル: 'ok' | 'check' 以外は drop、正常エントリは残る
    const mixed = migrateProject(v4base({
      tabs: [{ ...baseTab(), dayStatuses: { 1: 'ok', 2: 'bogus', 3: 'check' } }],
    }));
    expect(mixed.tabs[0].dayStatuses).toEqual({ 1: 'ok', 3: 'check' });
    // 正常な dayStatuses・未設定のタブは不変
    const clean = migrateProject(v4base({
      tabs: [{ ...baseTab(), dayStatuses: { 1: 'check' } }],
    }));
    expect(clean.tabs[0].dayStatuses).toEqual({ 1: 'check' });
    expect(migrateProject(v4base()).tabs[0].dayStatuses).toBeUndefined();
  });
});

describe('migrateProjectV3toV4 — 空タブの subset 保存 (F5v)', () => {
  it('日程・時限が空 (0 件) のタブは activeDateIds/activePeriodIds = [] を保存する', () => {
    const v3 = {
      version: 3,
      activeTabId: 1,
      teachers: [],
      tabs: [
        {
          id: 1,
          name: '中３',
          config: {
            dates: [{ id: 1, label: '7/1' }, { id: 2, label: '7/2' }],
            periods: [{ id: 1, label: '1限' }],
            classes: [{ id: 1, label: 'A' }],
            subjectCounts: { '英語': 1 },
          },
          schedule: {},
        },
        {
          // 未設定のタブ: v3 では 0 日・0 時限 = 何も表示しない
          id: 2,
          name: '中１・２',
          config: { dates: [], periods: [], classes: [{ id: 1, label: 'B' }], subjectCounts: {} },
          schedule: {},
        },
      ],
    };
    const p = migrateProject(v3);
    // 旧実装は `length > 0` 条件で空配列を保存せず、0 日タブが
    // 「絞り込みなし = union 全日」に化けて全学年の日付を表示していた
    expect(p.tabs[1].config.activeDateIds).toEqual([]);
    expect(p.tabs[1].config.activePeriodIds).toEqual([]);
    // プール全体と一致するタブは従来どおり undefined (= 全日・全時限)
    expect(p.tabs[0].config.activeDateIds).toBeUndefined();
    expect(p.tabs[0].config.activePeriodIds).toBeUndefined();
  });
});
