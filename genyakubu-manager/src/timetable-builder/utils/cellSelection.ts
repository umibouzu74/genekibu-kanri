// N2a: セルの複数選択の矩形計算。
//
// グリッドの表示順は「行 = 日付 × 時限 (日付ごとに時限が並ぶ)、列 = クラス」。
// Shift+クリックの範囲選択は、アンカーとターゲットをこの 2 次元に写像した
// 矩形内の全セルとする (Excel の Shift+クリックと同じ感覚)。
import { makeKey, parseKey } from './scheduleKey';
import type { Entity } from '../types';

export interface SelectionConfig {
  dates: Entity[];
  periods: Entity[];
  classes: Entity[];
}

// アンカー〜ターゲットの矩形内の schedule key 一覧を表示順で返す。
// どちらかのキーが現在の config に存在しない (タブ切替や設定変更で古くなった)
// 場合はターゲット単体にフォールバックする。
export function computeRectKeys(
  config: SelectionConfig | null | undefined,
  anchorKey: string | null | undefined,
  targetKey: string,
): string[] {
  const target = parseKey(targetKey);
  if (!config || !target) return targetKey ? [targetKey] : [];
  const anchor = anchorKey ? parseKey(anchorKey) : null;
  const dates = config.dates || [];
  const periods = config.periods || [];
  const classes = config.classes || [];

  const rowIndexOf = (dateId: number, periodId: number): number => {
    const di = dates.findIndex(d => d.id === dateId);
    const pi = periods.findIndex(p => p.id === periodId);
    if (di < 0 || pi < 0) return -1;
    return di * periods.length + pi;
  };
  const colIndexOf = (classId: number): number => classes.findIndex(c => c.id === classId);

  const tRow = rowIndexOf(target.dateId, target.periodId);
  const tCol = colIndexOf(target.classId);
  if (tRow < 0 || tCol < 0) return [targetKey];
  const aRow = anchor ? rowIndexOf(anchor.dateId, anchor.periodId) : -1;
  const aCol = anchor ? colIndexOf(anchor.classId) : -1;
  if (aRow < 0 || aCol < 0) return [targetKey];

  const keys: string[] = [];
  for (let r = Math.min(aRow, tRow); r <= Math.max(aRow, tRow); r++) {
    const d = dates[Math.floor(r / periods.length)];
    const p = periods[r % periods.length];
    if (!d || !p) continue;
    for (let c = Math.min(aCol, tCol); c <= Math.max(aCol, tCol); c++) {
      const cls = classes[c];
      if (!cls) continue;
      keys.push(makeKey(d.id, p.id, cls.id));
    }
  }
  return keys;
}
