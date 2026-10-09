// 出勤可能調査の回答 (Teacher.availability) の「形」だけを扱う無依存モジュール。
//
// scheduleKey (読込時の正規化) / dateLabelUnify / projectReducer (ラベルの
// 改名・削除の追従) から使うため、scheduleKey 等を import しない (循環防止。
// generationParams と同じ扱い)。調査の対象マスや紙面の組み立てなど、他の
// ユーティリティに依存する部分は availability.ts。
//
// 回答は「日付ラベル → 時限ラベル → 記号」の入れ子。未記入はキーが無いことで
// 表し、空になった日付・講師はキーごと消す (「回答が無い」と「全部未記入」を
// 区別しない)。
import type { AvailabilityMap, AvailabilityMark, Teacher } from '../types';

export function isAvailabilityMark(v: unknown): v is AvailabilityMark {
  return v === 'ok' || v === 'maybe' || v === 'ng';
}

export interface AvailabilityCell {
  date: string;
  period: string;
}

// cells の記号をまとめて mark にする (mark=null で未記入へ戻す)。何も
// 変わらなければ入力の参照をそのまま返す (reducer の no-op 判定用)。
// 結果が空なら undefined (講師からフィールドごと消す)。
export function applyAvailabilityMarks(
  map: AvailabilityMap | undefined,
  cells: AvailabilityCell[],
  mark: AvailabilityMark | null,
): AvailabilityMap | undefined {
  let next: AvailabilityMap | null = null;
  // この呼び出しで複製済みの日付 (同じ日の複数マスで何度も複製しない)
  const cloned = new Set<string>();
  const ensureDate = (date: string): Record<string, AvailabilityMark> => {
    if (!next) next = { ...(map || {}) };
    if (!cloned.has(date)) {
      next[date] = { ...(next[date] || {}) };
      cloned.add(date);
    }
    return next[date];
  };
  for (const cell of cells || []) {
    if (!cell || !cell.date || !cell.period) continue;
    const { date, period } = cell;
    const current = (next || map || {})[date]?.[period];
    if (mark == null) {
      if (current === undefined) continue;
      const byPeriod = ensureDate(date);
      delete byPeriod[period];
      if (Object.keys(byPeriod).length === 0) {
        delete next![date];
        cloned.delete(date);
      }
    } else {
      if (current === mark) continue;
      ensureDate(date)[period] = mark;
    }
  }
  if (!next) return map;
  return Object.keys(next).length === 0 ? undefined : next;
}

// 講師に回答を書き戻す。空ならフィールドごと消す (未回答と同じ形にする)。
export function withAvailability(teacher: Teacher, map: AvailabilityMap | undefined): Teacher {
  if (map && Object.keys(map).length > 0) {
    return teacher.availability === map ? teacher : { ...teacher, availability: map };
  }
  if (teacher.availability === undefined) return teacher;
  const { availability: _dropped, ...rest } = teacher;
  return rest as Teacher;
}

// 全講師の回答に同じ変換をかける (ラベルの改名・削除の追従)。変化が無ければ
// 入力の配列をそのまま返す。
export function mapTeachersAvailability(
  teachers: Teacher[],
  fn: (map: AvailabilityMap) => AvailabilityMap | undefined,
): Teacher[] {
  let changed = false;
  const out = (teachers || []).map(t => {
    if (!t?.availability) return t;
    const next = fn(t.availability);
    if (next === t.availability) return t;
    changed = true;
    return withAvailability(t, next);
  });
  return changed ? out : teachers;
}

// ─── ラベルの改名・削除への追従 ─────────────────────────────

// 日付ラベルの改名。改名先に既に回答がある日はマスごとに既存 (改名先) を優先
// してマージする (日付ラベル統一で「8/6」と「8/6(木)」が合流するケース)。
export function renameAvailabilityDate(
  map: AvailabilityMap | undefined,
  oldLabel: string,
  newLabel: string,
): AvailabilityMap | undefined {
  if (!map || oldLabel === newLabel || !map[oldLabel]) return map;
  const next = { ...map };
  const moved = next[oldLabel];
  delete next[oldLabel];
  next[newLabel] = { ...moved, ...(next[newLabel] || {}) };
  return next;
}

// 時限ラベルの改名 (全日付)。改名先に既に回答があるマスは既存を優先。
export function renameAvailabilityPeriod(
  map: AvailabilityMap | undefined,
  oldLabel: string,
  newLabel: string,
): AvailabilityMap | undefined {
  if (!map || oldLabel === newLabel) return map;
  let next: AvailabilityMap | null = null;
  Object.keys(map).forEach(date => {
    const byPeriod = map[date];
    if (!byPeriod || !(oldLabel in byPeriod)) return;
    if (!next) next = { ...map };
    const np = { ...byPeriod };
    const v = np[oldLabel];
    delete np[oldLabel];
    if (!(newLabel in np)) np[newLabel] = v;
    next[date] = np;
  });
  return next || map;
}

// 日付ラベルの削除 (日付プールからの削除)。
export function dropAvailabilityDates(
  map: AvailabilityMap | undefined,
  labels: Iterable<string>,
): AvailabilityMap | undefined {
  if (!map) return map;
  const set = new Set(labels);
  const hit = Object.keys(map).filter(d => set.has(d));
  if (hit.length === 0) return map;
  const next = { ...map };
  hit.forEach(d => { delete next[d]; });
  return Object.keys(next).length === 0 ? undefined : next;
}

// 時限ラベルの削除 (時限プールからの削除)。
export function dropAvailabilityPeriods(
  map: AvailabilityMap | undefined,
  labels: Iterable<string>,
): AvailabilityMap | undefined {
  if (!map) return map;
  const set = new Set(labels);
  let next: AvailabilityMap | null = null;
  Object.keys(map).forEach(date => {
    const byPeriod = map[date] || {};
    const drop = Object.keys(byPeriod).filter(p => set.has(p));
    if (drop.length === 0) return;
    if (!next) next = { ...map };
    const np = { ...byPeriod };
    drop.forEach(p => { delete np[p]; });
    if (Object.keys(np).length === 0) delete next[date];
    else next[date] = np;
  });
  if (!next) return map;
  return Object.keys(next).length === 0 ? undefined : next;
}

// 外部 JSON (読込・同期) の availability を検証する。形の崩れたマス・日付は
// 落とし、空になれば undefined。変化が無ければ changed=false で元の値を返す。
export function sanitizeAvailability(raw: unknown): { value: AvailabilityMap | undefined; changed: boolean } {
  if (raw === undefined) return { value: undefined, changed: false };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: undefined, changed: true };
  const src = raw as Record<string, unknown>;
  let changed = false;
  const out: AvailabilityMap = {};
  Object.keys(src).forEach(date => {
    const byPeriod = src[date];
    if (!byPeriod || typeof byPeriod !== 'object' || Array.isArray(byPeriod)) {
      changed = true;
      return;
    }
    const bp = byPeriod as Record<string, unknown>;
    const np: Record<string, AvailabilityMark> = {};
    Object.keys(bp).forEach(period => {
      const v = bp[period];
      if (isAvailabilityMark(v)) np[period] = v;
      else changed = true;
    });
    if (Object.keys(np).length === 0) {
      changed = true;
      return;
    }
    out[date] = np;
  });
  if (!changed) return { value: raw as AvailabilityMap, changed: false };
  return { value: Object.keys(out).length > 0 ? out : undefined, changed: true };
}
