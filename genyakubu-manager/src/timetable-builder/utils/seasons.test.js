import { describe, expect, it } from 'vitest';
import {
  KOSHU_SEASONS,
  defaultKoshuSeason,
  isKoshuSeason,
  seasonOfMonth,
  seasonStorage,
  suggestSeasonProjectName,
  upcomingSeasonYear,
} from './seasons';

const d = (y, m, day) => new Date(y, m - 1, day, 12);

describe('季節の定義', () => {
  it('春期 → 夏期 → 冬期 の順', () => {
    expect(KOSHU_SEASONS.map(s => s.key)).toEqual(['spring', 'summer', 'winter']);
    expect(KOSHU_SEASONS.map(s => s.label)).toEqual(['春期講習', '夏期講習', '冬期講習']);
  });

  it('isKoshuSeason は 3 つだけ', () => {
    expect(isKoshuSeason('winter')).toBe(true);
    expect(isKoshuSeason('autumn')).toBe(false);
    expect(isKoshuSeason(null)).toBe(false);
  });
});

describe('seasonStorage', () => {
  it('季節ごとに別のキー / ノード。RTDB のパスに "." を使わない', () => {
    const keys = KOSHU_SEASONS.map(s => seasonStorage(s.key));
    expect(new Set(keys.map(k => k.storageKey)).size).toBe(3);
    expect(new Set(keys.map(k => k.firebasePath)).size).toBe(3);
    expect(seasonStorage('winter')).toEqual({
      season: 'winter',
      storageKey: 'builder.schedule_project.winter',
      backupKey: 'builder.schedule_project_corrupt.winter',
      firebasePath: 'appData/builder/schedule_project_winter',
      presenceChannel: 'builder.tab_presence.winter',
    });
    for (const k of keys) expect(k.firebasePath.split('/').every(seg => !seg.includes('.'))).toBe(true);
  });

  it('旧版の単一 project のキーとは重ならない', () => {
    for (const s of KOSHU_SEASONS) {
      expect(seasonStorage(s.key).storageKey).not.toBe('builder.schedule_project');
      expect(seasonStorage(s.key).firebasePath).not.toBe('appData/builder/schedule_project');
    }
  });
});

describe('seasonOfMonth', () => {
  it('3〜5 月 = 春期、6〜9 月 = 夏期、10〜2 月 = 冬期 (2 月の入試直前の授業は冬期の時間割)', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(seasonOfMonth)).toEqual([
      'winter', 'winter', 'spring', 'spring', 'spring',
      'summer', 'summer', 'summer', 'summer',
      'winter', 'winter', 'winter',
    ]);
  });
});

describe('defaultKoshuSeason (次に来る講習)', () => {
  it.each([
    [d(2026, 10, 23), 'winter'],
    [d(2026, 12, 25), 'winter'],
    [d(2027, 1, 7), 'winter'],
    [d(2027, 1, 10), 'winter'],
    [d(2027, 1, 11), 'spring'],
    [d(2027, 3, 28), 'spring'],
    [d(2027, 4, 10), 'spring'],
    [d(2027, 4, 11), 'summer'],
    [d(2027, 8, 31), 'summer'],
    [d(2027, 9, 1), 'winter'],
  ])('%s → %s', (date, season) => {
    expect(defaultKoshuSeason(date)).toBe(season);
  });
});

describe('upcomingSeasonYear / suggestSeasonProjectName', () => {
  it('10 月に作る冬期は今年、春期・夏期は翌年', () => {
    const now = d(2026, 10, 23);
    expect(upcomingSeasonYear('winter', now)).toBe(2026);
    expect(upcomingSeasonYear('spring', now)).toBe(2027);
    expect(upcomingSeasonYear('summer', now)).toBe(2027);
    expect(suggestSeasonProjectName('winter', now)).toBe('2026 冬期講習');
  });

  it('1 月の冬期の最中は前の年の冬期、それを過ぎたら次の冬期', () => {
    expect(upcomingSeasonYear('winter', d(2027, 1, 5))).toBe(2026);
    expect(upcomingSeasonYear('winter', d(2027, 1, 20))).toBe(2027);
  });

  it('春期の最中・夏期の最中はその年', () => {
    expect(upcomingSeasonYear('spring', d(2027, 3, 30))).toBe(2027);
    expect(upcomingSeasonYear('summer', d(2027, 8, 1))).toBe(2027);
  });
});
