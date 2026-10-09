import { describe, expect, it } from 'vitest';
import {
  answeredTeacherNames,
  applyAvailabilityMarks,
  availabilityNgKeys,
  buildSurveyLayout,
  collectSlotAvailability,
  computeSurveyDays,
  countTeacherAvailability,
  dropAvailabilityDates,
  dropAvailabilityPeriods,
  getAvailabilityMark,
  groupPeriodsIntoBands,
  hasAvailability,
  periodShortLabel,
  periodTimeText,
  renameAvailabilityDate,
  renameAvailabilityPeriod,
  resolveCourseYmds,
  sanitizeAvailability,
  sortPeriodsByTime,
  surveyCells,
  withAvailability,
} from './availability';
import { computeAutoNgByTeacher, autoNgSourceLabel } from './autoNg';
import { makeNgKey } from './scheduleKey';

const P = (id, label) => ({ id, label });

describe('applyAvailabilityMarks', () => {
  it('マスに記号を書き、空の講師は undefined', () => {
    const next = applyAvailabilityMarks(undefined, [{ date: '7/29(水)', period: '1限' }], 'ok');
    expect(next).toEqual({ '7/29(水)': { '1限': 'ok' } });
    expect(applyAvailabilityMarks(next, [{ date: '7/29(水)', period: '1限' }], null)).toBeUndefined();
  });

  it('何も変わらなければ同じ参照を返す (reducer の no-op 判定)', () => {
    const map = { '7/29(水)': { '1限': 'ok' } };
    expect(applyAvailabilityMarks(map, [{ date: '7/29(水)', period: '1限' }], 'ok')).toBe(map);
    expect(applyAvailabilityMarks(map, [{ date: '7/30(木)', period: '1限' }], null)).toBe(map);
    expect(applyAvailabilityMarks(undefined, [], 'ok')).toBeUndefined();
  });

  it('入力を書き換えない (immutable)', () => {
    const map = { '7/29(水)': { '1限': 'ok', '2限': 'ng' } };
    const next = applyAvailabilityMarks(map, [
      { date: '7/29(水)', period: '1限' },
      { date: '7/30(木)', period: '1限' },
    ], 'maybe');
    expect(map).toEqual({ '7/29(水)': { '1限': 'ok', '2限': 'ng' } });
    expect(next).toEqual({ '7/29(水)': { '1限': 'maybe', '2限': 'ng' }, '7/30(木)': { '1限': 'maybe' } });
  });

  it('日付の最後のマスを消すと日付ごと消える。同じ呼び出しで再び書ける', () => {
    const map = { '7/29(水)': { '1限': 'ok' }, '7/30(木)': { '1限': 'ng' } };
    expect(applyAvailabilityMarks(map, [{ date: '7/29(水)', period: '1限' }], null))
      .toEqual({ '7/30(木)': { '1限': 'ng' } });
  });
});

