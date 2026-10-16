// ─── 機能のカテゴリ ─────────────────────────────────────────────────
// メインメニュー (constants/mainMenu) とサイドバー (constants/sidebarMenu の
// category) が共有するカテゴリの名前・アイコン・並び。名前を変えるときは
// ここだけ直せば両方に効く (書き起こさない)。
//
// サイドバーではカテゴリごとに開け閉めする (項目が 25 前後あり、全部並べると
// 画面の高さに収まらない)。並びは固定。使用頻度で並べ替えない (A18)。

export const MENU_CATEGORY = Object.freeze({
  TODAY: "today",
  RESCHEDULE: "reschedule",
  CALENDAR: "calendar",
  STAFF: "staff",
  TIMETABLE: "timetable",
  RECORDS: "records",
});

export const MENU_CATEGORIES = Object.freeze([
  { key: MENU_CATEGORY.TODAY, icon: "🚑", label: "今日の対応" },
  { key: MENU_CATEGORY.RESCHEDULE, icon: "↻", label: "振替・追加授業" },
  { key: MENU_CATEGORY.CALENDAR, icon: "📅", label: "予定・休み" },
  { key: MENU_CATEGORY.STAFF, icon: "👥", label: "講師・スタッフ" },
  { key: MENU_CATEGORY.TIMETABLE, icon: "🗓", label: "時間割" },
  { key: MENU_CATEGORY.RECORDS, icon: "💾", label: "記録・データ" },
]);

/** カテゴリの定義 (key → { key, icon, label }) */
export function menuCategory(key) {
  const c = MENU_CATEGORIES.find((x) => x.key === key);
  if (!c) throw new Error(`menuCategories: 知らないカテゴリ ${key}`);
  return c;
}

/**
 * 何も開け閉めしていない端末で最初から開いておくカテゴリ。毎日使う
 * 「今日の対応」だけ (今いる画面のカテゴリは別に自動で開く)
 */
export const DEFAULT_OPEN_CATEGORIES = Object.freeze([MENU_CATEGORY.TODAY]);
