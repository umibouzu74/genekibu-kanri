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
  findEntityById,
  nextId,
  activeDatesForTab,
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
    p.teachers = [
      { name: '堀上', subjects: ['英語'] },
      { name: '田中', subjects: ['数学'] },
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