describe('ラベルの改名・削除への追従', () => {
  const map = {
    '8/6': { '1限': 'ok', '2限': 'ng' },
    '8/6(木)': { '1限': 'maybe' },
    '8/7(金)': { '1限': 'ng' },
  };

  it('日付の改名はマージし、重なるマスは改名先を優先', () => {
    expect(renameAvailabilityDate(map, '8/6', '8/6(木)')).toEqual({
      '8/6(木)': { '1限': 'maybe', '2限': 'ng' },
      '8/7(金)': { '1限': 'ng' },
    });
    expect(renameAvailabilityDate(map, '9/1', '9/2')).toBe(map);
  });

  it('prefer=moved なら重なるマスは動かしてきた回答を優先 (見出しの改名)', () => {
    expect(renameAvailabilityDate(map, '8/6', '8/6(木)', 'moved')).toEqual({
      '8/6(木)': { '1限': 'ok', '2限': 'ng' },
      '8/7(金)': { '1限': 'ng' },
    });
    const m2 = { '8/6(木)': { '1限': 'ok', '1限 (13:00~)': 'ng' } };
    expect(renameAvailabilityPeriod(m2, '1限', '1限 (13:00~)', 'moved')).toEqual({ '8/6(木)': { '1限 (13:00~)': 'ok' } });
    expect(renameAvailabilityPeriod(m2, '1限', '1限 (13:00~)')).toEqual({ '8/6(木)': { '1限 (13:00~)': 'ng' } });
  });

  it('ラベルが Object の組み込みと同じ名前でも自前のキーだけを見る', () => {
    const m = { '8/6(木)': { '1限': 'ok' } };
    expect(renameAvailabilityPeriod(m, '1限', 'toString')).toEqual({ '8/6(木)': { toString: 'ok' } });
    expect(renameAvailabilityPeriod(m, 'constructor', '2限')).toBe(m);
    expect(renameAvailabilityDate(m, 'constructor', '9/1')).toBe(m);
    expect(applyAvailabilityMarks(m, [{ date: '8/6(木)', period: 'constructor' }], null)).toBe(m);
  });

  it('時限の改名は全日付に効く', () => {
    expect(renameAvailabilityPeriod(map, '1限', '1限 (13:00~13:45)')).toEqual({
      '8/6': { '1限 (13:00~13:45)': 'ok', '2限': 'ng' },
      '8/6(木)': { '1限 (13:00~13:45)': 'maybe' },
      '8/7(金)': { '1限 (13:00~13:45)': 'ng' },
    });
    expect(renameAvailabilityPeriod(map, '9限', '10限')).toBe(map);
  });

  it('日付・時限の削除。空になれば undefined', () => {
    expect(dropAvailabilityDates(map, ['8/6', '8/7(金)'])).toEqual({ '8/6(木)': { '1限': 'maybe' } });
    expect(dropAvailabilityPeriods(map, ['1限'])).toEqual({ '8/6': { '2限': 'ng' } });
    expect(dropAvailabilityPeriods(map, ['1限', '2限'])).toBeUndefined();
    expect(dropAvailabilityDates(map, ['9/1'])).toBe(map);
  });
});

describe('sanitizeAvailability', () => {
  it('正しい形はそのまま (changed=false)', () => {
    const raw = { '7/29(水)': { '1限': 'ok' } };
    expect(sanitizeAvailability(raw)).toEqual({ value: raw, changed: false });
    expect(sanitizeAvailability(undefined)).toEqual({ value: undefined, changed: false });
  });

  it('未知の記号・崩れた日付は落とす', () => {
    expect(sanitizeAvailability({
      '7/29(水)': { '1限': 'ok', '2限': 'yes', '3限': null },
      '7/30(木)': 'ng',
      '7/31(金)': {},
    })).toEqual({ value: { '7/29(水)': { '1限': 'ok' } }, changed: true });
    expect(sanitizeAvailability([1, 2])).toEqual({ value: undefined, changed: true });
    expect(sanitizeAvailability({ '7/30(木)': ['ok'] })).toEqual({ value: undefined, changed: true });
  });

  it('外部 JSON の "__proto__" キーは読み込まない (プロトタイプを書き換えない)', () => {
    const raw = JSON.parse('{"__proto__": {"1限": "ng"}, "7/29(水)": {"1限": "ok", "__proto__": "ok"}}');
    const { value, changed } = sanitizeAvailability(raw);
    expect(changed).toBe(true);
    expect(value).toEqual({ '7/29(水)': { '1限': 'ok' } });
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(value['7/29(水)'])).toBe(Object.prototype);
  });
});

describe('読み取りヘルパ', () => {
  const t = { name: '堀上', availability: { '7/29(水)': { '1限': 'ok', '2限': 'ng' }, '7/30(木)': { '1限': 'ng' } } };

  it('getAvailabilityMark / hasAvailability', () => {
    expect(getAvailabilityMark(t, '7/29(水)', '1限')).toBe('ok');
    expect(getAvailabilityMark(t, '7/29(水)', '3限')).toBeNull();
    expect(hasAvailability(t)).toBe(true);
    expect(hasAvailability({ name: '田中' })).toBe(false);
    expect(hasAvailability({ name: '田中', availability: {} })).toBe(false);
  });

  it('availabilityNgKeys は × だけを NG キーで返す', () => {
    expect(availabilityNgKeys(t).sort()).toEqual([
      makeNgKey('7/29(水)', '2限'),
      makeNgKey('7/30(木)', '1限'),
    ].sort());
  });

  it('withAvailability は空なら講師からフィールドを消す', () => {
    expect(withAvailability({ ...t }, undefined)).not.toHaveProperty('availability');
    const same = { name: 'x' };
    expect(withAvailability(same, undefined)).toBe(same);
  });
});

