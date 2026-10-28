import { describe, expect, it } from 'vitest';
import { checkCourseEvents, gradesFromTabName, ymdLabel } from './courseEventCheck';
import { migrateProject } from './scheduleKey';
import { projectReducer } from '../hooks/projectReducer';

const P = (id, label) => ({ id, label });

// 2026 冬期講習: 中３ は 1/6 ではなく 1/7 を使う
function winter() {
  return {
    name: '2026 冬期講習　中123',
    updatedAt: '2026-10-27T00:00:00.000Z',
    dates: [P(1, '12/25(金)'), P(2, '12/26(土)'), P(3, '12/28(月)'), P(4, '1/4(月)'), P(5, '1/5(火)'), P(6, '1/6(水)'), P(7, '1/7(木)')],
    periods: [P(1, '1限 (13:00~14:00)'), P(2, '夜1 (18:30~19:15)')],
    tabs: [
      { id: 1, name: '中３', config: { classes: [], subjectCounts: {}, activeDateIds: [1, 2, 3, 4, 5, 7], activePeriodIds: [1] }, schedule: {} },
      { id: 2, name: '中1・中2', config: { classes: [], subjectCounts: {}, activeDateIds: [1, 2, 3, 4, 5, 6], activePeriodIds: [2] }, schedule: {} },
    ],
  };
}
const ev = (id, name, startDate, endDate, extra = {}) => ({ id, name, startDate, endDate, eventType: 'course', targetGrades: [], ...extra });

describe('gradesFromTabName', () => {
  it('タブ名の学年を読む', () => {
    expect(gradesFromTabName('中３')).toEqual(['中3']);
    expect(gradesFromTabName('中1・中2')).toEqual(['中1', '中2']);
    expect(gradesFromTabName('中1・2')).toEqual(['中1', '中2']);
    expect(gradesFromTabName('中123')).toEqual(['中1', '中2', '中3']);
    expect(gradesFromTabName('中学')).toEqual(['中1', '中2', '中3']);
    expect(gradesFromTabName('高1 英語')).toEqual(['高1']);
    expect(gradesFromTabName('メイン')).toEqual([]);
  });
});

describe('checkCourseEvents', () => {
  it('タブが行事予定の講習の期間の外の日を使っていれば、近い行事予定と一緒に知らせる (日曜は比べない)', () => {
    const { findings } = checkCourseEvents({
      project: winter(),
      specialEvents: [ev(1, '冬期講習（前半）', '2026-12-25', '2026-12-28'), ev(2, '冬期講習（後半）', '2027-01-04', '2027-01-06')],
    });
    expect(findings).toEqual([
      { kind: 'outside', tabNames: ['中３'], dates: ['1/7(木)'], eventName: '冬期講習（後半）', eventRange: '1/4〜1/6' },
    ]);
  });

  it('行事予定の学年に当たるタブがどれも使っていない日を知らせる', () => {
    const { findings } = checkCourseEvents({
      project: winter(),
      specialEvents: [
        ev(1, '冬期講習（前半）', '2026-12-25', '2026-12-28'),
        ev(2, '中3 冬期集中演習（後半）', '2027-01-04', '2027-01-06', { targetGrades: ['中3'] }),
        ev(3, '中1・2 冬期講習（後半）', '2027-01-04', '2027-01-06', { targetGrades: ['中1', '中2'] }),
      ],
    });
    expect(findings).toContainEqual({ kind: 'outside', tabNames: ['中３'], dates: ['1/7(木)'], eventName: '中3 冬期集中演習（後半）', eventRange: '1/4〜1/6' });
    expect(findings).toContainEqual({ kind: 'unused', tabNames: ['中３'], dates: ['1/6(水)'], eventName: '中3 冬期集中演習（後半）', eventRange: '1/4〜1/6' });
    expect(findings).toHaveLength(2);
  });

  it('塾の全体休講日・講習以外の種別・離れた季節の行事予定は比べない', () => {
    const { findings, events } = checkCourseEvents({
      project: winter(),
      specialEvents: [
        ev(1, '冬期講習', '2026-12-25', '2027-01-07'),
        { ...ev(2, '学校の冬休み', '2026-12-20', '2027-01-10'), eventType: 'school' },
        ev(3, '夏期講習', '2026-07-20', '2026-08-20'),
      ],
      holidays: [
        { date: '2026-12-29', scope: ['全部'] }, { date: '2026-12-30', scope: ['全部'] }, { date: '2026-12-31', scope: ['全部'] },
        { date: '2027-01-01', scope: ['全部'] }, { date: '2027-01-02', scope: ['全部'] },
        // 学年を絞った休講は全体休講ではない
        { date: '2026-12-26', scope: ['全部'], targetGrades: ['高1'] },
      ],
    });
    expect(events.map(e => e.name)).toEqual(['冬期講習']);
    // 12/27・1/3 は日曜、12/29〜1/2 は全体休講。残るのはどのタブも使わない日だけ
    expect(findings).toEqual([]);
  });

  it('講習の行事予定が無い・日付が無いときは何も出さない', () => {
    expect(checkCourseEvents({ project: winter(), specialEvents: [] }).findings).toEqual([]);
    expect(checkCourseEvents({ project: { ...winter(), dates: [] }, specialEvents: [ev(1, '冬期講習', '2026-12-25', '2026-12-28')] }).findings).toEqual([]);
  });

  it('ymdLabel', () => {
    expect(ymdLabel('2027-01-06')).toBe('1/6(水)');
  });
});

