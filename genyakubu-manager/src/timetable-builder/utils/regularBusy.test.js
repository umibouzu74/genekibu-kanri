// 通常授業との講師の重なり (utils/regularBusy → autoNg)。
// 形は 2026 冬期講習の枠「直前ポイント演習」(1/9〜、3学期の通常授業と並走) を写した
// 合成のデータ: 講習の 1限 18:00〜19:00 / 2限 19:10〜20:10 / 3限 20:20〜21:20。
import { describe, expect, it } from 'vitest';
import { buildRegularBusy, regularBusyInputKey } from './regularBusy';
import {
  EMPTY_REGULAR_BUSY,
  autoNgSourceLabel,
  computeAutoNgByTeacher,
  describeRegularBusy,
} from './autoNg';
import { computeNgViolationList } from './ngViolations';
import { timeRangesOverlapOrTouch } from './timeRange';
import { makeKey, makeNgKey } from './scheduleKey';
import { computeTabViolationCounts, computeGlobalUsage } from './analysisHelpers';
import { newProblemsAfterWrites } from './cellTsv';
import { buildPlanningHints } from './planningHints';

const P1 = '1限 (18:00~19:00)';
const P2 = '2限 (19:10~20:10)';
const P3 = '3限 (20:20~21:20)';

const T = (name, subjects = ['数学']) => ({ name, subjects, ngSlots: [], ngClasses: [], priorityClasses: [] });

// 2027-01-13 は水曜、1/15 は金曜、1/12 は火曜。12/25 は 2026 年の金曜 (冬期講習本体)
function makeProject({ schedule = {}, teachers, dates, activeDateIds } = {}) {
  return {
    version: 4,
    name: '2026 冬期講習',
    updatedAt: '2026-11-13T00:00:00.000Z',
    teachers: teachers || [T('片岡'), T('滝澤', ['理科']), T('松川', ['国語']), T('石原', ['英語']), T('河野', ['英語']), T('福江'), T('小松', ['国語']), T('未定')],
    activeTabId: 1,
    dates: dates || [
      { id: 1, label: '12/25(金)' },
      { id: 2, label: '1/12(火)' },
      { id: 3, label: '1/13(水)' },
      { id: 4, label: '1/15(金)' },
      { id: 5, label: '1/19(火)' },
      { id: 6, label: '1/20(水)' },
    ],
    periods: [{ id: 1, label: P1 }, { id: 2, label: P2 }, { id: 3, label: P3 }],
    tabs: [
      {
        id: 1,
        name: '中3 直前ポイント演習',
        config: {
          classes: [{ id: 1, label: '3S' }],
          subjectCounts: { 数学: 2 },
          ...(activeDateIds ? { activeDateIds } : {}),
        },
        schedule,
      },
    ],
    subjects: ['数学', '理科', '国語', '英語'],
    combinedGroups: [],
    externalCounts: {},
    externalSessions: [],
  };
}

const slot = (id, o = {}) => ({
  id,
  timetableId: 4,
  day: '水',
  time: '19:55-20:55',
  grade: '附中1',
  cls: '-',
  room: '601',
  subj: '数学',
  teacher: '片岡',
  note: '',
  ...o,
});

const TIMETABLES = [
  { id: 3, name: '2学期', type: 'regular', startDate: '2026-09-01', endDate: '2026-12-22', grades: [] },
  // 3学期は中3 が対象外 (中3 は講習だけ)
  { id: 4, name: '3学期', type: 'regular', startDate: '2027-01-08', endDate: null, grades: ['中1', '中2', '附中1', '高1'] },
];

const SLOTS = [
  slot(1), // 片岡 水 19:55-20:55 附中1 数学 → 2限・3限
  slot(2, { day: '金', time: '18:55-19:40', grade: '中1', cls: 'S/AB', subj: '理科', teacher: '滝澤' }), // 1限・2限
  slot(3, { time: '18:45-19:45', subj: '国語', teacher: '松川' }),
  // 3学期の時間割の対象学年に無い学年のコマ (どの画面にも出ない)
  slot(4, { grade: '中3', cls: 'A', time: '18:00-19:00', subj: '国語', teacher: '小松' }),
  // 2学期のコマ (12/22 で終わり)
  slot(5, { timetableId: 3, day: '金', time: '18:00-19:00', teacher: '片岡' }),
];

const host = (o = {}) => ({ regularSlots: SLOTS, regularTimetables: TIMETABLES, ...o });
const ngKeys = (project, busy, name) =>
  [...(computeAutoNgByTeacher(project.teachers, [], project.periods, busy).get(name)?.keys() || [])].sort();