describe('computeAutoNgByTeacher への合流', () => {
  const periods = [P(1, '1限 (13:00~13:45)'), P(2, '2限 (14:00~14:45)')];

  it('× は自動NG になり、由来は「調査」', () => {
    const teachers = [{
      name: '堀上', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [],
      availability: { '7/29(水)': { '1限 (13:00~13:45)': 'ng', '2限 (14:00~14:45)': 'maybe' } },
    }];
    const byTeacher = computeAutoNgByTeacher(teachers, [], periods);
    const entries = byTeacher.get('堀上');
    expect(entries.size).toBe(1);
    const e = entries.get(makeNgKey('7/29(水)', '1限 (13:00~13:45)'));
    expect(e).toEqual({ sessions: [], availability: true });
    expect(autoNgSourceLabel(e)).toBe('調査');
  });

  it('他学年セッションと同じマスなら 1 エントリに両方の由来', () => {
    const teachers = [{
      name: '堀上', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [],
      availability: { '7/29(水)': { '1限 (13:00~13:45)': 'ng' } },
    }];
    const sessions = [{ id: 1, date: '7/29(水)', teacherName: '堀上', label: '', startTime: '13:00', endTime: '13:30' }];
    const e = computeAutoNgByTeacher(teachers, sessions, periods).get('堀上')
      .get(makeNgKey('7/29(水)', '1限 (13:00~13:45)'));
    expect(e.sessions).toHaveLength(1);
    expect(e.availability).toBe(true);
    expect(autoNgSourceLabel(e)).toBe('他学年・調査');
  });

  it('placeholder の「未定」に回答が付いていても NG にしない (画面で直せないため)', () => {
    const teachers = [{
      name: '未定', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [],
      availability: { '7/29(水)': { '1限 (13:00~13:45)': 'ng' } },
    }];
    expect(computeAutoNgByTeacher(teachers, [], periods).get('未定').size).toBe(0);
  });
});

// 夏期講習相当: 中3 (昼 4 コマ, 7/29〜) と 中12 (夜 3 コマ, 7/24〜) と プレップ (夜 90 分, 7/17〜)
function summerProject() {
  const dates = [
    P(1, '7/17(金)'), P(2, '7/18(土)'), P(3, '7/21(火)'), P(4, '7/24(金)'),
    P(5, '7/29(水)'), P(6, '7/30(木)'), P(7, '7/20(月)'),
  ];
  const periods = [
    P(1, '1限 (13:00~13:45)'), P(2, '2限 (13:55~14:40)'), P(3, '3限 (14:50~15:35)'), P(4, '4限 (15:45~16:50)'),
    P(5, '夜1 (18:30~19:15)'), P(6, '夜2 (19:25~20:10)'), P(7, '夜3 (20:20~21:30)'),
    P(8, 'プレップ1 (18:30~20:00)'), P(9, 'プレップ2 (20:20~21:50)'),
  ];
  const tab = (id, name, activeDateIds, activePeriodIds) => ({
    id, name, schedule: {},
    config: { classes: [P(1, 'A')], subjectCounts: {}, activeDateIds, activePeriodIds },
  });
  return {
    version: 4,
    name: '2026 夏期講習',
    teachers: [],
    dates,
    periods,
    tabs: [
      tab(1, '中12', [4, 5, 6], [5, 6, 7]),
      tab(2, '中3', [5, 6], [1, 2, 3, 4]),
      tab(3, 'プレップ夏期', [1, 2, 3], [8, 9]),
    ],
  };
}

