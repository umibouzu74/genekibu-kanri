import { describe, expect, it } from 'vitest';
import { formatSeasonRange, inferProjectSeason, summarizeSeasonProject } from './seasonProject';

const project = (dates, extra = {}) => ({
  version: 4,
  name: '',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  dates: dates.map((label, i) => ({ id: i + 1, label })),
  periods: [{ id: 1, label: '1限' }],
  tabs: [{ id: 1, name: '中3', config: { classes: [{ id: 1, label: '3S' }], subjectCounts: {} }, schedule: {} }],
  ...extra,
});

describe('inferProjectSeason', () => {
  it('使う日の月で決める', () => {
    expect(inferProjectSeason(project(['7/29(水)', '7/30(木)', '8/3(月)']))).toBe('summer');
    expect(inferProjectSeason(project(['12/25(金)', '12/26(土)', '1/6(水)']))).toBe('winter');
    expect(inferProjectSeason(project(['3/26(木)', '3/27(金)', '4/2(木)']))).toBe('spring');
  });

  it('夏期を冬期に作り替えている途中は、タブが使う日の多い方', () => {
    const p = project(['7/29(水)', '7/30(木)', '12/24(木)', '12/25(金)', '12/26(土)']);
    // 中3 タブは冬の 3 日だけ使う
    p.tabs[0].config.activeDateIds = [3, 4, 5];
    expect(inferProjectSeason(p)).toBe('winter');
  });

  it('タブが日付を使っていなければプール全体で決める', () => {
    const p = project(['7/29(水)', '7/30(木)']);
    p.tabs[0].config.activeDateIds = [];
    expect(inferProjectSeason(p)).toBe('summer');
  });

  it('日付が無ければ名前、それも無ければ最終編集日のころの講習', () => {
    expect(inferProjectSeason(project([], { name: '2027 春期講習' }))).toBe('spring');
    // 7/10 編集 → 夏期の準備中
    expect(inferProjectSeason(project([]))).toBe('summer');
    expect(inferProjectSeason(project([], { updatedAt: '2026-11-01T00:00:00.000Z' }))).toBe('winter');
  });

  it('2 月の入試直前の授業が多くても冬期 (2 月は春期にしない)', () => {
    expect(inferProjectSeason(project(['12/24(木)', '1/5(火)', '2/1(月)', '2/2(火)', '2/3(水)']))).toBe('winter');
  });

  it('同数のときは名前で決める', () => {
    expect(inferProjectSeason(project(['7/29(水)', '12/25(金)'], { name: '冬期' }))).toBe('winter');
  });

  it('壊れた / 空の入力でも季節を返す', () => {
    expect(inferProjectSeason(null, new Date(2026, 9, 23))).toBe('winter');
    expect(inferProjectSeason({ tabs: [] }, new Date(2026, 5, 1))).toBe('summer');
  });
});

describe('summarizeSeasonProject', () => {
  it('使う日の最初と最後 (年は最終編集日から)・使う日の数・入ったマスの数', () => {
    const p = project(['12/24(木)', '12/25(金)', '1/6(水)'], {
      name: '2026 冬期講習',
      updatedAt: '2026-11-20T00:00:00.000Z',
    });
    p.tabs[0].schedule = {
      'd1-p1-c1': { subject: '英語', teacher: '堀上' },
      'd2-p1-c1': { subject: '', teacher: '' },
      'd3-p1-c1': { subject: '数学' },
    };
    expect(summarizeSeasonProject(p)).toEqual({
      name: '2026 冬期講習',
      firstYmd: '2026-12-24',
      lastYmd: '2027-01-06',
      dateCount: 3,
      cellCount: 2,
      updatedAt: '2026-11-20T00:00:00.000Z',
    });
  });

  it('日付が無ければ期間は null', () => {
    const s = summarizeSeasonProject(project([]));
    expect(s.firstYmd).toBeNull();
    expect(s.lastYmd).toBeNull();
    expect(s.dateCount).toBe(0);
  });

  it('project でなければ null', () => {
    expect(summarizeSeasonProject(null)).toBeNull();
    expect(summarizeSeasonProject({})).toBeNull();
  });
});

describe('formatSeasonRange', () => {
  it('同じ年は後ろの年を省き、年をまたげば両方に書く', () => {
    expect(formatSeasonRange('2026-07-21', '2026-08-25')).toBe('2026/7/21〜8/25');
    expect(formatSeasonRange('2026-12-24', '2027-01-06')).toBe('2026/12/24〜2027/1/6');
    expect(formatSeasonRange('2026-07-21', '2026-07-21')).toBe('2026/7/21');
    expect(formatSeasonRange(null, null)).toBe('');
  });
});
