// ─── 対象学年の選択肢 (休講日・テスト期間・授業セットの絞り込み) ─────────
// 標準の学年 (ALL_GRADES = 中1〜3・附中1〜3・高1〜3) に、時間割のコマに実在する
// **共通学年** (「附中」(確認テスト)・「中1-3」(土曜プレップ)・「高1高2」
// (高予備プレップ) など) を足す。
//
// 休講日・テスト期間の対象学年は**完全一致**で効く
// (scheduleHelpers.holidayMatches / examPeriodStopsClassesOn)。共通学年を
// 中1〜3 から自動で広げると、期末特訓中も実施する中1-3 の土曜プレップまで
// 止まるので、**共通学年はそれ自体を選んだときだけ**止める。そのために
// 選択肢に出す。

import { ALL_GRADES } from "../constants/schools";
import { gradeToDept } from "./scheduleHelpers";

const DEPT_ORDER = ["中学部", "高校部"];

function deptRank(grade) {
  const i = DEPT_ORDER.indexOf(gradeToDept(grade));
  return i < 0 ? DEPT_ORDER.length : i;
}

/**
 * 時間割のコマにある、標準の学年以外の学年 (共通学年)。並びは
 * 中学部 → 高校部 → その他、同じ部の中は文字順。
 * @param {Array<{grade?: string}>} slots
 * @returns {string[]}
 */
export function extraGradesFromSlots(slots) {
  const standard = new Set(ALL_GRADES);
  const set = new Set();
  for (const s of slots || []) {
    const g = typeof s?.grade === "string" ? s.grade.trim() : "";
    if (!g || standard.has(g)) continue;
    set.add(g);
  }
  return [...set].sort((a, b) => deptRank(a) - deptRank(b) || a.localeCompare(b, "ja"));
}

/**
 * 対象学年の選択肢 = 標準の学年 + 共通学年。保存済みの対象学年に、今の
 * 時間割に無い学年が残っていれば末尾に足す (選択が黙って外れないように)。
 * @param {Array} slots
 * @param {string[]} [selected]
 * @returns {string[]}
 */
export function gradeChoices(slots, selected = []) {
  const out = [...ALL_GRADES, ...extraGradesFromSlots(slots)];
  const seen = new Set(out);
  for (const g of selected || []) {
    if (g && !seen.has(g)) {
      out.push(g);
      seen.add(g);
    }
  }
  return out;
}

/** 標準の学年ではない (共通学年) か。チップの見た目を分けるのに使う。 */
export function isCommonGrade(grade) {
  return !!grade && !ALL_GRADES.includes(grade);
}
