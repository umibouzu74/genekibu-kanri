// 講習の日付ラベル ("12/25(金)") を実日付 (YYYY-MM-DD) に解決する共通の決まり。
//
// ラベルは年を持たないので、基準日 (project の最終編集日) の前後の年から選ぶ。
// 講習時間割作成 (出勤可能調査の紙面) と本体 (講師別の月間カレンダーの「講」・
// 授業時間の集計・他校舎の授業の取り込み) が同じ関数を使い、同じ日付に置く。
//
// - 候補は基準日の前年・当年・翌年。距離は過去方向を 2 倍に重み付けする
//   (講習は「最終編集の少し前 (シーズン中の調整)〜数か月先 (シーズン前の作成)」
//   に分布するので、半年近く先の冬期を前年 12 月へ誤解決しないように)
// - ラベルに曜日 "(木)" があり、その曜日に合う候補が基準日から
//   WEEKDAY_TRUST_PAST_DAYS 日前より後なら、それを優先する。最終編集が講習の
//   数か月後でも (5 月に冬期の project を開いて直した等) 年がずれない。
//   それより古い候補の曜日は信じない — 前の年のラベルをそのまま使っている
//   (既定の日付を作り直していない) とき、1 年前へ飛ばさないため
// - どのタブも使っていない日付 (前の季節の残り) は解決の対象にしない
//   (usedDateLabels)。本体では前の夏の日付が翌年 7 月の「講」として出ていた

import { activeDatesForTab, activePeriodsForTab } from './scheduleKey';
import { WEEKDAY_LABELS } from './dateGenerate';
import type { Project } from '../types';

/** 曜日を信じる過去方向の範囲 (日) */
export const WEEKDAY_TRUST_PAST_DAYS = 180;

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

// 日付ラベル → "YYYY-MM-DD"。M/D として読めない / 実在しない日付 (2/30 等) /
// 基準日が不正なら null。
export function resolveDateLabelYmd(label: unknown, baseYmd: unknown): string | null {
  const parsed = parseDateLabel(label);
  if (!parsed) return null;
  const bm = String(baseYmd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!bm) return null;
  const base = makeDate(Number(bm[1]), Number(bm[2]), Number(bm[3]));
  if (!base) return null;
  const candidates: Array<{ dt: Date; dist: number; trusted: boolean }> = [];
  for (const year of [base.getFullYear() - 1, base.getFullYear(), base.getFullYear() + 1]) {
    // 桁あふれ (2/30、平年の 2/29 等) はその年の候補から除外
    const dt = makeDate(year, parsed.month, parsed.day);
    if (!dt) continue;
    const diff = dt.getTime() - base.getTime();
    candidates.push({
      dt,
      dist: diff < 0 ? -diff * 2 : diff,
      trusted: parsed.weekday != null
        && dt.getDay() === parsed.weekday
        && diff >= -WEEKDAY_TRUST_PAST_DAYS * DAY_MS,
    });
  }
  const pool = candidates.some(c => c.trusted) ? candidates.filter(c => c.trusted) : candidates;
  let best: { dt: Date; dist: number } | null = null;
  for (const c of pool) {
    if (!best || c.dist < best.dist) best = c;
  }
  return best ? toYmd(best.dt) : null;
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
// 日付プールには前の季節の日付が残りうる (プールは増える一方で、初期値・
// テンプレートもプールごと写す) ので、実日付に置く・外部の予定を拾う対象は
// ここで絞る。
export function usedDateLabels(project: Pick<Project, 'dates' | 'periods' | 'tabs'> | null | undefined): Set<string> {
  const out = new Set<string>();
  (project?.tabs || []).forEach(tab => {
    if (activePeriodsForTab(project?.periods, tab).length === 0) return;
    activeDatesForTab(project?.dates, tab).forEach(d => out.add(d.label));
  });
  return out;
}
