// 場所の違う授業の間の移動時間 (2026-11-25)。
//
// 講習時間割作成のタブ (中学の講習) は本校 (places.BUILDER_TAB_PLACE)。同じ講師・同じ日に
// 場所の違う他学年セッション (亀井町の高校①〜③) があるとき、前の授業の終わりから次の授業の
// 始まりまでの間の分数で決める:
//
//   | 間の分数                         | 扱い                                             |
//   | 移動時間 (既定 30 分) 未満       | NG (時間が重なるのと同じ。autoNg の travel)       |
//   | 移動時間以上・注意 (既定 60 分) 未満 | 入れてよいが注意 (「移動30分」。違反に数えない)   |
//   | それ以上                         | 何もしない                                       |
//
// 予備校部の講師 (本体の所属が yobiko) が、場所の違う授業の **あと** に本校のコマに入るときは、
// 間の分数に関係なく注意 (「亀井町から戻り」)。車の無い先生がいるので、自動作成でもできるだけ
// 避ける (NG にはしない。試す順を後ろへ)。
//
// - 同じ場所どうし (本校の予備校1〜4限) は移動を見ない (時間の重なりだけ = autoNg の sessions)
// - 時間が重なるものは他学年セッションの自動NG (sessions) が拾うので、ここでは数えない
// - 終了時刻の無いセッションは、その前のコマへの移動だけ見る (後ろは間が分からない)
// - 場所の無いセッション・移動時間の表に無い組は、間の分数のルールを当てない
//
// NG への合流は autoNg.computeAutoNgByTeacher の 1 か所 (候補の「(NG:移動)」・違反の内訳・
// 自動作成・Excel の ⚠NG が同じ判定を使う)。注意は computeTravelCautions で、画面
// (contexts/usualTeachersContext) と自動作成 (logic/autoGenerator) が同じ関数を使う。

import { effectiveConfigForTab, makeKey, makeNgKey } from './scheduleKey';
import { formatHHmm, getPeriodTimeRange, getSessionTimeRange, timeRangesOverlap } from './timeRange';
import type { TimeRange } from './timeRange';
import { BUILDER_TAB_PLACE, sessionPlace, travelMinutesBetween } from './places';
import type { Entity, ExternalSession, Project, Teacher, TravelSettings } from '../types';

/** 講習のコマと、場所の違う他学年セッション 1 件の関係 */
export interface TravelHit {
  session: ExternalSession;
  /** セッションの場所 (「亀井町」) */
  place: string;
  /**
   * toSession = 講習のコマのあとにセッション (本校 → 亀井町) /
   * fromSession = セッションのあとに講習のコマ (亀井町 → 本校)
   */
  direction: 'toSession' | 'fromSession';
  /** 前の授業の終わりから次の授業の始まりまで (分、0 以上) */
  gap: number;
  /** 必要な移動時間 (分)。移動時間の表に無い組は null (間の分数のルールを当てない) */
  minutes: number | null;
}

/** 移動が間に合わない (NG) か */
export function isTravelNg(hit: TravelHit): boolean {
  return hit.minutes != null && hit.gap < hit.minutes;
}

// 講習のコマ (時刻 p) とセッション (時刻 s) の間。重なる・間が分からないときは null
function gapBetween(p: TimeRange, s: TimeRange): { direction: TravelHit['direction']; gap: number } | null {
  if (timeRangesOverlap(p, s)) return null;
  if (s.endMin != null && s.endMin <= p.startMin) return { direction: 'fromSession', gap: p.startMin - s.endMin };
  if (p.endMin != null && p.endMin <= s.startMin) return { direction: 'toSession', gap: s.startMin - p.endMin };
  return null;
}

/**
 * 1 講師の、場所の違うセッション × 時限の関係 (makeNgKey(日付, 時限) → TravelHit[])。
 * sessions はその講師のものでなくてもよい (講師名で絞る)
 */