describe('行事予定とタブの結び付け (2026-10-27)', () => {
  // 冬期講習 (中３) + 直前ポイント 火木 / 水金 (1/12〜1/22) + 弱点補強 (土曜)
  const P2 = (id, label) => ({ id, label });
  const project = (tabOver = {}, over = {}) => ({
    name: '2026 冬期講習　中123',
    updatedAt: '2026-11-20T00:00:00.000Z',
    dates: [
      P2(1, '12/25(金)'), P2(2, '12/26(土)'),
      P2(10, '1/12(火)'), P2(11, '1/14(木)'), P2(12, '1/19(火)'), P2(13, '1/21(木)'),
      P2(20, '1/13(水)'), P2(21, '1/15(金)'), P2(22, '1/20(水)'), P2(23, '1/22(金)'),
      P2(30, '1/16(土)'), P2(31, '1/23(土)'),
    ],
    periods: [P2(1, '1限')],
    tabs: [
      { id: 1, name: '中３', config: { classes: [], subjectCounts: {}, activeDateIds: [1, 2], ...tabOver[1] }, schedule: {} },
      { id: 2, name: '中３直前 火木', config: { classes: [], subjectCounts: {}, activeDateIds: [10, 11, 12], ...tabOver[2] }, schedule: {} },
      { id: 3, name: '中３直前 水金', config: { classes: [], subjectCounts: {}, activeDateIds: [20, 21, 22, 23], ...tabOver[3] }, schedule: {} },
      { id: 4, name: '中３弱点補強', config: { classes: [], subjectCounts: {}, activeDateIds: [30, 31], ...tabOver[4] }, schedule: {} },
    ],
    ...over,
  });
  const events = [
    ev(1, '冬期講習', '2026-12-25', '2026-12-26', { targetGrades: ['中3'] }),
    ev(2, '直前ポイント 火木', '2027-01-12', '2027-01-22', { targetGrades: ['中3'] }),
    ev(3, '直前ポイント 水金', '2027-01-12', '2027-01-22', { targetGrades: ['中3'] }),
    ev(4, '弱点補強', '2027-01-16', '2027-01-23', { targetGrades: ['中3'] }),
  ];
  const linked = {
    2: { courseEventNames: ['直前ポイント 火木'] },
    3: { courseEventNames: ['直前ポイント水金'] }, // 空白の有無は同じ名前
    4: { courseEventNames: ['弱点補強'] },
  };

  it('結び付けが無いと、学年 (中3) が同じ別の講習の行事予定と比べてしまう', () => {
    const { findings } = checkCourseEvents({ project: project(), specialEvents: events });
    expect(findings.length).toBeGreaterThan(0);
  });

  it('結び付けたタブはその行事予定とだけ比べ、週ごとの講習はタブの曜日だけ比べる。食い違いは 1/21 → 抜けた木曜だけ', () => {
    const { findings } = checkCourseEvents({ project: project(linked), specialEvents: events });
    expect(findings).toEqual([
      { kind: 'unused', tabNames: ['中３直前 火木'], dates: ['1/21(木)'], eventName: '直前ポイント 火木', eventRange: '1/12〜1/22' },
    ]);
  });

  it('対象外にした行事予定は比べない (直前・弱点のタブを足す前の冬期講習)', () => {
    // 冬期講習は 1/7 まで (前後 2 週間の 1/21 までの行事予定と比べる)
    const only = {
      ...project(),
      dates: [P2(1, '12/25(金)'), P2(2, '12/26(土)'), P2(5, '1/7(木)')],
      tabs: [{ ...project().tabs[0], config: { classes: [], subjectCounts: {}, activeDateIds: [1, 2, 5] } }],
    };
    const winterEvents = [ev(1, '冬期講習', '2026-12-25', '2027-01-07', { targetGrades: ['中3'] }), ...events.slice(1)];
    const before = checkCourseEvents({ project: only, specialEvents: winterEvents, holidays: [] }).findings;
    expect(before.map(f => f.eventName)).toContain('直前ポイント 火木');
    const { findings, rows } = checkCourseEvents({
      project: { ...only, ignoredCourseEvents: ['直前ポイント 火木', '直前ポイント 水金', '弱点補強'] },
      specialEvents: winterEvents,
    });
    // 残るのは冬期講習との比べだけ (このタブは 12/25・26・1/7 しか使わない)
    expect(findings.map(f => f.eventName)).toEqual(['冬期講習']);
    expect(rows.filter(r => r.ignored).map(r => r.name)).toEqual(['直前ポイント 火木', '直前ポイント 水金', '弱点補強']);
  });

  it('名前から結び付けを提案する (学年を除いたタブ名と近い行事予定)', () => {
    const { rows } = checkCourseEvents({ project: project(), specialEvents: events });
    const byName = Object.fromEntries(rows.map(r => [r.name, r.suggestedTabIds]));
    expect(byName).toEqual({
      冬期講習: [],
      '直前ポイント 火木': [2],
      '直前ポイント 水金': [3],
      弱点補強: [4],
    });
  });
});

