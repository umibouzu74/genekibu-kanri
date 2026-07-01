import { describe, expect, it } from 'vitest';
import { generateDateLabels, sortPoolDatesByCalendar, ymdToLabel } from './dateGenerate';

describe('ymdToLabel', () => {
  it('YYYY-MM-DD を M/D(曜) に変換', () => {
    expect(ymdToLabel('2026-07-24')).toBe('7/24(金)');
    expect(ymdToLabel('2026-12-25')).toBe('12/25(金)');
  });
  it('不正な入力は null', () => {
    expect(ymdToLabel('2026-13-01')).toBeNull();
    expect(ymdToLabel('2026-02-30')).toBeNull();
    expect(ymdToLabel('oops')).toBeNull();
    expect(ymdToLabel('')).toBeNull();
  });
});

describe('generateDateLabels', () => {
  it('期間内の全日を昇順で返す (曜日指定なし)', () => {
    const labels = generateDateLabels({ startYmd: '2026-07-24', endYmd: '2026-07-27' });
    expect(labels).toEqual(['7/24(金)', '7/25(土)', '7/26(日)', '7/27(月)']);
  });

  it('対象曜日だけに絞る (月〜金)', () => {
    // 2026-07-24(金)〜07-30(木)。平日 (月火水木金) = 金,月,火,水,木
    const labels = generateDateLabels({
      startYmd: '2026-07-24', endYmd: '2026-07-30',
      weekdays: [1, 2, 3, 4, 5],
    });
    expect(labels).toEqual(['7/24(金)', '7/27(月)', '7/28(火)', '7/29(水)', '7/30(木)']);
  });

  it('除外日を取り除く (歯抜けの日)', () => {
    const labels = generateDateLabels({
      startYmd: '2026-07-24', endYmd: '2026-07-27',
      excludeYmd: ['2026-07-26'],
    });
    expect(labels).toEqual(['7/24(金)', '7/25(土)', '7/27(月)']);
  });

  it('曜日 + 除外日の併用', () => {
    const labels = generateDateLabels({
      startYmd: '2026-07-24', endYmd: '2026-07-31',
      weekdays: [1, 2, 3, 4, 5],
      excludeYmd: ['2026-07-29'], // 水曜を除外
    });
    expect(labels).toEqual(['7/24(金)', '7/27(月)', '7/28(火)', '7/30(木)', '7/31(金)']);
  });

  it('start > end は空配列', () => {
    expect(generateDateLabels({ startYmd: '2026-07-30', endYmd: '2026-07-24' })).toEqual([]);
  });

  it('不正・未指定入力は空配列', () => {
    expect(generateDateLabels({})).toEqual([]);
    expect(generateDateLabels({ startYmd: '2026-07-24' })).toEqual([]);
    expect(generateDateLabels({ startYmd: 'x', endYmd: 'y' })).toEqual([]);
  });

  it('単日 (start = end)', () => {
    expect(generateDateLabels({ startYmd: '2026-07-24', endYmd: '2026-07-24' })).toEqual(['7/24(金)']);
  });

  it('月をまたぐ範囲', () => {
    const labels = generateDateLabels({ startYmd: '2026-07-30', endYmd: '2026-08-02' });
    expect(labels).toEqual(['7/30(木)', '7/31(金)', '8/1(土)', '8/2(日)']);
  });
});

describe('sortPoolDatesByCalendar', () => {
  it('挿入順がバラバラでも実日付順に並べ替える', () => {
    const pool = [
      { id: 1, label: '8/1(土)' },
      { id: 2, label: '7/24(金)' },
      { id: 3, label: '7/31(金)' },
    ];
    expect(sortPoolDatesByCalendar(pool).map(d => d.id)).toEqual([2, 3, 1]);
  });

  it('年をまたぐ講習 (12月と1月が混在) は12月を先に並べる', () => {
    const pool = [
      { id: 1, label: '1/6(火)' },
      { id: 2, label: '12/25(木)' },
      { id: 3, label: '1/5(月)' },
      { id: 4, label: '12/26(金)' },
    ];
    expect(sortPoolDatesByCalendar(pool).map(d => d.id)).toEqual([2, 4, 3, 1]);
  });

  it('12月のみ・1月のみなど混在しない場合は年またぎ扱いにしない (月の値どおりに比較)', () => {
    const pool = [
      { id: 1, label: '1/10(土)' },
      { id: 2, label: '1/3(土)' },
    ];
    expect(sortPoolDatesByCalendar(pool).map(d => d.id)).toEqual([2, 1]);
  });

  it('M/D として解釈できないラベルは末尾に元の順序のまま残る', () => {
    const pool = [
      { id: 1, label: 'D1' },
      { id: 2, label: '7/24(金)' },
      { id: 3, label: 'D2' },
    ];
    expect(sortPoolDatesByCalendar(pool).map(d => d.id)).toEqual([2, 1, 3]);
  });

  it('引数の配列は変更しない (非破壊)', () => {
    const pool = [{ id: 1, label: '8/1(土)' }, { id: 2, label: '7/24(金)' }];
    const original = [...pool];
    sortPoolDatesByCalendar(pool);
    expect(pool).toEqual(original);
  });

  it('空/未指定は空配列', () => {
    expect(sortPoolDatesByCalendar([])).toEqual([]);
    expect(sortPoolDatesByCalendar(undefined)).toEqual([]);
  });
});
