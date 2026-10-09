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

// 自前のキーだけを見る (ラベルが "constructor" などでも Object の組み込みを
// 拾わない)
function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// 外部 JSON の "__proto__" キーは、{} へ代入すると値ではなくプロトタイプに
// なるので読み込まない
const UNSAFE_KEY = '__proto__';

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
      next[date] = { ...(hasOwn(next, date) ? next[date] : {}) };
      cloned.add(date);
    }
    return next[date];
  };
  for (const cell of cells || []) {
    if (!cell || !cell.date || !cell.period || cell.date === UNSAFE_KEY || cell.period === UNSAFE_KEY) continue;
    const { date, period } = cell;
    const src = next || map || {};
    const byDate = hasOwn(src, date) ? src[date] : undefined;
    const current = byDate && hasOwn(byDate, period) ? byDate[period] : undefined;
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

// 改名先に既に回答があるマスをどちらに寄せるか。
//   'existing': 改名先を優先 (日付ラベル統一で「8/6」と「8/6(木)」が合流する
//     ケース。改名先もプールにある本物の日付)
//   'moved': 動かしてきた回答を優先 (見出しの改名。改名先はプールに無い
//     ラベルなので、そこにある回答は前に消した日付の残り)
export type RenamePrefer = 'existing' | 'moved';

// 日付ラベルの改名 (改名先と同じ日付の回答はマスごとにマージ)。
export function renameAvailabilityDate(
  map: AvailabilityMap | undefined,
  oldLabel: string,
  newLabel: string,
  prefer: RenamePrefer = 'existing',
): AvailabilityMap | undefined {
  if (!map || oldLabel === newLabel || newLabel === UNSAFE_KEY || !hasOwn(map, oldLabel)) return map;
  const next = { ...map };
  const moved = next[oldLabel];
  delete next[oldLabel];
  const existing = hasOwn(next, newLabel) ? next[newLabel] : {};
  next[newLabel] = prefer === 'moved' ? { ...existing, ...moved } : { ...moved, ...existing };
  return next;
}

// 時限ラベルの改名 (全日付)。改名先と同じマスの回答の扱いは prefer。
export function renameAvailabilityPeriod(
  map: AvailabilityMap | undefined,
  oldLabel: string,
  newLabel: string,
  prefer: RenamePrefer = 'existing',
): AvailabilityMap | undefined {
  if (!map || oldLabel === newLabel || newLabel === UNSAFE_KEY) return map;
  let next: AvailabilityMap | null = null;
  Object.keys(map).forEach(date => {
    const byPeriod = map[date];
    if (!byPeriod || !hasOwn(byPeriod, oldLabel)) return;
    if (!next) next = { ...map };
    const np = { ...byPeriod };
    const v = np[oldLabel];
    delete np[oldLabel];
    if (prefer === 'moved' || !hasOwn(np, newLabel)) np[newLabel] = v;
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
    if (date === UNSAFE_KEY || !byPeriod || typeof byPeriod !== 'object' || Array.isArray(byPeriod)) {
      changed = true;
      return;
    }
    const bp = byPeriod as Record<string, unknown>;
    const np: Record<string, AvailabilityMark> = {};
    Object.keys(bp).forEach(period => {
      const v = bp[period];
      if (period !== UNSAFE_KEY && isAvailabilityMark(v)) np[period] = v;
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

// 講師から出勤可能調査の回答とメモを外す (テンプレート・初期値の保存用)。
// 回答はその季節の日付に対するものなので、次の講習へ持ち越さない (持ち越すと
// 調査の対象外の古い回答で「回答済み」扱いになり、プルダウンに ? が並ぶ)。
// 外すものが無ければ入力の配列をそのまま返す。
export function stripAvailability(teachers: Teacher[]): Teacher[] {
  if (!Array.isArray(teachers)) return teachers;
  let changed = false;
  const out = teachers.map(t => {
    if (!t || (t.availability === undefined && t.availabilityMemo === undefined)) return t;
    changed = true;
    const { availability: _a, availabilityMemo: _m, ...rest } = t;
    return rest as Teacher;
  });
  return changed ? out : teachers;
}