export function computeTravelHits(
  teacherName: string,
  sessions: readonly ExternalSession[] | null | undefined,
  periods: readonly Entity[] | null | undefined,
  travel: TravelSettings,
): Map<string, TravelHit[]> {
  const out = new Map<string, TravelHit[]>();
  if (!teacherName || !Array.isArray(sessions) || !Array.isArray(periods) || periods.length === 0) return out;
  let periodRanges: Array<{ period: Entity; range: TimeRange | null }> | null = null;
  for (const session of sessions) {
    if (!session || session.teacherName !== teacherName) continue;
    const place = sessionPlace(session);
    if (!place || place === BUILDER_TAB_PLACE) continue;
    const sRange = getSessionTimeRange(session);
    if (!sRange) continue;
    if (!periodRanges) periodRanges = periods.map(p => ({ period: p, range: getPeriodTimeRange(p) }));
    const minutes = travelMinutesBetween(travel, BUILDER_TAB_PLACE, place);
    for (const { period, range } of periodRanges) {
      if (!range) continue;
      const g = gapBetween(range, sRange);
      if (!g) continue;
      const key = makeNgKey(session.date, period.label);
      const hit: TravelHit = { session, place, direction: g.direction, gap: g.gap, minutes };
      const list = out.get(key);
      if (list) list.push(hit);
      else out.set(key, [hit]);
    }
  }
  return out;
}

// ─── 注意 (NG ではない) ─────────────────────────────────────────

/** gap = 間が移動時間以上・注意の分数未満 / return = 予備校部の講師が場所の違う授業のあとに本校へ戻る */
export type TravelCautionKind = 'gap' | 'return';

export interface TravelCaution {
  kind: TravelCautionKind;
  hit: TravelHit;
}

/** makeNgKey(日付, 時限) → その時限の注意 */
export type TravelCautionEntries = Map<string, TravelCaution[]>;

/** 講師名 → 注意 */
export type TravelCautionsByTeacher = Map<string, TravelCautionEntries>;

export const EMPTY_TRAVEL_CAUTIONS: TravelCautionsByTeacher = new Map();

/**
 * 講師ごとの注意。returnTeachers = 「戻り」を見る講師 (本体の所属が予備校部。
 * planningHints.returnCautionTeachers)。移動が間に合わない (NG) 時限には注意を付けない
 * (NG として autoNg が出す)
 */
export function computeTravelCautions(
  teachers: readonly Pick<Teacher, 'name'>[] | null | undefined,
  sessions: readonly ExternalSession[] | null | undefined,
  periods: readonly Entity[] | null | undefined,
  travel: TravelSettings,
  returnTeachers: ReadonlySet<string> | null | undefined,
): TravelCautionsByTeacher {
  const out: TravelCautionsByTeacher = new Map();
  if (!Array.isArray(teachers) || !Array.isArray(sessions) || sessions.length === 0) return out;
  const withSessions = new Set(sessions.map(s => s?.teacherName));
  for (const t of teachers) {
    if (!t?.name || !withSessions.has(t.name)) continue;
    const hits = computeTravelHits(t.name, sessions, periods, travel);
    if (hits.size === 0) continue;
    const back = !!returnTeachers?.has(t.name);
    const entries: TravelCautionEntries = new Map();
    for (const [key, list] of hits) {
      if (list.some(isTravelNg)) continue;
      const cautions: TravelCaution[] = [];
      for (const hit of list) {
        if (hit.minutes != null && hit.gap < travel.cautionMinutes) cautions.push({ kind: 'gap', hit });
        if (back && hit.direction === 'fromSession') cautions.push({ kind: 'return', hit });
      }
      if (cautions.length > 0) entries.set(key, cautions);
    }
    if (entries.size > 0) out.set(t.name, entries);
  }
  return out;
}

/** 「戻り」の注意があるか (自動作成で後回しにする) */
export function hasReturnCaution(cautions: readonly TravelCaution[] | null | undefined): boolean {
  return !!cautions?.some(c => c.kind === 'return');
}

