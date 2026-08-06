// ─── Undo/Redo のフィードバック (通常時間割作成) ────────────────────
// 講習ビルダー N2f と同趣旨: undo/redo は無言で戻ると「何が起きたか」が
// 分からない (特に表示していない曜日のセルが戻った場合)。ワークスペースの
// 遷移前後を突き合わせて、toast に出す短い説明文と、該当セルへ飛ぶための
// ジャンプ情報 (ref + 曜日) を作る純関数群。
//
// - セルの変化は「どの曜日・時限・学年・クラスが 何 → 何」まで解決する
//   (時限ラベル等は遷移後のプロジェクト優先、消えていれば遷移前で解決)
// - セル以外 (時限・科目・講師・学年設定など) はフィールド名で要約する
// - プロジェクトの追加/削除/切替はセル単位で追わない (構成変更として要約)

import { parseCellKey, makeCellRef, REGULAR_DAYS } from "./model";

const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// タブ設定のうち schedule 以外を比較するためのビュー
const tabConfigView = (t) => ({
  name: t.name,
  grade: t.grade,
  group: t.group || "",
  classes: t.classes,
  days: t.days,
  periodIds: t.periodIds,
});

/**
 * 2 つのワークスペースの差分を「セル変更の明細 + その他の要約ラベル」に
 * まとめる。after 側を基準に解決する (undo なら after = 復元後の状態)。
 * @returns {{
 *   cellChanges: {
 *     projectId: number, tabId: number, tabName: string, ref: string,
 *     day: string, periodLabel: string, clsLabel: string,
 *     before: object|null, after: object|null,
 *   }[],
 *   otherChanges: string[],   // 重複なし・検出順
 * }}
 */
export function diffWorkspaces(before, after) {
  const cellChanges = [];
  const otherChanges = [];
  const addOther = (label) => {
    if (!otherChanges.includes(label)) otherChanges.push(label);
  };

  const beforeById = new Map((before?.projects || []).map((p) => [p.id, p]));
  const afterById = new Map((after?.projects || []).map((p) => [p.id, p]));

  for (const [id] of afterById) {
    if (!beforeById.has(id)) addOther("プロジェクトの追加/削除");
  }
  for (const [id] of beforeById) {
    if (!afterById.has(id)) addOther("プロジェクトの追加/削除");
  }

  for (const [id, ap] of afterById) {
    const bp = beforeById.get(id);
    if (!bp) continue;
    diffProject(bp, ap, id, cellChanges, addOther);
  }

  // schedule のキー順 (不定) に依存しないよう曜日順に整える。toast の
  // 「表示」ジャンプは先頭要素へ飛ぶため、順序は挙動の一部
  cellChanges.sort(
    (a, b) => REGULAR_DAYS.indexOf(a.day) - REGULAR_DAYS.indexOf(b.day)
  );
  return { cellChanges, otherChanges };
}

