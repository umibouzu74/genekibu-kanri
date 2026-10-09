import { describe, expect, it } from 'vitest';
import { parseDateLabel, projectBaseYmd, resolveDateLabelYmd, resolveDateLabelsYmd, usedDateLabels } from './courseDates';

const P = (id, label) => ({ id, label });

describe('parseDateLabel', () => {
  it('M/D と曜日を読む (全角括弧も)', () => {
    expect(parseDateLabel('7/29(水)')).toEqual({ month: 7, day: 29, weekday: 3 });
    expect(parseDateLabel('12/25（金）')).toEqual({ month: 12, day: 25, weekday: 5 });
    expect(parseDateLabel('8/6')).toEqual({ month: 8, day: 6, weekday: null });
    expect(parseDateLabel('補講日')).toBeNull();
    expect(parseDateLabel('13/1')).toBeNull();
  });
});

describe('resolveDateLabelYmd', () => {
  it('夏期・冬期 (年またぎ)・春期の基本', () => {
    expect(resolveDateLabelYmd('7/29(水)', '2026-07-01')).toBe('2026-07-29');
    expect(resolveDateLabelYmd('12/25(金)', '2026-11-15')).toBe('2026-12-25');
    expect(resolveDateLabelYmd('1/7(木)', '2026-11-15')).toBe('2027-01-07');
    expect(resolveDateLabelYmd('3/25(木)', '2026-12-10')).toBe('2027-03-25');
  });

  it('講習が終わって数か月後に開いても、曜日の合う年 (半年以内) に置く', () => {
    // 最終編集 2027-05-01: 曜日を見ないと 12/24 は 2027-12-24 (先) に化ける
    expect(resolveDateLabelYmd('12/24(木)', '2027-05-01')).toBe('2026-12-24');
    // 前の夏の日付を冬 (12 月) に開いても翌年 7 月にしない
    expect(resolveDateLabelYmd('7/29(水)', '2026-12-20')).toBe('2026-07-29');
  });

  it('半年より前の曜日は信じない (前年の既定ラベルを 1 年前へ飛ばさない)', () => {
    // 2025-12-25 は木曜。基準日 2026-11-15 からは 300 日以上前
    expect(resolveDateLabelYmd('12/25(木)', '2026-11-15')).toBe('2026-12-25');
  });

  it('1 年近く先の年に合う曜日も信じない (曜日の打ち間違いで 1 年先へ飛ばさない)', () => {
    // 2027-12-25 は土曜だが基準日 2026-11-15 から 400 日先 → 近い年 (2026) を採る
    expect(resolveDateLabelYmd('12/25(土)', '2026-11-15')).toBe('2026-12-25');
    expect(resolveDateLabelYmd('7/29(木)', '2026-07-01')).toBe('2026-07-29');
  });

  it('不正な入力は null', () => {
    expect(resolveDateLabelYmd('補講日', '2026-07-01')).toBeNull();
    expect(resolveDateLabelYmd('2/30(月)', '2026-02-01')).toBeNull();
    expect(resolveDateLabelYmd('7/24(金)', 'invalid')).toBeNull();
  });
});

describe('resolveDateLabelsYmd (講習の日付をまとめて解決)', () => {
  const winter = ['12/22(火)', '12/26(土)', '1/4(月)', '1/7(木)'];

  it('年は季節ごとに 1 回だけ決める (講習の半年後の編集でも途中で割れない)', () => {
    // 2027-06-21〜07-06 に編集すると、ラベルごとに決めていたころは 12 月だけ翌年へ移った
    for (const base of ['2027-06-21', '2027-06-30', '2027-07-05']) {
      const m = resolveDateLabelsYmd(winter, base);
      expect(winter.map(l => m.get(l))).toEqual(['2026-12-22', '2026-12-26', '2027-01-04', '2027-01-07']);
    }
  });

  it('曜日の打ち間違いが 1 つあっても、過半数の曜日が合う年に置く', () => {
    const labels = ['12/22(火)', '12/26(日)', '1/4(月)', '1/7(木)'];
    const m = resolveDateLabelsYmd(labels, '2027-03-01');
    expect(labels.map(l => m.get(l))).toEqual(['2026-12-22', '2026-12-26', '2027-01-04', '2027-01-07']);
  });

  it('読めないラベルは null。重複は 1 つにまとまる', () => {
    const m = resolveDateLabelsYmd(['7/29(水)', '補講日', '7/29(水)'], '2026-07-01');
    expect([...m.entries()]).toEqual([['7/29(水)', '2026-07-29'], ['補講日', null]]);
    expect(resolveDateLabelsYmd(['7/29(水)'], 'invalid').get('7/29(水)')).toBeNull();
  });
});

describe('projectBaseYmd', () => {
  it('updatedAt → createdAt → fallback → null', () => {
    expect(projectBaseYmd({ updatedAt: '2026-07-10T01:00:00Z', createdAt: '2026-06-01' }, '2000-01-01')).toBe('2026-07-10');
    expect(projectBaseYmd({ createdAt: '2026-06-01T00:00:00Z' }, '2000-01-01')).toBe('2026-06-01');
    expect(projectBaseYmd({}, '2000-01-01T09:00:00')).toBe('2000-01-01');
    expect(projectBaseYmd({}, null)).toBeNull();
  });
});

describe('usedDateLabels', () => {
  it('どれかのタブが授業に使う日だけ (使う時限が 0 のタブ・使われない日は除く)', () => {
    const project = {
      dates: [P(1, '7/29(水)'), P(2, '12/25(金)'), P(3, '1/7(木)')],
      periods: [P(1, '1限')],
      tabs: [
        { id: 1, name: '中3', schedule: {}, config: { classes: [], subjectCounts: {}, activeDateIds: [2, 3] } },
        { id: 2, name: '空', schedule: {}, config: { classes: [], subjectCounts: {}, activeDateIds: [1], activePeriodIds: [] } },
      ],
    };
    expect([...usedDateLabels(project)].sort()).toEqual(['1/7(木)', '12/25(金)']);
  });

  it('activeDateIds 未指定のタブはプール全日を使う', () => {
    const project = {
      dates: [P(1, '7/29(水)'), P(2, '7/30(木)')],
      periods: [P(1, '1限')],
      tabs: [{ id: 1, name: '中3', schedule: {}, config: { classes: [], subjectCounts: {} } }],
    };
    expect(usedDateLabels(project).size).toBe(2);
    expect(usedDateLabels(null).size).toBe(0);
  });
});
