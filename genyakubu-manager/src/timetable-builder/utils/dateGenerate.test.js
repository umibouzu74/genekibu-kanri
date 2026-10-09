import { describe, expect, it } from 'vitest';
import { expandExcludeInput, generateDateLabels, seasonStartMonth, sortPoolDatesByCalendar, ymdToLabel } from './dateGenerate';

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

  it('春期講習に前の冬の日付が残っていても、冬 → 春の順で季節ごとにまとまる', () => {
    // 旧実装は「10〜12 月と 1〜3 月の混在 = 1〜3 月を翌年」だったため、
    // 4 月が 12 月より前に並び、3/25〜4/7 の範囲指定が冬の日付を巻き込んでいた
    const pool = [
      { id: 1, label: '3/25(木)' },
      { id: 2, label: '4/1(木)' },
      { id: 3, label: '12/24(木)' },
      { id: 4, label: '1/7(木)' },
      { id: 5, label: '3/31(水)' },
      { id: 6, label: '4/7(水)' },
    ];
    expect(sortPoolDatesByCalendar(pool).map(d => d.label)).toEqual([
      '12/24(木)', '1/7(木)', '3/25(木)', '3/31(水)', '4/1(木)', '4/7(水)',
    ]);
  });

  it('夏期の日付が残った冬期: 夏 → 冬 (12 → 1 月) の順', () => {
    const pool = [
      { id: 1, label: '1/7(木)' },
      { id: 2, label: '7/29(水)' },
      { id: 3, label: '12/25(金)' },
      { id: 4, label: '8/13(木)' },
    ];
    expect(sortPoolDatesByCalendar(pool).map(d => d.label)).toEqual(['7/29(水)', '8/13(木)', '12/25(金)', '1/7(木)']);
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

describe('seasonStartMonth', () => {
  it('使われていない月が最も長く続く区間の直後が始まり', () => {
    expect(seasonStartMonth([7, 8])).toBe(7);
    expect(seasonStartMonth([12, 1])).toBe(12);
    expect(seasonStartMonth([3, 4])).toBe(3);
    expect(seasonStartMonth([12, 1, 3, 4])).toBe(12);
    expect(seasonStartMonth([7, 8, 12, 1])).toBe(7);
    expect(seasonStartMonth([11, 12, 1, 2])).toBe(11);
  });

  it('1 か月だけならその月、12 か月すべてなら 1 月、無ければ null', () => {
    expect(seasonStartMonth([1])).toBe(1);
    expect(seasonStartMonth([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe(1);
    expect(seasonStartMonth([])).toBeNull();
    expect(seasonStartMonth([undefined, null])).toBeNull();
  });
});

describe('expandExcludeInput', () => {
  const winter = { startYmd: '2026-12-21', endYmd: '2027-01-08' };

  it('従来どおり YYYY-MM-DD のカンマ区切り', () => {
    expect(expandExcludeInput('2026-07-29, 2026-08-13')).toEqual({
      excludeYmd: ['2026-07-29', '2026-08-13'], invalid: [], outside: [],
    });
  });

  it('期間 (〜 / ~ / ～) と 「、」・空白の区切り', () => {
    expect(expandExcludeInput('2026-12-29〜2026-12-31、2027/1/2~2027/1/3', winter).excludeYmd).toEqual([
      '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-02', '2027-01-03',
    ]);
  });

  it('年なしの期間は生成する期間の中で当てはめる (年末年始の 12/29〜1/3)', () => {
    expect(expandExcludeInput('12/29〜1/3', winter).excludeYmd).toEqual([
      '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
    expect(expandExcludeInput('12/24', winter).excludeYmd).toEqual(['2026-12-24']);
  });

  it('読めない語・逆順の期間は invalid に返す (黙って無視しない)', () => {
    const r = expandExcludeInput('2026-13-01, あした, 2026-12-31〜2026-12-29', winter);
    expect(r.excludeYmd).toEqual([]);
    expect(r.invalid).toEqual(['2026-13-01', 'あした', '2026-12-31〜2026-12-29']);
  });

  it('実在しない月日 (2/30・11/31) も invalid。2/29 はうるう年の日付として読む', () => {
    const r = expandExcludeInput('2/30, 11/31〜12/2, 2/29', { startYmd: '2028-02-01', endYmd: '2028-03-05' });
    expect(r.invalid).toEqual(['2/30', '11/31〜12/2']);
    expect(r.excludeYmd).toEqual(['2028-02-29']);
  });

  it('期間の前後の空白・全角の数字や記号・日付ラベルの曜日もそのまま読める', () => {
    const expected = ['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'];
    expect(expandExcludeInput('12/29 〜 1/3', winter)).toEqual({ excludeYmd: expected, invalid: [], outside: [] });
    expect(expandExcludeInput('１２/２９～１/３', winter).excludeYmd).toEqual(expected);
    expect(expandExcludeInput('12/29(火)〜1/3(日)', winter).excludeYmd).toEqual(expected);
    expect(expandExcludeInput('12/24（木）', winter).excludeYmd).toEqual(['2026-12-24']);
  });

  it('年なしで生成する期間の中に当たる日が無い語は outside に返す (打ち間違いに気付けるように)', () => {
    const r = expandExcludeInput('1/11, 8/10〜8/16, 12/31', winter);
    expect(r.outside).toEqual(['1/11', '8/10〜8/16']);
    expect(r.excludeYmd).toEqual(['2026-12-31']);
    expect(r.invalid).toEqual([]);
    // 期間がまだ入っていないときは判定しない
    expect(expandExcludeInput('1/11').outside).toEqual([]);
  });

  it('空・未指定は何も除外しない', () => {
    expect(expandExcludeInput('', winter)).toEqual({ excludeYmd: [], invalid: [], outside: [] });
    expect(expandExcludeInput(undefined)).toEqual({ excludeYmd: [], invalid: [], outside: [] });
  });

  it('generateDateLabels と組み合わせて冬期の日付を作れる', () => {
    const { excludeYmd } = expandExcludeInput('12/29〜1/3', { startYmd: '2026-12-24', endYmd: '2027-01-07' });
    expect(generateDateLabels({ startYmd: '2026-12-24', endYmd: '2027-01-07', weekdays: [1, 2, 3, 4, 5, 6], excludeYmd })).toEqual([
      '12/24(木)', '12/25(金)', '12/26(土)', '12/28(月)', '1/4(月)', '1/5(火)', '1/6(水)', '1/7(木)',
    ]);
  });
});
