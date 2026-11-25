import { describe, expect, it } from 'vitest';
import { autoNgSourceLabel, computeAutoNgByTeacher } from './autoNg';
import { makeKey, makeNgKey } from './scheduleKey';
import { computeNgViolationList } from './ngViolations';
import {
  computeTravelCautionList,
  computeTravelCautions,
  computeTravelHits,
  describeTravelHit,
  hasReturnCaution,
  travelCautionLabels,
} from './travel';
import { DEFAULT_TRAVEL, normalizeTravelSettings, withMainKameiMinutes } from './places';
import { returnCautionTeachers } from './planningHints';

// 2026 冬期講習 中123 の受け入れ条件 (改善依頼 2026-11-25) を写した形。
// 中学の講習 (タブ) は本校、高校①〜③ は亀井町、予備校1〜4限は本校。
const P_HIRU2 = { id: 5, label: '昼2限 (14:15~15:15)' };
const P_HIRU3 = { id: 1, label: '昼3限 (15:20~16:20)' };
const P_YORU1 = { id: 2, label: '夜1限 (18:30~19:20)' };
const P_YORU2 = { id: 3, label: '夜2限 (19:25~20:15)' };
const P_YORU3 = { id: 4, label: '夜3限 (20:20~21:10)' };
const PERIODS = [P_HIRU2, P_HIRU3, P_YORU1, P_YORU2, P_YORU3];

const D1225 = { id: 1, label: '12/25(金)' };
const D0104 = { id: 2, label: '1/4(月)' };
const D0105 = { id: 3, label: '1/5(火)' };
const D0106 = { id: 4, label: '1/6(水)' };
const DATES = [D1225, D0104, D0105, D0106];

const teacher = (name) => ({ name, subjects: ['英語', '数学'], ngSlots: [], ngClasses: [], priorityClasses: [] });
const TEACHERS = ['石原', '半田', '片岡', '滝澤'].map(teacher);

let nextId = 1;
const session = (teacherName, date, memo, startTime, endTime, place) => ({
  id: nextId++,
  date,
  teacherName,
  label: '',
  memo,
  startTime,
  endTime,
  ...(place ? { place } : {}),
  source: 'seniorKoshu',
  sourceKey: `${nextId}:x`,
});

const SESSIONS = [
  session('石原', D0104.label, '高1・高2 Ⅱ期 高校①', '16:40', '18:10', '亀井町'),
  session('石原', D0105.label, '高1・高2 Ⅱ期 高校①', '16:40', '18:10', '亀井町'),
  session('半田', D0104.label, '高1・高2 Ⅱ期 高校①', '16:40', '18:10', '亀井町'),
  session('半田', D0106.label, '高1・高2 Ⅱ期 高校②', '18:20', '19:50', '亀井町'),
  session('片岡', D1225.label, '高1・高2 Ⅰ期 高校②', '18:20', '19:50', '亀井町'),
  session('滝澤', D1225.label, '高3 Ⅰ期 予備校３限', '13:00', '14:30', '本校'),
];

// 半田先生は予備校部、ほかは現役部
const CATEGORIES = { 石原: 'genyakuFull', 片岡: 'genyakuFull', 半田: 'yobiko', 滝澤: 'yobiko' };
const RETURN = returnCautionTeachers(TEACHERS, CATEGORIES);

const ng = (name, date, period) =>
  computeAutoNgByTeacher(TEACHERS, SESSIONS, PERIODS, null, DEFAULT_TRAVEL).get(name)?.get(makeNgKey(date.label, period.label));
const cautionsOf = (name, date, period) =>
  computeTravelCautions(TEACHERS, SESSIONS, PERIODS, DEFAULT_TRAVEL, RETURN).get(name)?.get(makeNgKey(date.label, period.label));