describe('computeSurveyDays', () => {
  it('その日に使うタブの時限の和集合を時刻順に。使わない日は時限なし', () => {
    const days = computeSurveyDays(summerProject());
    expect(days.map(d => d.date.label)).toEqual([
      '7/17(金)', '7/18(土)', '7/20(月)', '7/21(火)', '7/24(金)', '7/29(水)', '7/30(木)',
    ]);
    const byLabel = Object.fromEntries(days.map(d => [d.date.label, d]));
    expect(byLabel['7/20(月)'].periods).toEqual([]);
    expect(byLabel['7/20(月)'].tabNames).toEqual([]);
    expect(byLabel['7/17(金)'].periods.map(p => p.id)).toEqual([8, 9]);
    expect(byLabel['7/24(金)'].periods.map(p => p.id)).toEqual([5, 6, 7]);
    expect(byLabel['7/29(水)'].periods.map(p => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(byLabel['7/29(水)'].tabNames).toEqual(['中12', '中3']);
  });

  it('surveyCells は (日付, 時限) ラベルの平らな配列', () => {
    const cells = surveyCells(computeSurveyDays(summerProject()));
    expect(cells).toHaveLength(2 + 2 + 2 + 3 + 7 + 7);
    expect(cells[0]).toEqual({ date: '7/17(金)', period: 'プレップ1 (18:30~20:00)' });
  });
});

describe('sortPeriodsByTime / groupPeriodsIntoBands', () => {
  it('開始時刻順。時刻の読めない時限は後ろ', () => {
    expect(sortPeriodsByTime([P(1, '夜1 (18:30~)'), P(2, '補講'), P(3, '1限 (13:00~)')]).map(p => p.id))
      .toEqual([3, 1, 2]);
  });

  it('昼の部と夜の部に分かれる (40 分以上あくと次のまとまり)', () => {
    const { periods } = summerProject();
    const bands = groupPeriodsIntoBands(periods);
    expect(bands.map(b => b.map(p => p.id))).toEqual([[1, 2, 3, 4], [5, 8, 6, 7, 9]]);
  });

  it('終了時刻の無い時限 (1限 (13:00~) 等) は 1 時限ずつに割れない', () => {
    const bands = groupPeriodsIntoBands([P(1, '1限 (13:00~)'), P(2, '2限 (14:10~)'), P(3, '3限 (15:20~)')]);
    expect(bands).toHaveLength(1);
    // 90 分授業 (開始の間隔 100 分) でも 1 つのまとまり
    expect(groupPeriodsIntoBands([P(1, '1限 (13:00~)'), P(2, '2限 (14:40~)'), P(3, '3限 (16:20~)')])).toHaveLength(1);
  });

  it('終了時刻の無い時限でも、開始の間隔が 2 時間以上あけば昼と夜に分かれる', () => {
    const bands = groupPeriodsIntoBands([P(1, '4限 (15:45~)'), P(2, '夜1 (18:30~)'), P(3, '夜2 (19:25~)')]);
    expect(bands.map(b => b.map(p => p.id))).toEqual([[1], [2, 3]]);
  });

  it('時刻の読めない時限は最後のまとまり', () => {
    const bands = groupPeriodsIntoBands([P(1, '補講'), P(2, '1限 (13:00~13:45)')]);
    expect(bands.map(b => b.map(p => p.id))).toEqual([[2], [1]]);
  });
});

describe('表示ラベル', () => {
  it('periodShortLabel / periodTimeText', () => {
    expect(periodShortLabel(P(1, '1限 (13:00~13:45)'))).toBe('1限');
    expect(periodShortLabel(P(1, '13:00~13:45'))).toBe('13:00');
    expect(periodShortLabel(P(1, '補講'))).toBe('補講');
    expect(periodTimeText(P(1, '1限 (13:00~13:45)'))).toBe('13:00-13:45');
    expect(periodTimeText(P(1, '1限 (13:00~)'))).toBe('13:00〜');
    expect(periodTimeText(P(1, '補講'))).toBe('補講');
  });
});

describe('resolveCourseYmds', () => {
  it('夏期: 基準日の近くの年に解決', () => {
    const m = resolveCourseYmds(['7/29(水)', '8/13(木)'], '2026-07-01');
    expect(m.get('7/29(水)')).toBe('2026-07-29');
    expect(m.get('8/13(木)')).toBe('2026-08-13');
  });

  it('冬期: 12/25 → 1/7 の年またぎは翌年の 1 月になる', () => {
    const labels = ['12/25(金)', '12/26(土)', '1/4(月)', '1/7(木)'];
    const m = resolveCourseYmds(labels, '2026-12-01');
    expect(labels.map(l => m.get(l))).toEqual(['2026-12-25', '2026-12-26', '2027-01-04', '2027-01-07']);
  });

  it('講習中に開いても (基準日が 1 月) 前年 12 月から始まる', () => {
    const labels = ['12/25(金)', '1/7(木)'];
    const m = resolveCourseYmds(labels, '2027-01-05');
    expect(m.get('12/25(金)')).toBe('2026-12-25');
    expect(m.get('1/7(木)')).toBe('2027-01-07');
  });

  it('ラベルの曜日は半年以内なら優先する (講習の数か月後に開いても年がずれない)', () => {
    // 2027-01-07 は木曜。5 月に開いた (基準日が 5 月) 冬期でも 2027 年 1 月
    const m = resolveCourseYmds(['12/24(木)', '1/7(木)'], '2027-05-01');
    expect(m.get('12/24(木)')).toBe('2026-12-24');
    expect(m.get('1/7(木)')).toBe('2027-01-07');
  });

  it('1 年近く前の曜日は信じない (作り直していない前年の既定の日付を 1 年前へ飛ばさない)', () => {
    // 2025-12-25 は木曜だが基準日 (2026-11) から 300 日以上前 → 近い年 (2026) を採る
    const m = resolveCourseYmds(['12/25(木)'], '2026-11-01');
    expect(m.get('12/25(木)')).toBe('2026-12-25');
  });

  it('M/D でないラベルは null', () => {
    expect(resolveCourseYmds(['補講日'], '2026-07-01').get('補講日')).toBeNull();
  });

  it('講習の半年後に開いても、1 つの講習が 2 つの年に割れない (年は季節ごとに決める)', () => {
    const labels = ['12/22(火)', '12/26(土)', '1/4(月)', '1/7(木)'];
    // 曜日を信じる範囲の境目の近く: ラベルごとに決めると 12 月だけ翌年へ移っていた
    const m = resolveCourseYmds(labels, '2027-06-25');
    expect(labels.map(l => m.get(l))).toEqual(['2026-12-22', '2026-12-26', '2027-01-04', '2027-01-07']);
    // 範囲を過ぎたら季節ごと次の年へ (途中で割れない)
    const later = resolveCourseYmds(labels, '2027-07-10');
    expect(labels.map(l => later.get(l))).toEqual(['2027-12-22', '2027-12-26', '2028-01-04', '2028-01-07']);
  });

});

describe('調査票の注記 (タブの開始・終講日)', () => {
  const notesOf = (layout) => Object.fromEntries(
    layout.weeks.flatMap(w => w.days).filter(d => d.notes.length > 0).map(d => [`${d.month}/${d.day}`, d.notes]),
  );

  it('タブの初日に「開始」、最終日に「終講日」', () => {
    const layout = buildSurveyLayout(computeSurveyDays(summerProject()), { baseYmd: '2026-07-01' });
    expect(notesOf(layout)).toEqual({
      '7/17': ['プレップ夏期開始'],
      '7/21': ['プレップ夏期終講日'],
      '7/24': ['中12開始'],
      '7/29': ['中3開始'],
      '7/30': ['中12終講日', '中3終講日'],
    });
  });

  it('1 日だけのタブはタブ名だけ。時限を使わないタブは載せない', () => {
    const p = summerProject();
    p.tabs.push({ id: 4, name: '模試', schedule: {}, config: { classes: [], subjectCounts: {}, activeDateIds: [7], activePeriodIds: [1] } });
    p.tabs.push({ id: 5, name: '空', schedule: {}, config: { classes: [], subjectCounts: {}, activeDateIds: [7], activePeriodIds: [] } });
    const layout = buildSurveyLayout(computeSurveyDays(p), { baseYmd: '2026-07-01' });
    expect(notesOf(layout)['7/20']).toEqual(['模試']);
  });

  it('プールの並び (足した順) ではなく実日付の順で最初と最後を決める', () => {
    // 後から前倒しの日 (7/22) を足したプール
    const project = {
      dates: [P(1, '7/24(金)'), P(2, '7/29(水)'), P(3, '7/22(水)')],
      periods: [P(1, '1限 (13:00~13:45)')],
      tabs: [{ id: 1, name: '中3', schedule: {}, config: { classes: [], subjectCounts: {} } }],
    };
    const layout = buildSurveyLayout(computeSurveyDays(project), { baseYmd: '2026-07-01' });
    expect(notesOf(layout)).toEqual({ '7/22': ['中3開始'], '7/29': ['中3終講日'] });
  });

  it('日付として読めない日に終講日を付けない (本当の最終日に付ける)', () => {
    const project = {
      dates: [P(1, '1/7(木)'), P(2, '12/24(木)'), P(3, '補講日')],
      periods: [P(1, '1限 (13:00~13:45)')],
      tabs: [{ id: 1, name: '中3', schedule: {}, config: { classes: [], subjectCounts: {} } }],
    };
    const layout = buildSurveyLayout(computeSurveyDays(project), { baseYmd: '2026-12-01' });
    expect(notesOf(layout)).toEqual({ '12/24': ['中3開始'], '1/7': ['中3終講日'] });
    expect(layout.unplaced.map(sd => sd.date.label)).toEqual(['補講日']);
  });
});

describe('buildSurveyLayout', () => {
  it('月曜始まりの週に並べ、授業の無い週は飛ばす', () => {
    const p = summerProject();
    const layout = buildSurveyLayout(computeSurveyDays(p), { baseYmd: '2026-07-01' });
    expect(layout.weeks.map(w => w.mondayYmd)).toEqual(['2026-07-13', '2026-07-20', '2026-07-27']);
    expect(layout.includeSunday).toBe(false);
    const w1 = layout.weeks[0];
    expect(w1.days.map(d => `${d.month}/${d.day}`)).toEqual(['7/13', '7/14', '7/15', '7/16', '7/17', '7/18']);
    // 7/13 (月) はプールに無い日
    expect(w1.days[0].survey).toBeNull();
    // 7/17 (金) はプレップの夜 2 コマ (夜の部 = まとまり 1)
    expect(w1.days[4].bandPeriods[0]).toEqual([]);
    expect(w1.days[4].bandPeriods[1].map(p => p.id)).toEqual([8, 9]);
    expect(w1.days[4].notes).toEqual(['プレップ夏期開始']);
    // この週は昼の部が無い
    expect(w1.bandRows).toEqual([0, 2]);
    const w3 = layout.weeks[2];
    // 7/29 (水): 昼 4 + 夜 3
    const wed = w3.days[2];
    expect(wed.bandPeriods[0].map(p => p.id)).toEqual([1, 2, 3, 4]);
    expect(wed.bandPeriods[1].map(p => p.id)).toEqual([5, 6, 7]);
    expect(w3.bandRows).toEqual([4, 3]);
  });

  it('冬期: 年をまたいでも週の並びが続く。日曜に授業があれば日曜の列を出す', () => {
    const dates = [P(1, '12/25(金)'), P(2, '12/27(日)'), P(3, '1/4(月)')];
    const periods = [P(1, '1限 (13:00~13:45)')];
    const project = {
      dates, periods,
      tabs: [{ id: 1, name: '中3', schedule: {}, config: { classes: [], subjectCounts: {} } }],
    };
    const layout = buildSurveyLayout(computeSurveyDays(project), { baseYmd: '2026-12-01' });
    expect(layout.includeSunday).toBe(true);
    expect(layout.weeks.map(w => w.mondayYmd)).toEqual(['2026-12-21', '2027-01-04']);
    expect(layout.weeks[0].days).toHaveLength(7);
    expect(layout.weeks[0].days[6].survey.date.label).toBe('12/27(日)');
  });

  it('どのタブも使わない古いラベルが同じ実日付でも、授業のある日を押し出さない', () => {
    // 既定の日付 (前年の曜日) を作り直した後に残った「12/25(木)」と、今年の「12/25(金)」
    const project = {
      dates: [P(1, '12/25(木)'), P(2, '12/25(金)')],
      periods: [P(1, '1限 (13:00~13:45)')],
      tabs: [{ id: 1, name: '中3', schedule: {}, config: { classes: [], subjectCounts: {}, activeDateIds: [2] } }],
    };
    const layout = buildSurveyLayout(computeSurveyDays(project), { baseYmd: '2026-12-01' });
    expect(layout.unplaced).toEqual([]);
    const fri = layout.weeks[0].days.find(d => d.ymd === '2026-12-25');
    expect(fri.survey.date.label).toBe('12/25(金)');
  });

  it('M/D でないラベルの日は unplaced へ (授業のある日だけ)', () => {
    const project = {
      dates: [P(1, '7/29(水)'), P(2, '予備日'), P(3, '未定日')],
      periods: [P(1, '1限 (13:00~13:45)')],
      tabs: [{ id: 1, name: '中3', schedule: {}, config: { classes: [], subjectCounts: {}, activeDateIds: [1, 2] } }],
    };
    const layout = buildSurveyLayout(computeSurveyDays(project), { baseYmd: '2026-07-01' });
    expect(layout.unplaced.map(sd => sd.date.label)).toEqual(['予備日']);
  });
});

describe('集計', () => {
  const p = summerProject();
  const days = computeSurveyDays(p);
  const teachers = [
    { name: '堀上', availability: { '7/17(金)': { 'プレップ1 (18:30~20:00)': 'ok', 'プレップ2 (20:20~21:50)': 'ng' } } },
    { name: '石原', availability: { '7/17(金)': { 'プレップ1 (18:30~20:00)': 'maybe' } } },
    { name: '高松' },
    { name: '未定' },
  ];

  it('countTeacherAvailability は調査の対象マスだけを数える', () => {
    const c = countTeacherAvailability(teachers[0], days);
    expect(c).toEqual({ ok: 1, maybe: 0, ng: 1, blank: 21, total: 23 });
  });

  it('answeredTeacherNames は今の調査の対象マスに記号がある講師だけ (前の季節の回答・未定は除く)', () => {
    const names = answeredTeacherNames([
      ...teachers,
      // 調査の対象外の日 (前の冬) の回答だけ残っている
      { name: '南條', availability: { '12/25(金)': { '1限 (13:00~13:45)': 'ng' } } },
    ], days);
    expect([...names]).toEqual(['堀上', '石原']);
  });

  it('collectSlotAvailability は回答ごとに分け、未定は除く', () => {
    const all = [...teachers, { name: '南條', availability: { '12/25(金)': { '1限 (13:00~13:45)': 'ng' } } }];
    const answered = answeredTeacherNames(all, days);
    const s = collectSlotAvailability(all, '7/17(金)', 'プレップ2 (20:20~21:50)', answered);
    expect(s.ng.map(t => t.name)).toEqual(['堀上']);
    expect(s.blank.map(t => t.name)).toEqual(['石原']);
    // 前の季節の回答だけの講師は「未記入」ではなく「未回答」
    expect(s.unanswered.map(t => t.name)).toEqual(['高松', '南條']);
    const s2 = collectSlotAvailability(all, '7/17(金)', 'プレップ1 (18:30~20:00)', answered);
    expect(s2.ok.map(t => t.name)).toEqual(['堀上']);
    expect(s2.maybe.map(t => t.name)).toEqual(['石原']);
  });
});
