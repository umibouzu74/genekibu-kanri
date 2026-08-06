// ─── クラス × 科目の週コマ数集計 (📊 集計パネル用) ──────────────────
// カリキュラム側の検算 (「中3 の数学が週 3 コマあるか」) 用に、学年 (タブ)
// ごとに クラス × 科目 の週コマ数を数える純関数。講師×曜日 (teacherLoad)
// と対になる。
//
// - 教科の入ったセルだけを数える (講師だけのメモ書きは反映と同基準で除外)
// - 設定変更で無効になった残骸セルは数えない (resolveTabEntries 基準)
// - 科目列は科目マスタの並び順、マスタ外 (直接入力) は名前順で末尾
// - 合同 (結合) コマはその合同クラス列の行に数える (構成クラスへは配らない)

import { resolveTabEntries } from "./model";

/**
 * @returns {{
 *   tabs: {
 *     tabId: number, tabName: string,
 *     grade: string,
 *     subjects: string[],                    // このタブに現れる科目 (列)
 *     subjTotals: Record<string, number>,    // 計行用 (科目ごとの合計)
 *     rows: {
 *       classId: number, label: string,
 *       bySubj: Record<string, number>, total: number,
 *     }[],                                   // classes の定義順
 *     total: number,
 *   }[],                                     // 教科の入ったセルがある学年のみ
 * }}
 */
export function computeClassSubjectLoad(project) {
  const masterOrder = new Map((project.subjects || []).map((s, i) => [s, i]));
  const tabs = [];
  for (const tab of project.tabs || []) {
    const rows = new Map(); // classId → row (定義順)
    for (const cls of tab.classes || []) {
      rows.set(cls.id, {
        classId: cls.id,
        label: cls.label || cls.room || "－",
        bySubj: {},
        total: 0,
      });
    }
    const subjTotals = new Map();
    let total = 0;
    for (const e of resolveTabEntries(project, tab)) {
      const subj = (e.cell.subj || "").trim();
      if (!subj) continue;
      const row = rows.get(e.cls.id);
      if (!row) continue;
      row.bySubj[subj] = (row.bySubj[subj] || 0) + 1;
      row.total++;
      subjTotals.set(subj, (subjTotals.get(subj) || 0) + 1);
      total++;
    }
    if (total === 0) continue; // 教科の入ったセルが無い学年は載せない
    const subjects = [...subjTotals.keys()].sort((a, b) => {
      const ia = masterOrder.has(a) ? masterOrder.get(a) : Infinity;
      const ib = masterOrder.has(b) ? masterOrder.get(b) : Infinity;
      return ia - ib || a.localeCompare(b);
    });
    tabs.push({
      tabId: tab.id,
      tabName: tab.name,
      grade: tab.grade || "",
      subjects,
      subjTotals: Object.fromEntries(subjTotals),
      rows: [...rows.values()],
      total,
    });
  }
  return { tabs };
}