describe('timeRangesOverlapOrTouch', () => {
  const r = (s, e) => ({ startMin: s, endMin: e });
  it('重なる・端が接するは true、間が空けば false', () => {
    expect(timeRangesOverlapOrTouch(r(1080, 1140), r(1135, 1180))).toBe(true); // 5 分の重なり
    expect(timeRangesOverlapOrTouch(r(1080, 1140), r(1140, 1185))).toBe(true); // 19:00 終了と 19:00 開始
    expect(timeRangesOverlapOrTouch(r(1080, 1140), r(1141, 1185))).toBe(false);
    expect(timeRangesOverlapOrTouch(r(1140, 1185), r(1080, 1140))).toBe(true);
  });
  it('終了の分からない側は点として見る', () => {
    expect(timeRangesOverlapOrTouch(r(1100, null), r(1080, 1140))).toBe(true);
    expect(timeRangesOverlapOrTouch(r(1140, null), r(1080, 1140))).toBe(true);
    expect(timeRangesOverlapOrTouch(r(1150, null), r(1080, 1140))).toBe(false);
    expect(timeRangesOverlapOrTouch(null, r(1080, 1140))).toBe(false);
  });
});

describe('buildRegularBusy', () => {
  it('その日に通常授業を教える講師 × 時刻を、講習の日付ラベルごとに出す', () => {
    const project = makeProject();
    const busy = buildRegularBusy(project, host());
    expect(busy['片岡']).toEqual({
      '1/13(水)': [{ time: '19:55-20:55', label: '附中1 数学' }],
      '1/20(水)': [{ time: '19:55-20:55', label: '附中1 数学' }],
    });
    expect(busy['滝澤']).toEqual({ '1/15(金)': [{ time: '18:55-19:40', label: '中1S/AB 理科' }] });
    // 片岡 水2・3限、滝澤 金1・2限、松川 水1・2限
    expect(ngKeys(project, busy, '片岡')).toEqual(
      [makeNgKey('1/13(水)', P2), makeNgKey('1/13(水)', P3), makeNgKey('1/20(水)', P2), makeNgKey('1/20(水)', P3)].sort(),
    );
    expect(ngKeys(project, busy, '滝澤')).toEqual([makeNgKey('1/15(金)', P1), makeNgKey('1/15(金)', P2)].sort());
    expect(ngKeys(project, busy, '松川')).toContain(makeNgKey('1/13(水)', P1));
    expect(ngKeys(project, busy, '松川')).not.toContain(makeNgKey('1/13(水)', P3));
  });

  it('時間割の期間の外 (冬期講習本体の 12/25)・対象学年に無い学年 (中3) のコマは NG にならない', () => {
    const project = makeProject();
    const busy = buildRegularBusy(project, host());
    // 12/25 (金): 2学期は 12/22 まで、3学期は 1/8 から
    expect(Object.keys(busy['片岡'])).not.toContain('12/25(金)');
    expect(busy['滝澤']['12/25(金)']).toBeUndefined();
    // 中3 のコマは 3学期の時間割の対象学年に無い
    expect(busy['小松']).toBeUndefined();
  });

  it('休講日・テスト期間の日は NG にならない (休講日の例外のコマは NG)', () => {
    const project = makeProject();
    const holiday = { id: 1, date: '2027-01-13', label: '休講', scope: ['全部'], targetGrades: [], subjKeywords: [] };
    const off = buildRegularBusy(project, host({ holidays: [holiday] }));
    expect(off['片岡']['1/13(水)']).toBeUndefined();
    expect(off['片岡']['1/20(水)']).toHaveLength(1);
    expect(off['松川']['1/13(水)']).toBeUndefined();
    // この日はこのコマだけ授業あり
    const exc = buildRegularBusy(project, host({ holidays: [{ ...holiday, excludeSlotIds: [1] }] }));
    expect(exc['片岡']['1/13(水)']).toHaveLength(1);
    expect(exc['松川']['1/13(水)']).toBeUndefined();

    const exam = { id: 1, name: '学年末', startDate: '2027-01-18', endDate: '2027-01-22', targetGrades: ['附中1'] };
    const inExam = buildRegularBusy(project, host({ examPeriods: [exam] }));
    expect(inExam['片岡']).toEqual({ '1/13(水)': [{ time: '19:55-20:55', label: '附中1 数学' }] });
    // 授業を止めないテスト期間 (高校の学校別) は NG のまま
    const shown = buildRegularBusy(project, host({ examPeriods: [{ ...exam, stopsClasses: false }] }));
    expect(shown['片岡']['1/20(水)']).toHaveLength(1);
  });

  it('隔週のコマは、その週に実際に入る講師だけが NG になる', () => {
    const project = makeProject();
    const slots = [slot(10, { day: '火', time: '19:40-20:40', grade: '高1', cls: '-', subj: '高松一 英語', teacher: '石原', note: '隔週（河野）' })];
    // 1/12 (火) が A 週 → 1/19 は B 週 = 相手 (河野)
    const busy = buildRegularBusy(project, host({ regularSlots: slots, biweeklyAnchors: [{ date: '2027-01-12' }] }));
    expect(Object.keys(busy['石原'])).toEqual(['1/12(火)']);
    expect(Object.keys(busy['河野'])).toEqual(['1/19(火)']);
    expect(ngKeys(project, busy, '石原')).toEqual([makeNgKey('1/12(火)', P2), makeNgKey('1/12(火)', P3)].sort());
  });

  it('担当の切り替え (teacherChanges) は、その日の担当が NG になる', () => {
    const project = makeProject();
    const slots = [slot(1, { teacherChanges: [{ from: '2027-01-20', teacher: '福江' }] })];
    const busy = buildRegularBusy(project, host({ regularSlots: slots }));
    expect(Object.keys(busy['片岡'])).toEqual(['1/13(水)']);
    expect(Object.keys(busy['福江'])).toEqual(['1/20(水)']);
  });

  it('代行は代行者が NG になり、休む人は外れる。代行未定の欠勤は誰も NG にしない', () => {
    const project = makeProject();
    const subs = [
      { id: 1, date: '2027-01-13', slotId: 1, originalTeacher: '片岡', substitute: '福江', status: 'confirmed', memo: '' },
      { id: 2, date: '2027-01-20', slotId: 1, originalTeacher: '片岡', substitute: '', status: 'requested', memo: '' },
    ];
    const busy = buildRegularBusy(project, host({ substitutes: subs }));
    expect(busy['片岡']).toBeUndefined();
    expect(busy['福江']).toEqual({ '1/13(水)': [{ time: '19:55-20:55', label: '附中1 数学', sub: true }] });
    expect(describeRegularBusy(busy['福江']['1/13(水)'][0])).toBe('通常授業 附中1 数学 19:55-20:55 (代行)');
  });

  it('振替は振替先の日・振替先の時刻で NG になる。コマ休講は NG にならない', () => {
    const project = makeProject();
    const adjustments = [
      { id: 1, type: 'reschedule', date: '2027-01-13', slotId: 1, targetDate: '2027-01-15', targetTime: '17:00-18:00' },
      { id: 2, type: 'cancel', date: '2027-01-20', slotId: 1, memo: '' },
    ];
    const busy = buildRegularBusy(project, host({ adjustments }));
    expect(busy['片岡']).toEqual({ '1/15(金)': [{ time: '17:00-18:00', label: '附中1 数学' }] });
    // 17:00-18:00 は 1限 (18:00〜) に接する → NG (教室の移動の余裕が無い)
    expect(ngKeys(project, busy, '片岡')).toEqual([makeNgKey('1/15(金)', P1)]);
  });

  it('特別時程の時刻の読み替えを反映する', () => {
    const project = makeProject();
    const daySchedules = [
      { id: 1, date: '2027-01-13', label: '50分授業', targetGrades: ['附中1'], timeMap: [{ from: '19:55-20:55', to: '17:00-17:50' }], cancelTimes: [] },
    ];
    const busy = buildRegularBusy(project, host({ regularSlots: [slot(1)], daySchedules }));
    expect(busy['片岡']['1/13(水)']).toEqual([{ time: '17:00-17:50', label: '附中1 数学' }]);
    expect(ngKeys(project, busy, '片岡')).not.toContain(makeNgKey('1/13(水)', P2));
  });

  it('表示期間設定の終講日より後は NG にならない', () => {
    const project = makeProject();
    const displayCutoff = { groups: [{ label: '附中', grades: ['附中1'], startDate: null, date: '2027-01-15' }] };
    const busy = buildRegularBusy(project, host({ regularSlots: [slot(1)], displayCutoff }));
    expect(Object.keys(busy['片岡'])).toEqual(['1/13(水)']);
  });

  it('対象はどれかのタブが使う日だけ。講習の講師マスタに居ない名前・「未定」は入れない', () => {
    const project = makeProject({ activeDateIds: [1, 3] });
    const slots = [slot(1), slot(20, { teacher: '山田' }), slot(21, { teacher: '未定', time: '18:00-18:30' })];
    const busy = buildRegularBusy(project, host({ regularSlots: slots }));
    expect(busy).toEqual({ 片岡: { '1/13(水)': [{ time: '19:55-20:55', label: '附中1 数学' }] } });
  });

  it('時刻の読めないコマは NG を作らない', () => {
    const project = makeProject();
    const busy = buildRegularBusy(project, host({ regularSlots: [slot(1, { time: '3限' })] }));
    expect(busy).toBe(EMPTY_REGULAR_BUSY);
  });

  it('本体のデータが無ければ空 (同じ参照)。従来どおり動く', () => {
    const project = makeProject();
    expect(buildRegularBusy(project, {})).toBe(EMPTY_REGULAR_BUSY);
    expect(buildRegularBusy(project, null)).toBe(EMPTY_REGULAR_BUSY);
    expect(buildRegularBusy(null, host())).toBe(EMPTY_REGULAR_BUSY);
    // 通常授業の無い期間 (冬期講習本体だけ)
    expect(buildRegularBusy(makeProject({ activeDateIds: [1] }), host())).toBe(EMPTY_REGULAR_BUSY);
    const auto = computeAutoNgByTeacher(project.teachers, [], project.periods, EMPTY_REGULAR_BUSY);
    expect([...auto.values()].every(m => m.size === 0)).toBe(true);
    expect(computeAutoNgByTeacher(project.teachers, [], project.periods)).toEqual(auto);
  });

  it('memo の鍵はセルの中身で変わらず、使う日・講師・年の基準日で変わる', () => {
    const a = makeProject();
    const b = makeProject({ schedule: { [makeKey(3, 2, 1)]: { subject: '数学', teacher: '片岡' } } });
    expect(regularBusyInputKey(a)).toBe(regularBusyInputKey(b));
    expect(regularBusyInputKey(makeProject({ activeDateIds: [1, 3] }))).not.toBe(regularBusyInputKey(a));
    expect(regularBusyInputKey(makeProject({ teachers: [T('片岡')] }))).not.toBe(regularBusyInputKey(a));
  });
});