describe('移動時間 (本校 ⇄ 亀井町) — 受け入れ条件', () => {
  it('1. 石原 1/4・1/5 の夜1限 (18:30〜) は高校① (〜18:10) のあと 20 分なので NG:移動', () => {
    for (const d of [D0104, D0105]) {
      const e = ng('石原', d, P_YORU1);
      expect(e?.travel?.length).toBe(1);
      expect(e.travel[0]).toMatchObject({ direction: 'fromSession', gap: 20, minutes: 30, place: '亀井町' });
      expect(autoNgSourceLabel(e)).toBe('移動');
      expect(describeTravelHit(e.travel[0])).toBe('移動が間に合わない: 高1・高2 Ⅱ期 高校① 16:40〜18:10 (亀井町) のあと 20分 (移動に30分)');
    }
  });

  it('2. 半田 1/4 の中3 昼3限 (〜16:20) は高校① (16:40〜) の 20 分前なので NG:移動', () => {
    const e = ng('半田', D0104, P_HIRU3);
    expect(e?.travel?.[0]).toMatchObject({ direction: 'toSession', gap: 20 });
    expect(describeTravelHit(e.travel[0])).toContain('の 20分前');
  });

  it('3. 半田 1/6 の夜3限 (20:20〜) は高校② (〜19:50) のあと 30 分: 注意「移動30分」+「亀井町から戻り」(予備校部)', () => {
    expect(ng('半田', D0106, P_YORU3)).toBeUndefined();
    const c = cautionsOf('半田', D0106, P_YORU3);
    expect(c.map(x => x.kind).sort()).toEqual(['gap', 'return']);
    expect(travelCautionLabels(c)).toEqual(['移動30分', '亀井町から戻り']);
    expect(hasReturnCaution(c)).toBe(true);
  });

  it('4. 石原 1/4 の夜3限 (130 分) と 1/5 の夜2限 (75 分) は何も出ない (現役部なので戻りも見ない)', () => {
    expect(ng('石原', D0104, P_YORU3)).toBeUndefined();
    expect(ng('石原', D0105, P_YORU2)).toBeUndefined();
    expect(cautionsOf('石原', D0104, P_YORU3)).toBeUndefined();
    expect(cautionsOf('石原', D0105, P_YORU2)).toBeUndefined();
  });

  it('5. 片岡 12/25 の中3 昼3限 (〜16:20) → 高校② (18:20〜) は 120 分なので何も出ない', () => {
    expect(ng('片岡', D1225, P_HIRU3)).toBeUndefined();
    expect(cautionsOf('片岡', D1225, P_HIRU3)).toBeUndefined();
  });

  it('6. 滝澤 12/25 の予備校3限 (本校) は今までどおり時間の重なりだけ (移動扱いにしない)', () => {
    // 昼2限 (14:15〜) は重なる → 他学年の自動NG
    const overlap = ng('滝澤', D1225, P_HIRU2);
    expect(overlap.sessions).toHaveLength(1);
    expect(overlap.travel).toBeUndefined();
    expect(autoNgSourceLabel(overlap)).toBe('他学年');
    // 昼3限 (15:20〜) は間 50 分だが同じ本校なので何もしない (注意も、予備校部の戻りも出ない)
    expect(ng('滝澤', D1225, P_HIRU3)).toBeUndefined();
    expect(cautionsOf('滝澤', D1225, P_HIRU3)).toBeUndefined();
  });
});

describe('移動時間の細かいところ', () => {
  it('時間が重なる亀井町の授業は他学年の自動NG (移動とは数えない)', () => {
    const e = ng('半田', D0106, P_YORU2);
    expect(e.sessions).toHaveLength(1);
    expect(e.travel).toBeUndefined();
  });

  it('端が接する (間 0 分) 亀井町の授業は NG:移動 (本校どうしなら何もしない)', () => {
    const sessions = [session('石原', D0104.label, '高校①', '17:30', '18:30', '亀井町')];
    const e = computeAutoNgByTeacher(TEACHERS, sessions, PERIODS).get('石原').get(makeNgKey(D0104.label, P_YORU1.label));
    expect(e.travel[0].gap).toBe(0);
    const same = [session('石原', D0104.label, '予備校1限', '17:30', '18:30', '本校')];
    expect(computeAutoNgByTeacher(TEACHERS, same, PERIODS).get('石原').size).toBe(0);
  });

  it('移動時間を変えると判定が変わる (15 分なら 20 分の間は注意)', () => {
    const travel = withMainKameiMinutes(DEFAULT_TRAVEL, 15);
    const auto = computeAutoNgByTeacher(TEACHERS, SESSIONS, PERIODS, null, travel);
    expect(auto.get('石原').get(makeNgKey(D0104.label, P_YORU1.label))).toBeUndefined();
    const c = computeTravelCautions(TEACHERS, SESSIONS, PERIODS, travel, RETURN).get('石原').get(makeNgKey(D0104.label, P_YORU1.label));
    expect(travelCautionLabels(c)).toEqual(['移動20分']);
  });

  it('注意の分数を変えられる (90 分にすると 75 分の間も注意)', () => {
    const travel = { ...DEFAULT_TRAVEL, cautionMinutes: 90 };
    const c = computeTravelCautions(TEACHERS, SESSIONS, PERIODS, travel, RETURN).get('石原').get(makeNgKey(D0105.label, P_YORU2.label));
    expect(travelCautionLabels(c)).toEqual(['移動75分']);
  });

  it('予備校部の戻りは間の分数に関係なく出る (130 分でも)', () => {
    const c = computeTravelCautions(TEACHERS, SESSIONS, PERIODS, DEFAULT_TRAVEL, RETURN).get('半田').get(makeNgKey(D0104.label, P_YORU3.label));
    expect(travelCautionLabels(c)).toEqual(['亀井町から戻り']);
    // 亀井町の前のコマ (本校 → 亀井町) は戻りではない
    expect(computeTravelCautions(TEACHERS, SESSIONS, PERIODS, DEFAULT_TRAVEL, RETURN).get('半田').get(makeNgKey(D0104.label, P_HIRU2.label))).toBeUndefined();
  });

  it('場所の無い手入力のセッションは移動を見ない。場所の欄の前に取り込んだものはメモの時限の名前から当てる', () => {
    const manual = [{ id: 1, date: D0104.label, teacherName: '石原', label: '', memo: '高校①', startTime: '16:40', endTime: '18:10' }];
    expect(computeAutoNgByTeacher(TEACHERS, manual, PERIODS).get('石原').size).toBe(0);
    const legacy = [{ ...manual[0], memo: '高1・高2 Ⅱ期 高校①', source: 'seniorKoshu', sourceKey: '1:2027-01-04' }];
    const e = computeAutoNgByTeacher(TEACHERS, legacy, PERIODS).get('石原').get(makeNgKey(D0104.label, P_YORU1.label));
    expect(e.travel[0].place).toBe('亀井町');
  });

  it('終了時刻の無い亀井町の授業は、その前のコマへの移動だけ見る', () => {
    const sessions = [{ id: 1, date: D0104.label, teacherName: '石原', label: '', memo: '', startTime: '16:40', place: '亀井町' }];
    const hits = computeTravelHits('石原', sessions, PERIODS, DEFAULT_TRAVEL);
    expect(hits.get(makeNgKey(D0104.label, P_HIRU3.label))?.[0]).toMatchObject({ direction: 'toSession', gap: 20 });
    expect(hits.has(makeNgKey(D0104.label, P_YORU1.label))).toBe(false);
  });

  it('移動時間の表に無い組 (他校舎) は間の分数のルールを当てない', () => {
    const sessions = [session('石原', D0104.label, '村上高松', '16:40', '18:10', '村上高松')];
    expect(computeAutoNgByTeacher(TEACHERS, sessions, PERIODS).get('石原').size).toBe(0);
    // 表に足せば効く
    const travel = normalizeTravelSettings({ routes: [{ a: '本校', b: '村上高松', minutes: 40 }] });
    expect(travel.routes).toHaveLength(2); // 本校⇄亀井町は既定で補う
    const e = computeAutoNgByTeacher(TEACHERS, sessions, PERIODS, null, travel).get('石原').get(makeNgKey(D0104.label, P_YORU1.label));
    expect(e.travel[0].minutes).toBe(40);
  });
});