/** 短い表記 (候補・セル): 「移動30分」「亀井町から戻り」 */
export function travelCautionLabels(cautions: readonly TravelCaution[] | null | undefined): string[] {
  if (!cautions || cautions.length === 0) return [];
  const out: string[] = [];
  const gaps = cautions.filter(c => c.kind === 'gap').map(c => c.hit.gap);
  if (gaps.length > 0) out.push(`移動${Math.min(...gaps)}分`);
  for (const c of cautions) {
    if (c.kind !== 'return') continue;
    const label = `${c.hit.place}から戻り`;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

// セッションの短い説明 (メモ + 時刻)
function sessionBrief(s: ExternalSession): string {
  const range = getSessionTimeRange(s);
  const time = range
    ? `${formatHHmm(range.startMin)}〜${range.endMin != null ? formatHHmm(range.endMin) : ''}`
    : (s.label || '');
  return [(s.memo || '').trim(), time].filter(Boolean).join(' ') || '他学年セッション';
}

const relation = (hit: TravelHit) => (hit.direction === 'fromSession' ? `のあと ${hit.gap}分` : `の ${hit.gap}分前`);

/** 移動が間に合わない (NG) の理由: 「移動が間に合わない: 高1・高2 Ⅱ期 高校① 16:40〜18:10 (亀井町) のあと 20分 (移動に30分)」 */
export function describeTravelHit(hit: TravelHit): string {
  return `移動が間に合わない: ${sessionBrief(hit.session)} (${hit.place}) ${relation(hit)}${hit.minutes != null ? ` (移動に${hit.minutes}分)` : ''}`;
}

/** 注意の理由 (一覧の行) */
export function describeTravelCaution(c: TravelCaution): string {
  if (c.kind === 'return') {
    return `${c.hit.place}から${BUILDER_TAB_PLACE}に戻る (予備校部): ${sessionBrief(c.hit.session)} ${relation(c.hit)}`;
  }
  return `移動${c.hit.gap}分: ${sessionBrief(c.hit.session)} (${c.hit.place}) ${relation(c.hit)}`;
}

// ─── 注意のある割当の一覧 (⚠ の内訳の「注意」) ─────────────────────

export interface TravelCautionItem {
  tabId: number;
  tabName: string;
  /** 最初のクラスのセルの schedule key (飛び先) */
  key: string;
  dateLabel: string;
  periodLabel: string;
  classLabels: string[];
  subject: string;
  teacher: string;
  /** 短い表記 (「移動30分」「亀井町から戻り」) */
  labels: string[];
  /** 理由 (行に書く) */
  reasons: string[];
}

/**
 * 全タブの、注意のある割当 (違反には数えない)。タブの使う日・使う時限の外は数えない。
 * 合同のように同じ日・時限・講師・科目で複数クラスに入っている割当は 1 件。
 * isNg(講師, NG キー) = その時限が NG (手動・自動) なら注意に出さない (NG の一覧に出る)
 */
export function computeTravelCautionList(
  project: Pick<Project, 'tabs' | 'dates' | 'periods'>,
  cautionsByTeacher: TravelCautionsByTeacher,
  isNg: (teacher: string, ngKey: string) => boolean,
): TravelCautionItem[] {
  const out: TravelCautionItem[] = [];
  if (!cautionsByTeacher || cautionsByTeacher.size === 0) return out;
  for (const tab of project.tabs || []) {
    const cfg = effectiveConfigForTab(project, tab);
    const byAssignment = new Map<string, TravelCautionItem>();
    for (const d of cfg.dates) {
      for (const p of cfg.periods) {
        const ngKey = makeNgKey(d.label, p.label);
        for (const c of cfg.classes) {
          const key = makeKey(d.id, p.id, c.id);
          const entry = tab.schedule?.[key];
          const teacher = entry?.teacher;
          if (!teacher || teacher === '未定') continue;
          const cautions = cautionsByTeacher.get(teacher)?.get(ngKey);
          if (!cautions || cautions.length === 0 || isNg(teacher, ngKey)) continue;
          const subject = entry?.subject || '';
          const groupKey = JSON.stringify([d.id, p.id, teacher, subject]);
          const existing = byAssignment.get(groupKey);
          if (existing) {
            existing.classLabels.push(c.label);
            continue;
          }
          const reasons: string[] = [];
          for (const cc of cautions) {
            const text = describeTravelCaution(cc);
            if (!reasons.includes(text)) reasons.push(text);
          }
          const item: TravelCautionItem = {
            tabId: tab.id,
            tabName: tab.name,
            key,
            dateLabel: d.label,
            periodLabel: p.label,
            classLabels: [c.label],
            subject,
            teacher,
            labels: travelCautionLabels(cautions),
            reasons,
          };
          byAssignment.set(groupKey, item);
          out.push(item);
        }
      }
    }
  }
  return out;
}
