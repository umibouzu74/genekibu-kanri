// ─── セクション (時間軸を共有する学年のまとまり) の配色と並び順 ─────
// 画面 (RegularGrid の見出しバー) と紙面 (Excel のセクション行) で同じ
// 色を使うための共有モジュール。RegularGrid.jsx に置いたままだと Excel
// 出力側が React コンポーネントを import することになるので切り出す。

import { DEPT_COLOR } from "../constants/colors";

const isHighGrade = (g) => g.includes("高");

/**
 * セクション見出しの配色: 全学年が高校系なら高校部、全て中学系なら
 * 中学部 (附属含む)、混在は中立色。
 * @param {{grade?: string, name: string}[]} tabs
 * @returns {{b: string, f: string, accent: string}}
 */
export function sectionTone(tabs) {
  const grades = tabs.map((t) => t.grade || t.name);
  if (grades.every(isHighGrade)) return DEPT_COLOR["高校部"];
  if (grades.every((g) => !isHighGrade(g))) return DEPT_COLOR["中学部"];
  return { b: "#e8e8e8", f: "#444444", accent: "#607080" };
}

/**
 * 縦積み (stackSections) の並び順の第 1 キー: 中学部 → 混在 → 高校部。
 * @param {{grade?: string, name: string}[]} tabs
 */
export function sectionDeptRank(tabs) {
  const grades = tabs.map((t) => t.grade || t.name);
  if (grades.every((g) => !isHighGrade(g))) return 0;
  if (grades.every(isHighGrade)) return 2;
  return 1;
}