describe('違反の内訳: NG の一覧と注意の一覧', () => {
  const tabs = [
    {
      id: 1,
      name: '中1・2',
      config: { classes: [{ id: 1, label: '1A' }], subjectCounts: {}, activeDateIds: [2, 3, 4], activePeriodIds: [2, 3, 4] },
      schedule: {
        [makeKey(D0104.id, P_YORU1.id, 1)]: { subject: '英語', teacher: '石原' },
        [makeKey(D0105.id, P_YORU1.id, 1)]: { subject: '数学', teacher: '石原' },
        [makeKey(D0104.id, P_YORU3.id, 1)]: { subject: '数学', teacher: '石原' },
        [makeKey(D0105.id, P_YORU2.id, 1)]: { subject: '英語', teacher: '石原' },
        [makeKey(D0106.id, P_YORU3.id, 1)]: { subject: '英語', teacher: '半田' },
      },
    },
    {
      id: 2,
      name: '中3',
      config: { classes: [{ id: 1, label: '3A' }], subjectCounts: {}, activeDateIds: [1, 2], activePeriodIds: [5, 1] },
      schedule: {
        [makeKey(D0104.id, P_HIRU3.id, 1)]: { subject: '英語', teacher: '半田' },
        [makeKey(D1225.id, P_HIRU3.id, 1)]: { subject: '数学', teacher: '片岡' },
      },
    },
  ];
  const project = { tabs, dates: DATES, periods: PERIODS, teachers: TEACHERS, externalSessions: SESSIONS };
  const auto = computeAutoNgByTeacher(TEACHERS, SESSIONS, PERIODS, null, DEFAULT_TRAVEL);

  it('NG:移動の割当が「NG に当たっている割当」に理由つきで出る (石原 1/4・1/5 夜1限、半田 1/4 昼3限)', () => {
    const list = computeNgViolationList(project, auto);
    expect(list.map(it => `${it.teacher} ${it.dateLabel} ${it.periodLabel}`)).toEqual([
      '石原 1/4(月) 夜1限 (18:30~19:20)',
      '石原 1/5(火) 夜1限 (18:30~19:20)',
      '半田 1/4(月) 昼3限 (15:20~16:20)',
    ]);
    expect(list[0].reasons[0]).toMatch(/^移動が間に合わない: /);
  });

  it('注意は別の一覧 (違反には数えない): 半田 1/6 夜3限だけ', () => {
    const cautions = computeTravelCautions(TEACHERS, SESSIONS, PERIODS, DEFAULT_TRAVEL, RETURN);
    const isNg = (name, key) => !!auto.get(name)?.has(key);
    const list = computeTravelCautionList(project, cautions, isNg);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ teacher: '半田', dateLabel: '1/6(水)', labels: ['移動30分', '亀井町から戻り'] });
    expect(list[0].reasons).toEqual([
      '移動30分: 高1・高2 Ⅱ期 高校② 18:20〜19:50 (亀井町) のあと 30分',
      '亀井町から本校に戻る (予備校部): 高1・高2 Ⅱ期 高校② 18:20〜19:50 のあと 30分',
    ]);
  });
});
