import { describe, expect, it, vi } from 'vitest';
import {
  makeKey,
  parseKey,
  resolveKey,
  makeNgKey,
  makeExternalKey,
  findCombinedGroup,
  isPrimaryCombinedClass,
  countTeacherHoursWithCombined,
  isLegacyKey,
  migrateScheduleKeys,
  migrateProject,
} from './scheduleKey';

describe('makeKey / parseKey', () => {
  it('makeKey はインデックスから "dN-pN-cN" を生成する', () => {
    expect(makeKey(0, 0, 0)).toBe('d0-p0-c0');
    expect(makeKey(3, 2, 1)).toBe('d3-p2-c1');
    expect(makeKey(12, 4, 7)).toBe('d12-p4-c7');
  });

  it('parseKey は新形式キーをパースする', () => {
    expect(parseKey('d0-p0-c0')).toEqual({ dIdx: 0, pIdx: 0, cIdx: 0 });
    expect(parseKey('d12-p4-c7')).toEqual({ dIdx: 12, pIdx: 4, cIdx: 7 });
  });

  it('parseKey は不正な形式に null を返す', () => {
    expect(parseKey('12/25(木)-1限-３S')).toBeNull();
    expect(parseKey('d0-p0')).toBeNull();
    expect(parseKey('')).toBeNull();
    expect(parseKey('foo')).toBeNull();
  });

  it('makeKey と parseKey は round-trip する', () => {
    for (const [d, p, c] of [[0, 0, 0], [5, 3, 2], [99, 7, 11]]) {
      expect(parseKey(makeKey(d, p, c))).toEqual({ dIdx: d, pIdx: p, cIdx: c });
    }
  });
});

describe('resolveKey', () => {
  const config = {
    dates: ['12/25(木)', '12/26(金)'],
    periods: ['1限 (13:00~)', '2限 (14:10~)'],
    classes: ['３S', '３A'],
  };

  it('インデックスキーから実際の値を解決する', () => {
    expect(resolveKey('d0-p1-c0', config)).toEqual({
      date: '12/25(木)',
      period: '2限 (14:10~)',
      class: '３S',
    });
  });

  it('不正なキーには null を返す', () => {
    expect(resolveKey('invalid', config)).toBeNull();
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
    // group が falsy なら短絡で falsy 値を返す (null/undefined/false いずれでも問題ない仕様)
    expect(isPrimaryCombinedClass(null, '３S')).toBeFalsy();
    expect(isPrimaryCombinedClass(undefined, '３S')).toBeFalsy();
  });
});

describe('countTeacherHoursWithCombined', () => {
  const config = {
    dates: ['12/25(木)', '12/26(金)'],
    periods: ['1限', '2限'],
    classes: ['３S', '３A', '３B'],
  };

  it('通常のコマは講師ごとにカウント', () => {
    const schedule = {
      'd0-p0-c0': { subject: '英語', teacher: '堀上' },
      'd0-p0-c1': { subject: '英語', teacher: '田中' },
      'd0-p1-c0': { subject: '数学', teacher: '堀上' },
    };
    const totals = countTeacherHoursWithCombined(schedule, config, []);
    expect(totals).toEqual({ '堀上': 2, '田中': 1 });
  });

  it('合同グループは同じ時間枠で重複カウントしない', () => {
    const groups = [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }];
    const schedule = {
      'd0-p0-c0': { subject: '英語', teacher: '堀上' },
      'd0-p0-c1': { subject: '英語', teacher: '堀上' },
    };
    const totals = countTeacherHoursWithCombined(schedule, config, groups);
    expect(totals).toEqual({ '堀上': 1 });
  });

  it('「未定」は無視する', () => {
    const schedule = { 'd0-p0-c0': { subject: '英語', teacher: '未定' } };
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

describe('migrateScheduleKeys', () => {
  const config = {
    dates: ['12/25(木)', '12/26(金)'],
    periods: ['1限 (13:00~)', '2限 (14:10~)'],
    classes: ['３S', '３A'],
  };

  it('旧形式キーを新形式へ変換', () => {
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
    expect(migrated).toEqual({
      'd0-p0-c0': { subject: '英語', teacher: '堀上' },
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('新旧混在キーも適切に処理', () => {
    const mixed = {
      'd0-p0-c0': { subject: '英語', teacher: '堀上' },
      '12/26(金)-1限 (13:00~)-３A': { subject: '数学', teacher: '田中' },
    };
    const migrated = migrateScheduleKeys(mixed, config);
    expect(migrated).toEqual({
      'd0-p0-c0': { subject: '英語', teacher: '堀上' },
      'd1-p0-c1': { subject: '数学', teacher: '田中' },
    });
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

  it('version 未設定なら 2 を立て、createdAt/updatedAt/name を補完', () => {
    const result = migrateProject(makeLegacyProject());
    expect(result.version).toBe(2);
    expect(result.name).toBe('');
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('旧スケジュールキーを新形式へマイグレーション', () => {
    const result = migrateProject(makeLegacyProject());
    expect(result.tabs[0].schedule).toEqual({
      'd0-p0-c0': { subject: '英語', teacher: '堀上' },
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

  it('version 2 以上ならスケジュール再マイグレーションを行わない', () => {
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
    expect(result.tabs[0].schedule).toEqual({ 'd0-p0-c0': { subject: '英', teacher: 'T' } });
    expect(result.version).toBe(2);
  });
});
