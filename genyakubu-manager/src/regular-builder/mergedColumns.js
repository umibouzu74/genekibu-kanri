// ─── 合同列 (範囲・列挙ラベル) のセル結合表示 ───────────────────────
// 「S〜B」「SS〜C」(範囲) や「S/AB」「S/AB/C」(列挙) のようなラベルの
// クラス列 (合同コマ用に取込が作る列) を、独立した列としてではなく、
// 構成クラス (S・A・B …) の上に Excel のセル結合のように colSpan で
// 表示するためのレイアウト計算。
//
// - 範囲ラベル: `始点(〜|～|~)終点`。始点・終点が同じ学年の通常クラスの
//   ラベルに一致し、始点が終点より左にある場合のみ合同列として扱う
// - 列挙ラベル: `A/B/C`。構成クラスがすべて存在し、かつ表示順で隙間なく
//   隣接している場合のみ (「S/C」の間に A を挟む等は、跨いだ colSpan が
//   A も合同に見えて誤解を招くため通常の列のまま)
// - 解釈できないラベルは通常の列のまま
// - データモデルは不変: 合同列はクラス列として存在し続け、セルも
//   (day, periodId, 合同列の classId) のまま。反映の round-trip も不変。
// - 同じスパンの合同列が複数ある並列合同 (確認テストの複数監督など) は、
//   スパンを列数で分割して横に並べる (5 列を 2 セルなら 3+2)
// - 「同じ行に合同セルと構成クラスの個別セルが両方ある」「スパン同士が
//   部分的に交差する」「並列数がスパン幅を超える」データは結合表示
//   できないため、その学年は従来の独立列表示にフォールバックする
//   (mergeFallback)

import { makeCellKey } from "./model";

const RANGE_RE = /^(.+?)[〜～~](.+)$/;

const isCandidateLabel = (label) =>
  RANGE_RE.test(label || "") || (label || "").includes("/");

// ラベルを visible 上のスパン [startIdx, endIdx] に解決する (不能なら null)
function parseSpan(label, idxByLabel) {
  const m = RANGE_RE.exec(label || "");
  if (m) {
    const startIdx = idxByLabel.get(m[1]);
    const endIdx = idxByLabel.get(m[2]);
    if (startIdx == null || endIdx == null || startIdx > endIdx) return null;
    return [startIdx, endIdx];
  }
  if ((label || "").includes("/")) {
    const parts = label.split("/").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const idxs = parts.map((p) => idxByLabel.get(p));
    if (idxs.some((x) => x == null)) return null;
    const min = Math.min(...idxs);
    const max = Math.max(...idxs);
    // 列挙が隙間なく連続している場合のみ (重複列挙もここで弾かれる)
    if (new Set(idxs).size !== max - min + 1) return null;
    return [min, max];
  }
  return null;
}

/**
 * タブのクラス列を「表示列 (通常クラス)」と「合同列 (スパン付き)」に分ける。
 * @returns {{visible: object[], ranges: {cls: object, startIdx: number, endIdx: number}[]}}
 *   startIdx / endIdx は visible 配列上の添字 (両端含む)
 */
export function computeMergeLayout(tab) {
  const classes = tab.classes || [];
  // まず構文上の候補 (〜 か / を含むラベル) を除いた表示列で検証し、
  // 解釈できない候補は表示列へ戻して繰り返す (戻すと添字が変わるため
  // 固定点まで回す。候補は単調に減るので必ず停止する)
  const excluded = new Set(
    classes.filter((c) => isCandidateLabel(c.label)).map((c) => c.id)
  );
  for (;;) {
    const visible = classes.filter((c) => !excluded.has(c.id));
    const idxByLabel = new Map();
    visible.forEach((c, i) => {
      if (!idxByLabel.has(c.label)) idxByLabel.set(c.label, i);
    });
    const ranges = [];
    const invalid = [];
    for (const c of classes) {
      if (!excluded.has(c.id)) continue;
      const span = parseSpan(c.label, idxByLabel);
      if (span) ranges.push({ cls: c, startIdx: span[0], endIdx: span[1] });
      else invalid.push(c.id);
    }
    if (invalid.length === 0) return { visible, ranges };
    for (const id of invalid) excluded.delete(id);
  }
}

