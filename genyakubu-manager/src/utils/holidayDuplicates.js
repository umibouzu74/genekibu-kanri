// ─── 休講日の「同じ日の二重登録」の検出 (2026-09-15) ─────────────────
// 休講日は (日付, 部門 scope, 対象学年, 科目キーワード) で効く
// (utils/scheduleHelpers.isSlotCancelledByHoliday)。同じ日に同じ対象で 2 件
// 登録しても効き目は変わらないが、一覧に 2 行並び、片方だけ消して「まだ
// 休講のまま」になる元。同じ日で対象が違うものは併存できる (中学部だけの
// 休講 + 高校部の特定クラスの休講、など) ので、画面は注意だけ出す。
// HolidayManager から呼ぶ純関数 (コンポーネントのファイルに置くと
// react-refresh の警告になるので分けてある)。

const sortedKey = (arr) => [...(arr || [])].map(String).sort().join("|");

/** 対象 (部門 / 学年 / 科目キーワード) の署名。順序に依らず比べる */
export function holidayScopeKey(h) {
  return [
    sortedKey(h?.scope?.length ? h.scope : ["全部"]),
    sortedKey(h?.targetGrades),
    sortedKey(h?.subjKeywords),
  ].join("#");
}

/**
 * 登録しようとしている日付ごとに、同じ日の既存休講日を「対象が同じ」
 * (exact) と「対象が違う」(others) に分ける。
 * @param {object[]} holidays
 * @param {string[]} dates
 * @param {{scope: string[], targetGrades: string[], subjKeywords: string[]}} criteria
 * @param {{excludeId?: number | null}} [opts] 編集中の自分自身を除く
 * @returns {{exact: {date: string, holiday: object}[], others: {date: string, holiday: object}[]}}
 */
export function findSameDayHolidays(holidays, dates, criteria, opts = {}) {
  const excludeId = opts.excludeId ?? null;
  const key = holidayScopeKey(criteria);
  const exact = [];
  const others = [];
  const dateSet = new Set(dates || []);
  for (const h of holidays || []) {
    if (!h || !dateSet.has(h.date)) continue;
    if (excludeId != null && h.id === excludeId) continue;
    (holidayScopeKey(h) === key ? exact : others).push({ date: h.date, holiday: h });
  }
  const byDate = (a, b) => a.date.localeCompare(b.date) || a.holiday.id - b.holiday.id;
  exact.sort(byDate);
  others.sort(byDate);
  return { exact, others };
}
