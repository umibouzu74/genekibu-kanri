// 講習の授業の場所と、場所の間の移動時間の設定 (2026-11-25)。
//
// 高1・高2 の講習 (本体の「高校・予備校の講習」の高校①〜③) は亀井町ビル、中学の講習
// (講習時間割作成のタブ) と高3 の予備校コマ (予備校1〜4限) は本校で行う。本校と亀井町は
// 車で約 20 分かかるので、同じ講師・同じ日に場所の違う 2 つの授業があるときは間の分数を
// 見る (判定は utils/travel)。
//
// 場所の呼び方は通常時間割作成の校舎間の移動 (regular-builder/conflicts の「本校」
// 「亀井町」) と同じ。場所を足すとき (他校舎の授業の村上高松など) は KOSHU_PLACES と
// 移動時間の表 (TravelSettings.routes) に足す。
//
// **無依存** (型だけ)。scheduleKey.migrateProject と本体の utils/seniorKoshu から使うので、
// ここに scheduleKey などの import を足さない (循環)。

import type { ExternalSession, Project, TravelRoute, TravelSettings } from '../types';

export const MAIN_CAMPUS = '本校';
export const KAMEI_CAMPUS = '亀井町';

/** 選べる場所 (並び順) */
export const KOSHU_PLACES: readonly string[] = Object.freeze([MAIN_CAMPUS, KAMEI_CAMPUS]);

/** 講習時間割作成のタブ (中学の講習) の場所 */
export const BUILDER_TAB_PLACE = MAIN_CAMPUS;

const nameKey = (s: unknown) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '');

/**
 * 「高校・予備校の講習」の時限の名前から決まる既定の場所。「高校①」〜「高校③」は亀井町、
 * 「予備校1限」〜「予備校4限」(全角の数字も) は本校。ほかの名前は '' (場所なし = 移動を見ない)
 */
export function defaultPlaceForPeriodName(name: unknown): string {
  const k = nameKey(name);
  if (/^高校[1-3]$/.test(k)) return KAMEI_CAMPUS;
  if (/^予備校[1-4]限$/.test(k)) return MAIN_CAMPUS;
  return '';
}

/** 場所の文字 (前後の空白を落とす。文字列でなければ '') */
export function normalizePlace(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * 他学年セッションの場所。place が無いもの (この機能より前に本体の「高校・予備校の
 * 講習」から取り込んだもの) は、メモ (= 「期 時限」) の最後の語 = 時限の名前から既定の
 * 場所を当てる。取り込み直すと place が入る。手で入れたセッションは推し量らない ('')
 */
export function sessionPlace(s: Pick<ExternalSession, 'memo' | 'source'> & { place?: unknown } | null | undefined): string {
  if (!s) return '';
  const p = normalizePlace(s.place);
  if (p) return p;
  if (s.source === 'seniorKoshu') {
    const last = String(s.memo || '').trim().split(/\s+/).pop();
    return defaultPlaceForPeriodName(last);
  }
  return '';
}

// ─── 移動時間の設定 (Project.travel) ──────────────────────────────

export const DEFAULT_TRAVEL_MINUTES = 30;
export const DEFAULT_TRAVEL_CAUTION_MINUTES = 60;

/** 未設定のときの値 (本校⇄亀井町 30 分、間が 60 分未満なら注意) */
export const DEFAULT_TRAVEL: TravelSettings = Object.freeze({
  routes: Object.freeze([{ a: MAIN_CAMPUS, b: KAMEI_CAMPUS, minutes: DEFAULT_TRAVEL_MINUTES }]) as TravelRoute[],
  cautionMinutes: DEFAULT_TRAVEL_CAUTION_MINUTES,
}) as TravelSettings;

const MAX_MINUTES = 600;
const toMinutes = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(MAX_MINUTES, Math.round(n));
};

/**
 * 保存値・JSON の形を確かめる。崩れた組は落とし、無い組 (本校⇄亀井町) は既定で補う。
 * 形を成さなければ null (= 未設定として既定を使う)
 */
export function normalizeTravelSettings(raw: unknown): TravelSettings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as { routes?: unknown; cautionMinutes?: unknown };
  const routes: TravelRoute[] = [];
  const seen = new Set<string>();
  for (const it of Array.isArray(r.routes) ? r.routes : []) {
    if (!it || typeof it !== 'object') continue;
    const a = normalizePlace((it as TravelRoute).a);
    const b = normalizePlace((it as TravelRoute).b);
    const minutes = toMinutes((it as TravelRoute).minutes);
    if (!a || !b || a === b || minutes == null) continue;
    const key = [a, b].sort().join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push({ a, b, minutes });
  }
  for (const d of DEFAULT_TRAVEL.routes) {
    const key = [d.a, d.b].sort().join('\u0000');
    if (!seen.has(key)) routes.push({ ...d });
  }
  const caution = toMinutes(r.cautionMinutes);
  return { routes, cautionMinutes: caution ?? DEFAULT_TRAVEL_CAUTION_MINUTES };
}

/** プロジェクトの移動時間の設定 (未設定・崩れていれば既定) */
export function resolveTravelSettings(project: Pick<Project, 'travel'> | null | undefined): TravelSettings {
  return normalizeTravelSettings(project?.travel) || DEFAULT_TRAVEL;
}

/** 既定と同じか (同じなら保存しない) */
export function isDefaultTravelSettings(t: TravelSettings | null | undefined): boolean {
  const n = normalizeTravelSettings(t);
  if (!n) return true;
  return JSON.stringify(n) === JSON.stringify(normalizeTravelSettings(DEFAULT_TRAVEL));
}

/**
 * 場所 a と b の間の移動時間 (分)。同じ場所・どちらかが空・表に無い組は null
 * (= 移動を見ない。時間の重なりだけを見る)
 */
export function travelMinutesBetween(travel: TravelSettings, a: string, b: string): number | null {
  if (!a || !b || a === b) return null;
  for (const r of travel.routes || []) {
    if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) return r.minutes;
  }
  return null;
}

/** 本校⇄亀井町の移動時間を書き換えた設定 */
export function withMainKameiMinutes(travel: TravelSettings, minutes: number): TravelSettings {
  let found = false;
  const routes = (travel.routes || []).map(r => {
    const hit = (r.a === MAIN_CAMPUS && r.b === KAMEI_CAMPUS) || (r.a === KAMEI_CAMPUS && r.b === MAIN_CAMPUS);
    if (!hit) return r;
    found = true;
    return { ...r, minutes };
  });
  if (!found) routes.push({ a: MAIN_CAMPUS, b: KAMEI_CAMPUS, minutes });
  return { ...travel, routes };
}
