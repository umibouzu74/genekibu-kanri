// ─── 一覧の期間絞り込み (休講 / テスト期間 / 特別イベント / 追加授業 / 特別時程) ──
// 5 つのマネージャはどれも全件を日付順にベタ表示していたので、運用 1 年で
// 去年の分が一覧の先頭を占め、今月の行を探すのに縦スクロールになっていた
// (2026-09-12)。既定は「今月以降」: 今月に入ってから過ぎた分も残す
// (「今週の休講はもう登録したか」を確かめる用途があるため)。
//
// 絞り込みは表示だけ。編集・削除・ジャンプ (editTargetId) は全件が対象。

export const LIST_PERIOD_MODES = Object.freeze([
  { key: "current", label: "今月以降" },
  { key: "month", label: "月を指定" },
  { key: "all", label: "すべて" },
]);

/** "YYYY-MM-DD" → その月の 1 日 ("YYYY-MM-01")。 */
export function monthStartOf(dateStr) {
  return `${String(dateStr || "").slice(0, 7)}-01`;
}

/**
 * @template T
 * @param {T[]} items
 * @param {{mode: string, month?: string, todayStr: string}} period
 * @param {(item: T) => [string, string]} getRange  項目の [開始日, 終了日]
 *   (単日なら同じ日を 2 回)。開始・終了が読めない項目は残す (黙って隠さない)
 * @returns {T[]}
 */
export function filterByListPeriod(items, period, getRange) {
  const mode = period?.mode || "current";
  if (mode === "all") return items;
  let from = "";
  let to = "";
  if (mode === "current") {
    from = monthStartOf(period.todayStr);
    to = "9999-12-31";
  } else if (mode === "month") {
    if (!/^\d{4}-\d{2}$/.test(period.month || "")) return items;
    from = `${period.month}-01`;
    to = `${period.month}-31`;
  } else {
    return items;
  }
  return items.filter((it) => {
    const [s, e] = getRange(it) || [];
    if (!s && !e) return true;
    const start = s || e;
    const end = e || s;
    return end >= from && start <= to;
  });
}