describe('結び付けの点検 (校正, 2026-10-28)', () => {
  it('見つからない名前への結び付けは無かったことにして比べ、外せるように一覧に出す', () => {
    const p = winter();
    p.tabs[0] = { ...p.tabs[0], config: { ...p.tabs[0].config, courseEventNames: ['冬期講習 後半'] } };
    const specialEvents = [ev(1, '冬期講習（前半）', '2026-12-25', '2026-12-28'), ev(2, '冬期講習（後半）', '2027-01-04', '2027-01-06')];
    const { findings, staleLinks, rows } = checkCourseEvents({ project: p, specialEvents });
    expect(findings).toContainEqual({ kind: 'outside', tabNames: ['中３'], dates: ['1/7(木)'], eventName: '冬期講習（後半）', eventRange: '1/4〜1/6' });
    expect(staleLinks).toEqual([{ tabId: 1, tabName: '中３', name: '冬期講習 後半' }]);
    expect(rows.every(r => r.linkedTabIds.length === 0)).toBe(true);
  });

  it('1 つの行事予定に火木・水金のタブ: 曜日はタブごとに決めて合わせる (月・土を比べない)', () => {
    const P3 = (id, label) => ({ id, label });
    const project = {
      name: '2026 冬期講習',
      updatedAt: '2026-11-20T00:00:00.000Z',
      dates: [P3(1, '1/12(火)'), P3(2, '1/14(木)'), P3(3, '1/19(火)'), P3(4, '1/21(木)'), P3(5, '1/13(水)'), P3(6, '1/15(金)'), P3(7, '1/20(水)'), P3(8, '1/22(金)')],
      periods: [P3(1, '夜1')],
      tabs: [
        { id: 1, name: '中３直前 火木', config: { classes: [], subjectCounts: {}, activeDateIds: [1, 2, 3, 4] }, schedule: {} },
        { id: 2, name: '中３直前 水金', config: { classes: [], subjectCounts: {}, activeDateIds: [5, 6, 7] }, schedule: {} },
      ],
    };
    const { findings } = checkCourseEvents({ project, specialEvents: [ev(1, '中3 直前ポイント', '2027-01-12', '2027-01-22', { targetGrades: ['中3'] })] });
    expect(findings).toEqual([
      { kind: 'unused', tabNames: ['中３直前 火木', '中３直前 水金'], dates: ['1/22(金)'], eventName: '中3 直前ポイント', eventRange: '1/12〜1/22' },
    ]);
  });

  it('毎日の講習で曜日が 3 つ以下でも、使う日が多ければ全曜日を比べる (入れ忘れを見逃さない)', () => {
    const P3 = (id, label) => ({ id, label });
    const project = {
      name: '2026 冬期講習',
      updatedAt: '2026-11-20T00:00:00.000Z',
      dates: [P3(1, '12/21(月)'), P3(2, '12/22(火)'), P3(3, '12/23(水)'), P3(4, '12/28(月)')],
      periods: [P3(1, '1限')],
      tabs: [{ id: 1, name: '中３', config: { classes: [], subjectCounts: {} }, schedule: {} }],
    };
    const { findings } = checkCourseEvents({ project, specialEvents: [ev(1, '冬期講習', '2026-12-21', '2026-12-28', { targetGrades: ['中3'] })] });
    expect(findings).toEqual([
      { kind: 'unused', tabNames: ['中３'], dates: ['12/24(木)', '12/25(金)', '12/26(土)'], eventName: '冬期講習', eventRange: '12/21〜12/28' },
    ]);
  });

  it('日・時限の無いタブの結び付けも結び付けとして出す (外せるように)', () => {
    const p = winter();
    p.tabs.push({ id: 3, name: '中３直前', config: { classes: [], subjectCounts: {}, activePeriodIds: [], courseEventNames: ['冬期講習（後半）'] }, schedule: {} });
    const { rows } = checkCourseEvents({ project: p, specialEvents: [ev(2, '冬期講習（後半）', '2027-01-04', '2027-01-06')] });
    expect(rows[0].linkedTabIds).toEqual([3]);
  });
});

