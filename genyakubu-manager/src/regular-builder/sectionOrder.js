// ─── セクションの縦積み順 (◫ 曜日を並べる / Excel「全曜日」) ─────────
// 曜日を横に並べて表示・印刷するときの、セクション (時間軸を共有する学年の
// まとまり) の並び順。画面 (RegularGrid の stackSections) と紙面 (Excel の
// 「全曜日」シート) で同じ順序にするための共有モジュール。
//
// **曜日に依存しない基準だけで順序を決める**のが要点。「その曜日での検出順」
// (computeSections の返り順) で並べると、月曜は高校部・亀井町が先・木曜は
// 高校部・本校が先、のように並べた曜日の間で行の対応がずれる。
//
// 同順位 (同じ部) の並びはタブ定義順 → 本校 → 亀井町。手動グループの
// 対応付けはセクション名でなくメンバーの元タブの group 名で行う —
// splitCampus はグループ名を「◯◯（亀井町）」に改名するため、名前一致では
// 元グループを引けない。

import { sectionDeptRank } from "./sectionTone";

/**
 * セクション → 並び順キー を作る。
 * @param {object} project RegularProject
 * @returns {(s: {tabs: object[], auto?: boolean, campus?: string}) => number[]}
 *   [部 (中学部 → 混在 → 高校部), タブ定義順, 建物 (本校 → 亀井町)]
 */
export function makeStackOrderKey(project) {
  const tabOrder = new Map((project.tabs || []).map((t, i) => [t.id, i]));
  const origGroup = new Map(
    (project.tabs || []).map((t) => [t.id, (t.group || "").trim()])
  );
  // 手動グループはその曜日に居ないタブも含めたプロジェクト全体の定義順で測る
  const defRank = (s) => {
    let pool = s.tabs;
    if (!s.auto) {
      const names = new Set(s.tabs.map((t) => origGroup.get(t.id)));
      const groupTabs = (project.tabs || []).filter((t) =>
        names.has((t.group || "").trim())
      );
      if (groupTabs.length > 0) pool = groupTabs;
    }
    return Math.min(...pool.map((t) => tabOrder.get(t.id) ?? Infinity));
  };
  // 手動グループは s.campus を持たないためメンバータブの campus 注釈
  // (splitTabsByCampus) から判定する
  const campusRank = (s) =>
    s.campus === "annex" || (!s.campus && s.tabs.every((t) => t.campus === "annex"))
      ? 1
      : 0;
  return (s) => [sectionDeptRank(s.tabs), defRank(s), campusRank(s)];
}

/** makeStackOrderKey のキー同士の比較 (Array.prototype.sort 用) */
export const compareStackKey = (a, b) =>
  (a[0] ?? 0) - (b[0] ?? 0) ||
  (a[1] ?? 0) - (b[1] ?? 0) ||
  (a[2] ?? 0) - (b[2] ?? 0);
