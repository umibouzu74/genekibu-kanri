// 講習の日付ラベル ("12/25(金)") を実日付 (YYYY-MM-DD) に解決する共通の決まり。
//
// ラベルは年を持たないので、基準日 (project の最終編集日) の前後の年から選ぶ。
// 講習時間割作成 (出勤可能調査の調査票・他校舎の授業の取り込み) と本体 (講師別の
// 月間カレンダーの「講」・授業時間の集計) が同じ関数を使い、同じ日付に置く。
//
// - 年は季節ごとに 1 回だけ決める (resolveDateLabelsYmd)。季節の始まりの月
//   (dateGenerate.seasonStartMonth) より前の月は翌年 (冬期の 12/25 → 1/7)。
//   ラベルごとに決めると、講習の半年後に編集したとき曜日を信じる範囲の境目で
//   ラベルが 1 つずつ翌年へ移り、1 つの講習が 2 つの年に割れていた
// - 候補は基準日の前年・当年・翌年。距離は過去方向を 2 倍に重み付けする
//   (講習は「最終編集の少し前 (シーズン中の調整)〜数か月先 (シーズン前の作成)」
//   に分布するので、半年近く先の冬期を前年 12 月へ誤解決しないように)
// - ラベルの曜日 "(木)" の過半数が合う年があり、その季節が基準日の
//   WEEKDAY_TRUST_PAST_DAYS 日前〜WEEKDAY_TRUST_FUTURE_DAYS 日後にかかるなら、
//   それを優先する。最終編集が講習の数か月後でも (5 月に冬期の project を開いて
//   直した等) 年がずれない。それより古い曜日は信じない — 前の年のラベルを
//   そのまま使っている (既定の日付を作り直していない) とき、1 年前へ飛ばさない
//   ため。それより先の曜日も信じない — 曜日の打ち間違いで 1 年先へ飛ばさない
// - どのタブも使っていない日付 (前の季節の残り) は解決の対象にしない
//   (usedDateLabels)。本体では前の夏の日付が翌年 7 月の「講」として出ていた

import { activeDatesForTab, activePeriodsForTab } from './scheduleKey';
import { WEEKDAY_LABELS, seasonStartMonth } from './dateGenerate';
import type { Project } from '../types';

/** 曜日を信じる過去方向の範囲 (日) */
export const WEEKDAY_TRUST_PAST_DAYS = 180;
/** 曜日を信じる未来方向の範囲 (日)。講習の準備は数か月前からなので、それより
 *  先の年に合う曜日は打ち間違いとみなす (12/25(土) を 1 年先へ飛ばさない) */
export const WEEKDAY_TRUST_FUTURE_DAYS = 270;

const DAY_MS = 24 * 60 * 60 * 1000;

function makeDate(year: number, month: number, day: number): Date | null {
  const dt = new Date(year, month - 1, day, 12);
  return dt.getMonth() === month - 1 && dt.getDate() === day ? dt : null;
}

