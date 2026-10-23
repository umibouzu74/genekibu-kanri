// 講習の季節 (春期 / 夏期 / 冬期) と、季節ごとの保存先 (2026-10-23)。
//
// 講習は毎年 春期・夏期・冬期 の 3 回あるので、project を季節ごとに 1 つずつ
// 持つ (以前は 1 つだけで、夏期の project を冬期に作り替えていた)。季節の
// project は翌年の同じ季節にそのまま作り直して使う (クラス・科目・講師が
// 似ているため)。
//
// - 保存先は季節ごとに別のキー (LocalStorage) / ノード (RTDB)。1 つの JSON に
//   3 季節をまとめないのは、編集のたびに 3 季節ぶんを送り直さないためと、
//   旧クライアントの stale-client 検出 (version + tabs) を壊さないため
// - 旧版の単一 project (builder.schedule_project / appData/builder/schedule_project)
//   は日付から季節を推定してその季節へ移す (utils/seasonProject.inferProjectSeason、
//   移すのは hooks/useBuilderProjects)。旧ノードは消さない
// - このファイルは依存を持たない (本体のサイドバー定義からも import する)

import { TAB_PRESENCE_CHANNEL } from './tabPresence';

export type KoshuSeason = 'spring' | 'summer' | 'winter';

export interface KoshuSeasonDef {
  key: KoshuSeason;
  /** 画面の見出し・サイドバーの子項目 */
  label: string;
  /** 狭いところ用 */
  short: string;
  icon: string;
}

export const KOSHU_SEASON = Object.freeze({
  SPRING: 'spring',
  SUMMER: 'summer',
  WINTER: 'winter',
} as const);

// 並びは 1 年の流れ (年度の始まりの春から)。画面のタブ・サイドバーの子項目・
// メインメニュー・Cmd+K が共有する
export const KOSHU_SEASONS: readonly KoshuSeasonDef[] = Object.freeze([
  { key: 'spring', label: '春期講習', short: '春期', icon: '🌸' },
  { key: 'summer', label: '夏期講習', short: '夏期', icon: '🌻' },
  { key: 'winter', label: '冬期講習', short: '冬期', icon: '⛄' },
]);

export function isKoshuSeason(value: unknown): value is KoshuSeason {
  return KOSHU_SEASONS.some(s => s.key === value);
}

export function koshuSeasonDef(season: KoshuSeason): KoshuSeasonDef {
  return KOSHU_SEASONS.find(s => s.key === season) || KOSHU_SEASONS[0];
}

/** 季節ごとの保存先 */
export interface SeasonStorage {
  season: KoshuSeason;
  /** LocalStorage のキー (project の JSON 文字列) */
  storageKey: string;
  /** 読み込みに失敗した原本の退避先 (F2f) */
  backupKey: string;
  /** RTDB のパス (JSON 文字列。constants.FIREBASE_PROJECT_PATH_LEGACY のコメント参照) */
  firebasePath: string;
  /** 同じブラウザで同じ季節を 2 つのタブで開いたことを知らせるチャネル (E6d) */
  presenceChannel: string;
}

// 講習時間割作成が季節の project を LocalStorage に書いたときに window へ出す
// イベント (detail = { storageKey })。本体の hooks/useBuilderProjects が受けて
// 読み直す。Firebase 未設定の端末では同じタブの書き込みを知る手段がこれしか
// 無い (storage イベントは別のタブにしか届かない)
export const BUILDER_PROJECT_SAVED_EVENT = 'builder:project-saved';

export function notifyBuilderProjectSaved(storageKey: string): void {
  try {
    window.dispatchEvent(new CustomEvent(BUILDER_PROJECT_SAVED_EVENT, { detail: { storageKey } }));
  } catch {
    // CustomEvent の無い環境では知らせない (本体は次の読み込みで拾う)
  }
}

export function seasonStorage(season: KoshuSeason): SeasonStorage {
  return {
    season,
    storageKey: `builder.schedule_project.${season}`,
    backupKey: `builder.schedule_project_corrupt.${season}`,
    // RTDB のキーに '.' は使えないので '_' でつなぐ (database.rules.json に列挙)
    firebasePath: `appData/builder/schedule_project_${season}`,
    presenceChannel: `${TAB_PRESENCE_CHANNEL}.${season}`,
  };
}

// 講習の季節の目安 (月 → 季節)。春期 = 3 月末〜4 月頭、夏期 = 7〜8 月、
// 冬期 = 12 月末〜1 月頭。日付ラベルからの季節の推定に使う
export function seasonOfMonth(month: number): KoshuSeason {
  if (month >= 2 && month <= 5) return 'spring';
  if (month >= 6 && month <= 9) return 'summer';
  return 'winter';
}

// 1/10 まで = 冬期の最中 / 4/10 まで = 春期 (準備〜最中) / 8/31 まで = 夏期 /
// それ以降 = 冬期。月日だけで決める (講習の準備は数か月前から始まるので、
// 「次に来る講習」を開く)
const SPRING_UNTIL = { month: 4, day: 10 };
const SUMMER_UNTIL = { month: 8, day: 31 };
const WINTER_TAIL_UNTIL = { month: 1, day: 10 };

function onOrBefore(date: Date, until: { month: number; day: number }): boolean {
  const m = date.getMonth() + 1;
  return m < until.month || (m === until.month && date.getDate() <= until.day);
}

/**
 * 講習時間割作成を開いたときの既定の季節 (次に来る講習)。使用頻度・履歴では
 * 決めない (CLAUDE.md A18)。セッション中に選んだ季節は App が sessionStorage に持つ
 */
export function defaultKoshuSeason(date: Date = new Date()): KoshuSeason {
  if (onOrBefore(date, WINTER_TAIL_UNTIL)) return 'winter';
  if (onOrBefore(date, SPRING_UNTIL)) return 'spring';
  if (onOrBefore(date, SUMMER_UNTIL)) return 'summer';
  return 'winter';
}

/**
 * その季節の次に来る講習が始まる年 (新しく作る project の名前用)。冬期は 12 月に
 * 始まるので、1/10 までは前の年 (今まさにやっている冬期)
 */
export function upcomingSeasonYear(season: KoshuSeason, date: Date = new Date()): number {
  const year = date.getFullYear();
  if (season === 'winter') return onOrBefore(date, WINTER_TAIL_UNTIL) ? year - 1 : year;
  if (season === 'spring') return onOrBefore(date, SPRING_UNTIL) ? year : year + 1;
  return onOrBefore(date, SUMMER_UNTIL) ? year : year + 1;
}

/** 新しく作る project の名前の案 ("2026 冬期講習") */
export function suggestSeasonProjectName(season: KoshuSeason, date: Date = new Date()): string {
  return `${upcomingSeasonYear(season, date)} ${koshuSeasonDef(season).label}`;
}
