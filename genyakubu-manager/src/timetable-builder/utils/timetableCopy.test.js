import { describe, expect, it } from 'vitest';
import {
  buildDefaultMappings,
  carryTimetable,
  countCarriedCells,
  defaultLabelMapping,
  defaultSourceTabIndex,
  normalizeCarriedTimetable,
  planTimetableCopy,
  sourceTeacherCounts, sequentialDateMapping, subjectCountDiffsAfterCopy, weekdayMismatches } from './timetableCopy';
import { makeKey, migrateProject } from './scheduleKey';
import { buildFreshSeasonProject } from './seasonStart';

const P = (id, label) => ({ id, label });
const T = (name) => ({ name, subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] });

// 2025 冬期: 中３ は 12/25・26・28・1/5、3 クラス
function lastWinter() {
  return {
    version: 4,
    name: '2025 冬期講習',
    createdAt: '2025-10-01T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
    activeTabId: 1,
    teachers: [T('堀上'), T('福江'), T('高松')],
    dates: [P(1, '12/25(木)'), P(2, '12/26(金)'), P(3, '12/28(日)'), P(4, '1/5(月)'), P(9, '7/29(火)')],
    periods: [P(1, '1限 (13:00~14:00)'), P(2, '2限 (14:10~15:10)'), P(3, '夜1 (18:30~19:15)')],
    tabs: [
      {
        id: 1, name: '中３',
        config: { classes: [P(1, '3S401'), P(2, '3A403'), P(3, '3B')], subjectCounts: { 英語: 4 }, activeDateIds: [1, 2, 3, 4], activePeriodIds: [1, 2] },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '福江' },
          [makeKey(2, 2, 3)]: { subject: '英語', teacher: '高松', locked: true },
          [makeKey(4, 1, 1)]: { subject: '国語', teacher: '' },
          // タブが使わない時限 (夜1) と日 (7/29) のセルは控えに入れない
          [makeKey(1, 3, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(9, 1, 1)]: { subject: '英語', teacher: '堀上' },
        },
      },
      {
        id: 2, name: '中1・中2',
        config: { classes: [P(1, '1S')], subjectCounts: { 英語: 4 }, activeDateIds: [1], activePeriodIds: [3] },
        schedule: { [makeKey(1, 3, 1)]: { subject: '英語', teacher: '未定' } },
      },
    ],
    subjects: ['英語', '数学', '国語'],
    subjectColors: {},
    combinedGroups: [],
    externalCounts: {},
    externalSessions: [],
    externalSessionPresets: [],
    snapshots: [],
  };
}

// 2026 冬期: 日付が違う。クラス名から教室番号を外した
function thisWinter() {
  return migrateProject({
    ...lastWinter(),
    name: '2026 冬期講習',
    teachers: [T('堀上'), T('福江'), T('未定')],
    dates: [P(1, '12/25(金)'), P(2, '12/26(土)'), P(3, '12/28(月)'), P(4, '1/4(月)')],
    tabs: [
      {
        id: 1, name: '中３',
        config: { classes: [P(1, '3S'), P(2, '3A'), P(3, '3B'), P(4, '3C')], subjectCounts: { 英語: 4 }, activePeriodIds: [1, 2] },
        schedule: { [makeKey(1, 1, 2)]: { subject: '理科', teacher: '' }, [makeKey(2, 2, 3)]: { subject: '', teacher: '', locked: true } },
      },
      {
        id: 2, name: '中1・2',
        config: { classes: [P(1, '1S')], subjectCounts: { 英語: 4 }, activeDateIds: [1], activePeriodIds: [3] },
        schedule: {},
      },
    ],
  });
}

