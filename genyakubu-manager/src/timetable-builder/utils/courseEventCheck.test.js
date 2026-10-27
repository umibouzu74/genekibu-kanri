import { describe, expect, it } from 'vitest';
import { checkCourseEvents, gradesFromTabName, ymdLabel } from './courseEventCheck';

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
