// 他学年セッションと時限の時間帯が重なることで自動的に派生するNGスロットを
// 計算する。NG は項目を講師に「保存」せず、計算によって導出する方針:
//   - セッションを追加/削除すれば自動でNG表示が更新される
//   - 既存の手動NG (teacher.ngSlots) との merge は呼び出し側で行う
//   - 由来 (どのセッションが原因か) も同時に返し、ツールチップに使う
//
// この module は React 非依存で、純粋関数として扱える。

import { makeNgKey } from './scheduleKey';
import { getPeriodTimeRange, getSessionTimeRange, timeRangesOverlap } from './timeRange';
import type { Entity, ExternalSession, Teacher } from '../types';

/** 1 つの自動NG エントリ。sessions は由来となった他学年セッション群 */
export interface AutoNgEntry {
  sessions: ExternalSession[];
}

/** makeNgKey(dateLabel, periodLabel) → AutoNgEntry */
export type AutoNgEntries = Map<string, AutoNgEntry>;

// 1 講師について、external session × 時限 の overlap から派生する NG キーの
// Map を返す。
//   key: makeNgKey(date.label, period.label)
//   value: { sessions: ExternalSession[] }  ← 由来となったセッション群
// 同じ NG キーが複数セッション由来でも 1 entry に集約 (sessions 配列で保持)。
export function computeAutoNgEntries(
  teacherName: string,
  externalSessions: ExternalSession[] | null | undefined,
  periods: Entity[] | null | undefined,
): AutoNgEntries {
  const out: AutoNgEntries = new Map();
  if (!teacherName || !Array.isArray(externalSessions) || !Array.isArray(periods)) {
    return out;
  }
  // 時限ごとの時間帯 cache (毎セッションでパースし直さないため)
  const periodRanges = periods.map(p => ({ period: p, range: getPeriodTimeRange(p) }));

  for (const session of externalSessions) {
    if (!session || session.teacherName !== teacherName) continue;
    const sRange = getSessionTimeRange(session);
    if (!sRange) continue; // 時間情報が無いセッションは自動NGを生成しない

    for (const { period, range: pRange } of periodRanges) {
      if (!pRange) continue;
      if (!timeRangesOverlap(sRange, pRange)) continue;
      const key = makeNgKey(session.date, period.label);
      const existing = out.get(key);
      if (existing) {
        existing.sessions.push(session);
      } else {
        out.set(key, { sessions: [session] });
      }
    }
  }
  return out;
}

// 講師名 → 自動NG entries (上記 Map) の二段 Map をプロジェクト全体で構築。
// NgSettings / ScheduleCell など複数箇所で使うため、O(teachers × sessions × periods) を一度に。
//   key: teacherName, value: Map<ngKey, { sessions: [...] }>
export function computeAutoNgByTeacher(
  teachers: Teacher[] | null | undefined,
  externalSessions: ExternalSession[] | null | undefined,
  periods: Entity[] | null | undefined,
): Map<string, AutoNgEntries> {
  const result = new Map<string, AutoNgEntries>();
  if (!Array.isArray(teachers)) return result;
  for (const t of teachers) {
    result.set(t.name, computeAutoNgEntries(t.name, externalSessions, periods));
  }
  return result;
}

// 指定の (teacher, date, period.label) が手動 or 自動どちらかでNGか判定。
// 制約ソルバ用 (autoGenerator など)。autoNgEntries はその teacher の Map。
export function isEffectivelyNg(
  teacher: Teacher | null | undefined,
  autoNgEntries: AutoNgEntries | null | undefined,
  dateLabel: string,
  periodLabel: string,
): boolean {
  const k = makeNgKey(dateLabel, periodLabel);
  if (teacher?.ngSlots?.includes(k)) return true;
  if (autoNgEntries?.has(k)) return true;
  return false;
}
