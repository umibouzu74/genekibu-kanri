// E1d: 2 つの schedule (同一タブ・同一 config 前提) のセル単位の差分を出す純粋関数。
//
// schedule は { [key]: { subject, teacher, locked } } の map。
// 中身の比較は subject + teacher のみで行う (locked は UI フラグなので無視)。
// subject が空 / 無いセルは「未割当」として扱う。
//
// diffSchedules(from, to): from → to へ変化したセルの一覧を返す。
//   返り値: Array<{ key, type, before, after }>
//     - type 'added':   from に無く to にある (新たに割当)
//     - type 'removed': from にあり to に無い (割当が消えた)
//     - type 'changed': 両方にあるが subject か teacher が違う
//   before / after は { subject, teacher } | null。

import type { Schedule, ScheduleEntry } from '../types';

export type NormalizedEntry = { subject: string; teacher: string } | null;
export type DiffType = 'added' | 'removed' | 'changed';
export interface ScheduleDiff {
  key: string;
  type: DiffType;
  before: NormalizedEntry;
  after: NormalizedEntry;
}

const normalize = (entry: ScheduleEntry | undefined): NormalizedEntry => {
  if (!entry || !entry.subject) return null;
  return { subject: entry.subject, teacher: entry.teacher || '' };
};

const sameEntry = (a: NormalizedEntry, b: NormalizedEntry) => {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.subject === b.subject && a.teacher === b.teacher;
};

export function diffSchedules(from: Schedule | null | undefined, to: Schedule | null | undefined): ScheduleDiff[] {
  const fromMap = from || {};
  const toMap = to || {};
  const keys = new Set([...Object.keys(fromMap), ...Object.keys(toMap)]);
  const diffs: ScheduleDiff[] = [];
  for (const key of keys) {
    const before = normalize(fromMap[key]);
    const after = normalize(toMap[key]);
    if (sameEntry(before, after)) continue;
    let type: DiffType;
    if (before === null) type = 'added';
    else if (after === null) type = 'removed';
    else type = 'changed';
    diffs.push({ key, type, before, after });
  }
  return diffs;
}

// 差分の種別ごとの件数を集計する。
export function summarizeDiff(diffs: ScheduleDiff[]): { added: number; removed: number; changed: number; total: number } {
  const counts = { added: 0, removed: 0, changed: 0, total: diffs.length };
  for (const d of diffs) {
    // 型上は DiffType のみだが、外部 JSON 等の untyped 経路に備えて runtime でも絞る
    if (d.type === 'added' || d.type === 'removed' || d.type === 'changed') counts[d.type] += 1;
  }
  return counts;
}
