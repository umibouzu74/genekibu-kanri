// ─── イベントの「対象」(誰に効くか) の表記 ─────────────────────────
// 休講日 (Holiday: 部門 scope × 対象学年 × 科目キーワード) とテスト期間
// (ExamPeriod.targetGrades) の対象を言葉にする。学校全体の休講と「中3 だけ」の
// 休講が同じ見た目にならないよう、休講日の注意書き (HolidayManager) と
// イベントカレンダー (チップ・ツールチップ・月の一覧) で共有する。
//
// 効き方そのものは scheduleHelpers.isSlotCancelledByHoliday /
// examPeriodStopsClassesOn が決める。ここはその解釈に合わせた表記だけで、
// 判定をここへ書き起こさないこと。
// (HolidayManager に置くとコンポーネント以外の export になり react-refresh の
// 警告になるので分けてある — holidayDuplicates.js と同じ理由)

// scope が空配列の休講日はどの部門にも効かない (isSlotCancelledByHoliday /
// holidayScopeKey と同じ解釈)。「全部」と書くと学校全体の休講に読めるので
// 別の言い方にする
export const HOLIDAY_NO_DEPT_LABEL = "対象部門なし";

/**
 * 休講日の対象を言う。
 *
 * - 既定 (一覧・注意書き・ツールチップ用): 部門 / 学年 / 科目キーワードの
 *   3 群を空白で分け、群の中 (学年同士など) は「・」で並べる
 *   ("全部" / "中学部 中3" / "高校部 高1・高2 共テ・数学")
 * - `short: true` (イベントカレンダーのチップ用): 学校全体 (「全部」で
 *   絞り込みなし) は "" = ラベルを出さない。学年を指定していれば部門は
 *   学年から読めるので省く ("" / "中3" / "高校部" / "高1・高2 英語")
 *
 * @param {{scope?: string[], targetGrades?: string[], subjKeywords?: string[]}} h
 * @param {{short?: boolean}} [opts]
 * @returns {string}
 */
export function describeHolidayScope(h, { short = false } = {}) {
  // scope が無い (undefined) のは旧データの「全部」
  const scope = Array.isArray(h?.scope) ? h.scope : ["全部"];
  if (scope.length === 0) return HOLIDAY_NO_DEPT_LABEL;
  const grades = h?.targetGrades || [];
  const keywords = h?.subjKeywords || [];
  if (short) {
    const who = grades.length > 0 ? grades : scope.filter((s) => s !== "全部");
    return [who, keywords]
      .map((g) => g.join("・"))
      .filter(Boolean)
      .join(" ");
  }
  return [scope, grades, keywords]
    .map((g) => g.join("・"))
    .filter(Boolean)
    .join(" ");
}

/**
 * テスト期間の対象学年を言う。targetGrades が空 = 全学年
 * (ExamPeriodManager の一覧の「全学年」と同じ言い方)。
 * `short: true` は全学年のとき "" (チップにラベルを出さない)。
 *
 * @param {{targetGrades?: string[]}} ep
 * @param {{short?: boolean}} [opts]
 * @returns {string}
 */
export function describeExamTargetGrades(ep, { short = false } = {}) {
  const grades = ep?.targetGrades || [];
  if (grades.length > 0) return grades.join("・");
  return short ? "" : "全学年";
}