describe('carryTimetable', () => {
  it('タブの使う日・時限の範囲だけを、日付順の添字で控える', () => {
    const carried = carryTimetable(lastWinter(), { now: new Date('2026-10-27T00:00:00Z') });
    expect(carried.name).toBe('2025 冬期講習');
    expect(carried.savedAt).toBe('2026-10-27T00:00:00.000Z');
    expect(carried.tabs[0]).toMatchObject({
      name: '中３',
      dates: ['12/25(木)', '12/26(金)', '12/28(日)', '1/5(月)'],
      periods: ['1限 (13:00~14:00)', '2限 (14:10~15:10)'],
      classes: ['3S401', '3A403', '3B'],
    });
    expect(carried.tabs[0].cells).toEqual([
      { d: 0, p: 0, c: 0, subject: '英語', teacher: '堀上' },
      { d: 0, p: 0, c: 1, subject: '数学', teacher: '福江' },
      { d: 1, p: 1, c: 2, subject: '英語', teacher: '高松' },
      { d: 3, p: 0, c: 0, subject: '国語' },
    ]);
    expect(countCarriedCells(carried)).toBe(5);
  });

  it('normalizeCarriedTimetable は範囲外の添字・空のセルを落とし、形にならなければ null', () => {
    const carried = carryTimetable(lastWinter());
    const broken = JSON.parse(JSON.stringify(carried));
    broken.tabs[0].cells.push({ d: 99, p: 0, c: 0, subject: '英語' }, { d: 0, p: 0, c: 0 }, 'x');
    broken.tabs.push({ name: 'こわれた', dates: 'x' });
    const fixed = normalizeCarriedTimetable(broken);
    expect(fixed.tabs).toHaveLength(2);
    expect(fixed.tabs[0].cells).toEqual(carried.tabs[0].cells);
    expect(normalizeCarriedTimetable(null)).toBeNull();
    expect(normalizeCarriedTimetable({ tabs: [] })).toBeNull();
  });

  it('migrateProject はクラスの教室の空白を整え、文字列でない・空の教室を落とす', () => {
    const base = lastWinter();
    base.tabs[0].config.classes = [P(1, '3S401'), { ...P(2, '3A'), room: ' 403 ' }, { ...P(3, '3B'), room: 5 }, { ...P(4, '3C'), room: '  ' }];
    const p = migrateProject(base);
    const classes = p.tabs[0].config.classes;
    expect(classes[1].room).toBe('403');
    expect('room' in classes[2]).toBe(false);
    expect('room' in classes[3]).toBe(false);
  });

  it('migrateProject は形の崩れた控えを落とす', () => {
    const p = migrateProject({ ...lastWinter(), previousTimetable: { tabs: 'x' } });
    expect(p.previousTimetable).toBeUndefined();
    const ok = migrateProject({ ...lastWinter(), previousTimetable: carryTimetable(lastWinter()) });
    expect(ok.previousTimetable.tabs[0].cells).toHaveLength(4);
  });
});

describe('対応の既定', () => {
  const source = carryTimetable(lastWinter());

  it('タブは名前 (全角半角・中黒の違いは無視) → 同じ並び', () => {
    expect(defaultSourceTabIndex('中３', 0, source, 2)).toBe(0);
    expect(defaultSourceTabIndex('中1・2', 1, source, 2)).toBe(1); // 名前は違うが並びが同じ
    expect(defaultSourceTabIndex('高1', 2, source, 3)).toBeNull();
  });

  it('時限は同じラベル → 短い名前 → N 番目。クラスは同じラベル → 前方一致', () => {
    expect(defaultLabelMapping(['1限 (13:00~14:00)', '2限 (14:10~15:10)'], [P(5, '1限 (13:00~13:50)'), P(6, '2限 (14:10~15:10)')], { kind: 'period' }))
      .toEqual([5, 6]);
    expect(defaultLabelMapping(['朝', '昼'], [P(1, 'A'), P(2, 'B')], { kind: 'period' })).toEqual([1, 2]);
    expect(defaultLabelMapping(['3S401', '3A403', '3B', 'SS'], [P(1, '3S'), P(2, '3A'), P(3, '3B'), P(4, '3C')], { kind: 'class' }))
      .toEqual([1, 2, 3, null]);
  });

  it('buildDefaultMappings は日付を N 日目 → N 日目に当てる', () => {
    const m = buildDefaultMappings(source, thisWinter());
    expect(m[0]).toMatchObject({ targetTabId: 1, sourceTabIndex: 0, dates: [1, 2, 3, 4], periods: [1, 2], classes: [1, 2, 3] });
    expect(m[1]).toMatchObject({ targetTabId: 2, sourceTabIndex: 1, dates: [1], periods: [3], classes: [1] });
  });
});

describe('planTimetableCopy', () => {
  const source = carryTimetable(lastWinter());

  it('空いているセルに写し、入れない講師・講師マスタにいない人は講師を空にする', () => {
    const project = thisWinter();
    const plan = planTimetableCopy({
      source,
      project,
      mappings: buildDefaultMappings(source, project),
      includeTeachers: new Set(['堀上']),
    });
    expect(plan.writes).toEqual([
      { tabId: 1, key: makeKey(1, 1, 1), subject: '英語', teacher: '堀上' },
      // 3A には理科が入っているので写さない
      { tabId: 1, key: makeKey(4, 1, 1), subject: '国語', teacher: '' },
      { tabId: 2, key: makeKey(1, 3, 1), subject: '英語', teacher: '未定' },
    ]);
    expect(plan.skippedFilled).toBe(1);
    // 3B 12/26 2限 はロック
    expect(plan.skippedLocked).toBe(1);
    expect(plan.teacherBlanked).toBe(0);
  });

  it('上書きを選べば入っているセルにも写す。外した講師は空にして数える', () => {
    const project = thisWinter();
    const plan = planTimetableCopy({
      source,
      project,
      mappings: buildDefaultMappings(source, project),
      includeTeachers: new Set(['堀上']),
      overwrite: true,
    });
    expect(plan.writes).toContainEqual({ tabId: 1, key: makeKey(1, 1, 2), subject: '数学', teacher: '' });
    expect(plan.teacherBlanked).toBe(1);
    expect(plan.skippedLocked).toBe(1);
  });

  it('対応を外した日・クラスの分は写さずに数える。科目マスタに無い科目を知らせる', () => {
    const project = { ...thisWinter(), subjects: ['英語'] };
    const mappings = buildDefaultMappings(source, project);
    mappings[0] = { ...mappings[0], dates: [null, 2, 3, 4] };
    const plan = planTimetableCopy({ source, project, mappings, includeTeachers: new Set(['堀上', '福江']) });
    expect(plan.unmapped).toBe(2);
    expect(plan.unknownSubjects).toEqual(['国語']);
  });

  it('写す元の講師のコマ数', () => {
    expect(sourceTeacherCounts(source)).toEqual([
      { name: '堀上', cells: 1 },
      { name: '福江', cells: 1 },
      { name: '高松', cells: 1 },
    ]);
  });
});