describe('通常授業との重なり → 自動NG を見る所', () => {
  const project = makeProject({
    schedule: {
      [makeKey(3, 2, 1)]: { subject: '数学', teacher: '片岡' }, // 1/13 2限 ↔ 附中1 数学
      [makeKey(3, 1, 1)]: { subject: '数学', teacher: '片岡' }, // 1/13 1限 は空いている
      [makeKey(1, 2, 1)]: { subject: '数学', teacher: '片岡' }, // 12/25 は通常授業なし
    },
  });
  const busy = buildRegularBusy(project, host());
  const auto = computeAutoNgByTeacher(project.teachers, [], project.periods, busy);

  it('由来の短い表示は「通常」。他学年・調査と重なれば並べる', () => {
    const entry = auto.get('片岡').get(makeNgKey('1/13(水)', P2));
    expect(autoNgSourceLabel(entry)).toBe('通常');
    expect(autoNgSourceLabel({ sessions: [{}], regular: entry.regular, availability: true })).toBe('他学年・通常・調査');
    // 他学年セッションと同じ時限に重なっても 1 entry
    const withSession = computeAutoNgByTeacher(
      project.teachers,
      [{ id: 1, date: '1/13(水)', teacherName: '片岡', startTime: '19:00', endTime: '20:00' }],
      project.periods,
      busy,
    ).get('片岡').get(makeNgKey('1/13(水)', P2));
    expect(withSession.sessions).toHaveLength(1);
    expect(withSession.regular).toHaveLength(1);
  });

  it('⚠ の一覧 (NG に当たっている割当) に理由つきで出る', () => {
    const list = computeNgViolationList(project, auto);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      key: makeKey(3, 2, 1),
      dateLabel: '1/13(水)',
      teacher: '片岡',
      reasons: ['通常授業 附中1 数学 19:55-20:55'],
    });
    // 渡さなければ従来どおり 0 件
    expect(computeNgViolationList(project, computeAutoNgByTeacher(project.teachers, [], project.periods))).toEqual([]);
  });

  it('タブの違反の数・セルの表の貼り付け確認にも効く', () => {
    const { globalUsage } = computeGlobalUsage(project.tabs, [], {}, [], project.dates, project.periods);
    const args = { tabs: project.tabs, globalUsage, teachers: project.teachers, dates: project.dates, periods: project.periods };
    const before = computeTabViolationCounts(args)[1];
    const after = computeTabViolationCounts({ ...args, regularBusy: busy })[1];
    expect(after).toBe(before + 1);

    const empty = makeProject();
    const writes = [{ tabId: 1, key: makeKey(3, 3, 1), subject: '数学', teacher: '片岡' }];
    expect(newProblemsAfterWrites(empty, writes)).toEqual([]);
    expect(newProblemsAfterWrites(empty, writes, busy).join('\n')).toMatch(/NG/);
  });

  it('自動作成へ渡す手がかりに載る (空のときは載せない)', () => {
    expect(buildPlanningHints(project, 1, null, {}, busy).regularBusy).toBe(busy);
    expect(buildPlanningHints(project, 1, null, {}, EMPTY_REGULAR_BUSY)).not.toHaveProperty('regularBusy');
    expect(buildPlanningHints(project, 1, null, {})).not.toHaveProperty('regularBusy');
    // Web Worker に送れる形 (素のオブジェクト)
    expect(structuredClone(busy)).toEqual(busy);
  });
});
