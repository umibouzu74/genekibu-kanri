// 他学年セッションと時限の時間帯が重なることで自動的に派生するNGスロットを
// 計算する。NG は項目を講師に「保存」せず、計算によって導出する方針:
//   - セッションを追加/削除すれば自動でNG表示が更新される
//   - 既存の手動NG (teacher.ngSlots) との merge は呼び出し側で行う
//   - 由来 (どのセッションが原因か) も同時に返し、ツールチップに使う
//
// この module は React 非依存で、純粋関数として扱える。

import { makeNgKey } from './scheduleKey';
import {
  getPeriodTimeRange,
  getSessionTimeRange,
  parseTimeRange,
  timeRangesOverlap,
  timeRangesOverlapOrTouch,
} from './timeRange';
import { availabilityNgKeys, isSurveyTeacher } from './availability';
import type { Entity, ExternalSession, Teacher } from '../types';

/**
 * 本体の通常授業で、その日その講師が塾で教えている 1 コマ (utils/regularBusy が
 * 本体の判定から解いたもの)。講習の時限と時刻が重なる / 接すると自動NG になる。
 */
export interface RegularBusyItem {
  /** 実効時刻 "19:55-20:55" (コマ移動・特別時程・振替先の時刻を反映した後) */
  time: string;
  /** 「附中1 数学」(学年 + クラス + 科目) */
  label: string;
  /** 代行で入るコマ (元の担当ではない) */
  sub?: boolean;
}

/**
 * 講師名 → 講習の日付ラベル → その日に教える通常授業。**保存しない** (本体の時間割・
 * 代行・振替・休講から毎回導出する)。Web Worker (自動作成) にそのまま送れるよう
 * Map ではなく素のオブジェクト。
 */
export type RegularBusy = Record<string, Record<string, RegularBusyItem[]>>;

/** 本体のデータが無い (単体で描く・通常授業の無い期間) ときの空。同じ参照を使い回す */
export const EMPTY_REGULAR_BUSY: RegularBusy = Object.freeze({}) as RegularBusy;

/**
 * 1 つの自動NG エントリ。sessions は由来となった他学年セッション群。
 * availability=true は出勤可能調査の × 由来 (sessions が空でもこれだけで NG)。
 * regular は本体の通常授業との重なり由来 (その時限に重なる / 接するコマ)。
 */
export interface AutoNgEntry {
  sessions: ExternalSession[];
  availability?: boolean;
  regular?: RegularBusyItem[];
}

// 自動NG の由来の短い表示 ("他学年" / "通常" / "調査" / "他学年・通常・調査")。
// プルダウンの「(NG:…)」・NG マトリクスの tooltip で使う。
export function autoNgSourceLabel(entry: AutoNgEntry | null | undefined): string {
  if (!entry) return '';
  const parts: string[] = [];
  if (entry.sessions.length > 0) parts.push('他学年');
  if (entry.regular?.length) parts.push('通常');
  if (entry.availability) parts.push('調査');
  return parts.join('・');
}

// 通常授業 1 コマの説明 (「通常授業 附中1 数学 19:55-20:55」、代行なら「(代行)」)。
// ⚠ の内訳・NG の表の tooltip が同じ文を使う
export function describeRegularBusy(item: RegularBusyItem): string {
  return ['通常授業', item.label, item.time, item.sub ? '(代行)' : ''].filter(Boolean).join(' ');
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

// 1 講師について、本体の通常授業 (その日に実際に教えるコマ) × 時限 の重なりを
// entries に足す。**重なる / 端が接する**時限が NG (timeRangesOverlapOrTouch)。
// 時刻の読めないコマ・時限は NG を作らない。
function mergeRegularBusy(
  entries: AutoNgEntries,
  byDate: Record<string, RegularBusyItem[]> | undefined,
  periods: Entity[] | null | undefined,
): void {
  if (!byDate || !Array.isArray(periods)) return;
  const periodRanges = periods.map(p => ({ period: p, range: getPeriodTimeRange(p) })).filter(x => x.range);
  if (periodRanges.length === 0) return;
  for (const dateLabel of Object.keys(byDate)) {
    for (const item of byDate[dateLabel] || []) {
      const range = parseTimeRange(item?.time);
      if (!range) continue;
      for (const { period, range: pRange } of periodRanges) {
        if (!timeRangesOverlapOrTouch(range, pRange)) continue;
        const key = makeNgKey(dateLabel, period.label);
        const existing = entries.get(key);
        if (!existing) entries.set(key, { sessions: [], regular: [item] });
        else if (existing.regular) existing.regular.push(item);
        else existing.regular = [item];
      }
    }
  }
}

// 講師名 → 自動NG entries (上記 Map) の二段 Map をプロジェクト全体で構築。
// NgSettings / ScheduleCell など複数箇所で使うため、O(teachers × sessions × periods) を一度に。
//   key: teacherName, value: Map<ngKey, { sessions: [...], availability? }>
// 出勤可能調査の × (teacher.availability) もここで合流させる。自動作成・違反
// チェック・Excel・修正提案はすべてこの関数の結果を見るので、× を NG として
// 扱う経路をここ 1 か所に保つ (呼び出し側で調査を見忘れる事故を防ぐ)。
// placeholder の「未定」は調査の対象外 (画面で回答を直せない) なので、改名や
// 読込で回答が付いていても NG にしない。
// 本体の通常授業との重なり (regularBusy、2026-11-13) も同じくここで合流させる。
// **呼び出し側ごとに通常授業を見に行かない** — regularBusy は utils/regularBusy が
// 本体の判定から解いたものを、作業領域 (ProjectProvider → analysis.regularBusy) が
// 1 回だけ作って渡す。省略 (単体のテスト・本体のデータ無し) なら従来どおり。
export function computeAutoNgByTeacher(
  teachers: Teacher[] | null | undefined,
  externalSessions: ExternalSession[] | null | undefined,
  periods: Entity[] | null | undefined,
  regularBusy?: RegularBusy | null,
): Map<string, AutoNgEntries> {
  const result = new Map<string, AutoNgEntries>();
  if (!Array.isArray(teachers)) return result;
  for (const t of teachers) {
    const entries = computeAutoNgEntries(t.name, externalSessions, periods);
    if (regularBusy && isSurveyTeacher(t)) mergeRegularBusy(entries, regularBusy[t.name], periods);
    for (const key of isSurveyTeacher(t) ? availabilityNgKeys(t) : []) {
      const existing = entries.get(key);
      if (existing) existing.availability = true;
      else entries.set(key, { sessions: [], availability: true });
    }
    result.set(t.name, entries);
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