function toYmd(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// "7/29(水)" → { month, day, weekday(0=日..6=土 | null) }。M/D でなければ null。
export function parseDateLabel(label: unknown): { month: number; day: number; weekday: number | null } | null {
  const m = String(label ?? '').match(/^(\d{1,2})\/(\d{1,2})(?:\s*[(（]\s*([日月火水木金土]))?/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const idx = m[3] ? WEEKDAY_LABELS.indexOf(m[3]) : -1;
  return { month, day, weekday: idx >= 0 ? idx : null };
}

function parseBaseYmd(baseYmd: unknown): Date | null {
  const bm = String(baseYmd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return bm ? makeDate(Number(bm[1]), Number(bm[2]), Number(bm[3])) : null;
}

// 日付ラベルの集まり (1 つの講習で使う日付) をまとめて実日付に解決する。
// 戻り値はラベル → "YYYY-MM-DD"。M/D として読めない / 選んだ年に実在しない
// (2/30、平年の 2/29 等) / 基準日が不正なら null。
export function resolveDateLabelsYmd(labels: Iterable<unknown>, baseYmd: unknown): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const parsed: Array<{ label: string; month: number; day: number; weekday: number | null }> = [];
  for (const raw of labels || []) {
    const label = String(raw ?? '');
    if (out.has(label)) continue;
    out.set(label, null);
    const p = parseDateLabel(label);
    if (p) parsed.push({ label, ...p });
  }
  const base = parseBaseYmd(baseYmd);
  if (!base || parsed.length === 0) return out;

  const start = seasonStartMonth(parsed.map(p => p.month));
  const withWeekday = parsed.filter(p => p.weekday != null).length;
  const now = base.getTime();
  type Candidate = { dates: Array<Date | null>; trusted: boolean; votes: number; dist: number };
  const better = (a: Candidate, b: Candidate): boolean => {
    if (a.trusted !== b.trusted) return a.trusted;
    if (a.trusted && a.votes !== b.votes) return a.votes > b.votes;
    return a.dist < b.dist;
  };
  let best: Candidate | null = null;
  // year = 季節の始まりの年
  for (const year of [base.getFullYear() - 1, base.getFullYear(), base.getFullYear() + 1]) {
    const dates = parsed.map(p => makeDate(year + (start != null && p.month < start ? 1 : 0), p.month, p.day));
    const times = dates.filter((d): d is Date => d !== null).map(d => d.getTime());
    if (times.length === 0) continue;
    const first = Math.min(...times);
    const last = Math.max(...times);
    const votes = parsed.filter((p, i) => p.weekday != null && dates[i]?.getDay() === p.weekday).length;
    const candidate: Candidate = {
      dates,
      // 曜日の過半数が合い、季節が信じる範囲にかかる年だけ
      trusted: votes * 2 > withWeekday
        && last >= now - WEEKDAY_TRUST_PAST_DAYS * DAY_MS
        && first <= now + WEEKDAY_TRUST_FUTURE_DAYS * DAY_MS,
      votes,
      // 季節の期間と基準日の距離 (期間中なら 0、過去方向は 2 倍)
      dist: now < first ? first - now : now > last ? (now - last) * 2 : 0,
    };
    if (!best || better(candidate, best)) best = candidate;
  }
  const chosen: Candidate | null = best;
  if (chosen) {
    parsed.forEach((p, i) => {
      const dt = chosen.dates[i];
      out.set(p.label, dt ? toYmd(dt) : null);
    });
  }
  return out;
}

// 日付ラベル 1 つ → "YYYY-MM-DD" (そのラベルだけで季節を決める)。講習の日付を
// まとめて置くときは resolveDateLabelsYmd を使う (年が季節の途中で割れない)。
export function resolveDateLabelYmd(label: unknown, baseYmd: unknown): string | null {
  return resolveDateLabelsYmd([label], baseYmd).get(String(label ?? '')) ?? null;
}

// 年の推定の基準日: project の updatedAt (無ければ createdAt)。講習の作成・調整は
// シーズン近傍で行うので、閲覧日 (今日) よりも「シーズン後に見返しても年が
// ずれない」安定した錨になる。どちらも無い外部 JSON だけ fallback (呼び出し側の
// 今日) に頼る。どれも無ければ null。
export function projectBaseYmd(
  project: Partial<Pick<Project, 'updatedAt' | 'createdAt'>> | null | undefined,
  fallbackYmd?: string | null,
): string | null {
  for (const key of ['updatedAt', 'createdAt'] as const) {
    const m = String(project?.[key] ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return typeof fallbackYmd === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fallbackYmd)
    ? fallbackYmd.slice(0, 10)
    : null;
}

// どれかのタブが授業に使う日付ラベル (タブの使う日 × 使う時限が 1 つ以上)。
// 日付プールには前の季節の日付が残りうる (プールは自動では減らず、初期値・
// テンプレートもプールごと写す) ので、実日付に置く・外部の予定を拾う対象は
// ここで絞る。使う日を選んでいない (= 全日) タブがあると、プールの全日が対象になる。
export function usedDateLabels(project: Pick<Project, 'dates' | 'periods' | 'tabs'> | null | undefined): Set<string> {
  const out = new Set<string>();
  (project?.tabs || []).forEach(tab => {
    if (activePeriodsForTab(project?.periods, tab).length === 0) return;
    activeDatesForTab(project?.dates, tab).forEach(d => out.add(d.label));
  });
  return out;
}