/**
 * 結合表示できないデータかどうか (その学年は独立列表示へフォールバック)。
 * - 範囲セルと同じ行に、そのスパン内の構成クラスの個別セルがある
 * - 異なるスパンの範囲セル同士が同じ行で交差する
 * @param {object[]} periods その曜日に表示される時限 (section の行)
 */
export function mergeFallback(tab, day, periods, layout) {
  if (layout.ranges.length === 0) return false;
  const useP = new Set(tab.periodIds || []);
  for (const per of periods) {
    if (!useP.has(per.id)) continue;
    const present = layout.ranges.filter(
      (r) => tab.schedule[makeCellKey(day, per.id, r.cls.id)]
    );
    if (present.length === 0) continue;
    // スパン内の構成クラスに個別セルがあるか
    for (const r of present) {
      for (let i = r.startIdx; i <= r.endIdx; i++) {
        const cls = layout.visible[i];
        if (cls && tab.schedule[makeCellKey(day, per.id, cls.id)]) return true;
      }
    }
    // 異なるスパン同士の交差 (同一スパンの並列はスパン分割で表示できる)
    for (let a = 0; a < present.length; a++) {
      for (let b = a + 1; b < present.length; b++) {
        const ra = present[a];
        const rb = present[b];
        const same = ra.startIdx === rb.startIdx && ra.endIdx === rb.endIdx;
        const overlap = ra.startIdx <= rb.endIdx && rb.startIdx <= ra.endIdx;
        if (!same && overlap) return true;
      }
    }
    // 並列数がスパン幅を超える (幅 0 のセルが出て非表示になる) 場合も
    // 結合表示できない
    const spanCounts = new Map();
    for (const r of present) {
      const k = `${r.startIdx}-${r.endIdx}`;
      spanCounts.set(k, (spanCounts.get(k) || 0) + 1);
    }
    for (const [k, n] of spanCounts) {
      const [s, e] = k.split("-").map(Number);
      if (n > e - s + 1) return true;
    }
  }
  return false;
}

/**
 * 「空列を隠す」用: その曜日にセルが 1 つも無いクラス列を除いた表示列を
 * 返す (データ不変・表示専用)。中身のある合同列 (範囲・列挙) は、その
 * スパンの構成クラスが個別には空でも colSpan の下敷きとして必要なので
 * 残す。時限は tab.periodIds のものだけ数える (設定変更で無効になった
 * 残骸セルでは列を残さない)。
 */
export function visibleClassesForDay(tab, day) {
  const layout = computeMergeLayout(tab);
  const periodIds = tab.periodIds || [];
  const schedule = tab.schedule || {};
  const hasCell = (clsId) =>
    periodIds.some((pid) => schedule[makeCellKey(day, pid, clsId)]);
  const keep = new Set();
  for (const c of tab.classes || []) {
    if (hasCell(c.id)) keep.add(c.id);
  }
  for (const r of layout.ranges) {
    if (!keep.has(r.cls.id)) continue;
    for (let i = r.startIdx; i <= r.endIdx; i++) {
      const member = layout.visible[i];
      if (member) keep.add(member.id);
    }
  }
  return (tab.classes || []).filter((c) => keep.has(c.id));
}

/**
 * 並列合同 (同一スパンに k 個の範囲セル) の colSpan 配分。
 * スパン幅を k 分割し、余りは先頭から 1 ずつ足す (5 を 2 分割 → 3, 2)。
 */
export function splitSpan(spanLen, k) {
  const base = Math.floor(spanLen / k);
  const rem = spanLen % k;
  return Array.from({ length: k }, (_, i) => base + (i < rem ? 1 : 0));
}