describe('作り直しと控え', () => {
  it('作り直すと今の時間割を控えに残し、作り直した直後にもう一度作り直しても控えは消えない', () => {
    const once = buildFreshSeasonProject(lastWinter(), { name: '2026 冬期講習', carryTimetable: true });
    expect(countCarriedCells(once.previousTimetable)).toBe(5);
    const twice = buildFreshSeasonProject(once, { name: '2026 冬期講習 (2)', carryTimetable: true });
    expect(twice.previousTimetable).toEqual(once.previousTimetable);
  });

  it('ほかの季節から写すとき (carryTimetable なし) は控えを持ち越さない', () => {
    const once = buildFreshSeasonProject(lastWinter(), { name: '2026 冬期講習', carryTimetable: true });
    const spring = buildFreshSeasonProject(once, { name: '2027 春期講習' });
    expect(spring.previousTimetable).toBeUndefined();
  });
});

describe('日数の違う講習を写す (2026-10-27)', () => {
  const D = (id, label) => ({ id, label });
  it('sequentialDateMapping: 外した日を飛ばして先頭から詰める (去年 4 日 → 今年 3 日)', () => {
    const targets = [D(10, '1/12(火)'), D(11, '1/14(木)'), D(12, '1/19(火)')];
    expect(sequentialDateMapping(4, targets, [])).toEqual([10, 11, 12, null]);
    expect(sequentialDateMapping(4, targets, [1])).toEqual([10, null, 11, 12]);
    expect(sequentialDateMapping(4, targets, [3])).toEqual([10, 11, 12, null]);
  });

  it('weekdayMismatches: 曜日の違う対応', () => {
    const targets = [D(10, '1/12(火)'), D(11, '1/14(木)')];
    expect(weekdayMismatches(['1/13(火)', '1/20(火)'], [10, 11], targets)).toEqual([{ index: 1, from: '1/20(火)', to: '1/14(木)' }]);
    expect(weekdayMismatches(['1/13', '1/20(火)'], [10, null], targets)).toEqual([]);
  });

  it('subjectCountDiffsAfterCopy: 写したあとのクラス別の科目のコマ数とコマ数の設定 (クラス別の上書きも) の差', () => {
    const project = {
      dates: [D(1, '1/12(火)'), D(2, '1/14(木)')],
      periods: [D(1, '1限'), D(2, '2限')],
      subjects: ['英語', '数学', '理科'],
      tabs: [{
        id: 1,
        name: '中３直前 火木',
        config: {
          classes: [D(1, '3SS'), D(2, '3S')],
          subjectCounts: { 英語: 1, 数学: 2, 理科: 1 },
          classSubjectCounts: { 2: { 数学: 1 } },
        },
        schedule: { 'd1-p1-c2': { subject: '英語' } },
      }],
    };
    const writes = [
      { tabId: 1, key: 'd1-p1-c1', subject: '数学', teacher: '' },
      { tabId: 1, key: 'd1-p2-c1', subject: '英語', teacher: '' },
      { tabId: 1, key: 'd2-p1-c1', subject: '英語', teacher: '' },
      { tabId: 1, key: 'd1-p2-c2', subject: '数学', teacher: '' },
      { tabId: 1, key: 'd2-p1-c2', subject: '理科', teacher: '' },
    ];
    expect(subjectCountDiffsAfterCopy(project, writes, [1])).toEqual([
      {
        tabId: 1,
        tabName: '中３直前 火木',
        className: '3SS',
        items: [
          { subject: '英語', count: 2, quota: 1, diff: 1 },
          { subject: '数学', count: 1, quota: 2, diff: -1 },
          { subject: '理科', count: 0, quota: 1, diff: -1 },
        ],
      },
    ]);
    expect(subjectCountDiffsAfterCopy(project, writes, [])).toEqual([]);
  });
});