function diffProject(bp, ap, projectId, cellChanges, addOther) {
  if (bp.name !== ap.name) addOther("プロジェクト名");
  if (!jsonEq(bp.periods, ap.periods)) addOther("時限設定");
  if (!jsonEq(bp.subjects, ap.subjects)) addOther("科目マスタ");
  if (!jsonEq(bp.teachers, ap.teachers)) addOther("講師マスタ");
  if (!jsonEq(bp.approvedConflicts || [], ap.approvedConflicts || []))
    addOther("重なりの承認");
  if (!jsonEq(bp.snapshots || [], ap.snapshots || []))
    addOther("スナップショット");

  const bTabs = new Map((bp.tabs || []).map((t) => [t.id, t]));
  const aTabs = new Map((ap.tabs || []).map((t) => [t.id, t]));
  for (const [id] of aTabs) if (!bTabs.has(id)) addOther("学年の追加/削除");
  for (const [id] of bTabs) if (!aTabs.has(id)) addOther("学年の追加/削除");
  const bOrder = (bp.tabs || []).filter((t) => aTabs.has(t.id)).map((t) => t.id);
  const aOrder = (ap.tabs || []).filter((t) => bTabs.has(t.id)).map((t) => t.id);
  if (!jsonEq(bOrder, aOrder)) addOther("学年の並び");

  // 時限・クラスのラベル解決: after 優先、無ければ before (undo で時限ごと
  // 消えた場合など)
  const periodLabel = (pid) => {
    const per =
      (ap.periods || []).find((p) => p.id === pid) ||
      (bp.periods || []).find((p) => p.id === pid);
    return per ? per.label || per.time || `時限${pid}` : `時限${pid}`;
  };

  for (const [id, at] of aTabs) {
    const bt = bTabs.get(id);
    if (!bt) continue;
    if (!jsonEq(tabConfigView(bt), tabConfigView(at))) addOther("学年設定");

    const bSched = bt.schedule || {};
    const aSched = at.schedule || {};
    const keys = new Set([...Object.keys(bSched), ...Object.keys(aSched)]);
    for (const key of keys) {
      const bc = bSched[key] || null;
      const ac = aSched[key] || null;
      if (jsonEq(bc, ac)) continue;
      const pos = parseCellKey(key);
      const cls =
        (at.classes || []).find((c) => c.id === pos.classId) ||
        (bt.classes || []).find((c) => c.id === pos.classId);
      cellChanges.push({
        projectId,
        tabId: id,
        tabName: at.name || bt.name || "",
        ref: makeCellRef(id, key),
        day: pos.day,
        periodLabel: periodLabel(pos.periodId),
        clsLabel: cls ? cls.label || cls.room || "" : "",
        before: bc,
        after: ac,
      });
    }
  }
}

/**
 * 単一プロジェクト同士の差分 (スナップショットの差分ビュー用)。
 * diffWorkspaces を 1 プロジェクトのワークスペースに包んで流用する。
 * snapshots フィールド自体は比較対象から外す (差分ビューでは常にノイズ)。
 */
export function diffProjects(before, after) {
  const strip = (p) => {
    const { snapshots: _s, ...rest } = p || {};
    return { projects: [{ ...rest, id: 1 }] };
  };
  return diffWorkspaces(strip(before), strip(after));
}

/** セル内容の短い表記 (科目/講師。どちらも無ければ教室・備考、空セルは「空」)。
 * ロック中は 🔒 を前置する (ロックの付け外しだけの undo でも変化が見える) */
export function formatCellShort(cell) {
  if (!cell) return "空";
  const lock = cell.locked ? "🔒" : "";
  const main = [cell.subj, cell.teacher].filter(Boolean).join("/");
  if (main) return lock + main;
  const sub = [cell.room, cell.note].filter(Boolean).join(" ");
  return lock + (sub || "空");
}

/**
 * diffWorkspaces の結果を toast 用の 1 行にまとめる。差分なしは "" を返す。
 * 例:
 *   "火 3限 中3 S: 数学/田中 → 英語/山田"
 *   "5 コマの変更 (火・土)"
 *   "3 コマの変更 (月)、講師マスタ"
 *   "時限設定・学年設定"
 */
export function describeHistoryChange(diff) {
  const { cellChanges, otherChanges } = diff;
  const parts = [];
  if (cellChanges.length === 1) {
    const c = cellChanges[0];
    const place = [c.day, c.periodLabel, c.tabName, c.clsLabel]
      .filter(Boolean)
      .join(" ");
    parts.push(`${place}: ${formatCellShort(c.before)} → ${formatCellShort(c.after)}`);
  } else if (cellChanges.length > 1) {
    const days = [...new Set(cellChanges.map((c) => c.day))].sort(
      (a, b) => REGULAR_DAYS.indexOf(a) - REGULAR_DAYS.indexOf(b)
    );
    parts.push(`${cellChanges.length} コマの変更 (${days.join("・")})`);
  }
  if (otherChanges.length > 0) parts.push(otherChanges.join("・"));
  return parts.join("、");
}
