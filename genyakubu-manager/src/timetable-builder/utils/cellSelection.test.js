import { describe, expect, it } from 'vitest';
import { computeRectKeys } from './cellSelection';
import { makeKey } from './scheduleKey';

const config = {
  dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
  periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
  classes: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }],
};

describe('computeRectKeys (N2a)', () => {
  it('アンカー〜ターゲットの矩形内の全キーを返す (行 = 日付×時限、列 = クラス)', () => {
    // 12/25 1限 A 〜 12/25 2限 B → 2 行 × 2 列 = 4 セル
    const keys = computeRectKeys(config, makeKey(1, 1, 1), makeKey(1, 2, 2));
    expect(keys).toEqual([
      makeKey(1, 1, 1), makeKey(1, 1, 2),
      makeKey(1, 2, 1), makeKey(1, 2, 2),
    ]);
  });

  it('逆方向 (右下 → 左上) でも同じ矩形になる', () => {
    const forward = computeRectKeys(config, makeKey(1, 1, 1), makeKey(2, 1, 3));
    const backward = computeRectKeys(config, makeKey(2, 1, 3), makeKey(1, 1, 1));
    expect(new Set(backward)).toEqual(new Set(forward));
    // 日付をまたぐ: (1,1)(1,2)(2,1) の 3 行 × 3 列 = 9 セル
    expect(forward).toHaveLength(9);
  });

  it('アンカーなし・config に無いキーはターゲット単体にフォールバック', () => {
    expect(computeRectKeys(config, null, makeKey(1, 1, 1))).toEqual([makeKey(1, 1, 1)]);
    expect(computeRectKeys(config, makeKey(9, 9, 9), makeKey(1, 1, 1))).toEqual([makeKey(1, 1, 1)]);
    expect(computeRectKeys(config, makeKey(1, 1, 1), 'garbage')).toEqual(['garbage']);
  });

  it('同一セルなら 1 件', () => {
    expect(computeRectKeys(config, makeKey(2, 2, 2), makeKey(2, 2, 2))).toEqual([makeKey(2, 2, 2)]);
  });
});