describe('結び付けの保存 (reducer・読込)', () => {
  const tabs = [
    { id: 1, name: '中３', config: { classes: [], subjectCounts: {} }, schedule: {} },
    { id: 2, name: '中３直前 火木', config: { classes: [], subjectCounts: {} }, schedule: {} },
  ];
  const base = { version: 4, name: '', tabs, dates: [], periods: [], teachers: [] };
  const reduce = (project, action) => projectReducer({ project, history: [project], historyIndex: 0, loadError: null }, action).project;

  it('結び付ける・外す・まとめて結び付ける。表記ゆれは同じ名前', () => {
    let p = reduce(base, { type: 'courseEvents/setLink', payload: { tabId: 2, name: '直前ポイント 火木', linked: true } });
    expect(p.tabs[1].config.courseEventNames).toEqual(['直前ポイント 火木']);
    expect(reduce(p, { type: 'courseEvents/setLink', payload: { tabId: 2, name: '直前ポイント　火木', linked: true } })).toBe(p);
    p = reduce(p, { type: 'courseEvents/setLink', payload: { tabId: 2, name: '直前ポイント火木', linked: false } });
    expect('courseEventNames' in p.tabs[1].config).toBe(false);
    p = reduce(p, { type: 'courseEvents/linkMany', payload: { links: [{ tabId: 1, name: '冬期講習' }, { tabId: 2, name: '直前ポイント 火木' }] } });
    expect(p.tabs.map(t => t.config.courseEventNames)).toEqual([['冬期講習'], ['直前ポイント 火木']]);
  });

  it('タブを足しても開いているタブの結び付けは写さない', () => {
    let p = reduce({ ...base, activeTabId: 2 }, { type: 'courseEvents/setLink', payload: { tabId: 2, name: '直前ポイント 火木', linked: true } });
    p = reduce(p, { type: 'tab/add', payload: { name: '中３弱点補強' } });
    const added = p.tabs.find(t => t.name === '中３弱点補強');
    expect('courseEventNames' in added.config).toBe(false);
    expect(p.tabs[1].config.courseEventNames).toEqual(['直前ポイント 火木']);
  });

  it('対象外にすると結び付けも外し、結び付けると対象外から外す', () => {
    let p = reduce(base, { type: 'courseEvents/setLink', payload: { tabId: 2, name: '弱点補強', linked: true } });
    p = reduce(p, { type: 'courseEvents/setIgnored', payload: { name: '弱点補強', ignored: true } });
    expect(p.ignoredCourseEvents).toEqual(['弱点補強']);
    expect('courseEventNames' in p.tabs[1].config).toBe(false);
    p = reduce(p, { type: 'courseEvents/setLink', payload: { tabId: 1, name: '弱点補強', linked: true } });
    expect('ignoredCourseEvents' in p).toBe(false);
  });

  it('読込: 文字列だけ・重複なし・空なら持たない', () => {
    const migrated = migrateProject({
      ...base,
      ignoredCourseEvents: [' 冬期講習 ', 3, '冬期講習', ''],
      tabs: [
        { ...tabs[0], config: { ...tabs[0].config, courseEventNames: [] } },
        { ...tabs[1], config: { ...tabs[1].config, courseEventNames: ['直前', null] } },
      ],
    });
    expect(migrated.ignoredCourseEvents).toEqual(['冬期講習']);
    expect('courseEventNames' in migrated.tabs[0].config).toBe(false);
    expect(migrated.tabs[1].config.courseEventNames).toEqual(['直前']);
  });
});
