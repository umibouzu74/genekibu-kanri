// ─── 合同列 (範囲ラベル) のセル結合表示 ─────────────────────────────
// 「S〜B」「SS〜C」のようなラベルのクラス列 (合同コマ用に取込が作る列)
// を、独立した列としてではなく、構成クラス (S・A・B …) の上に Excel の
// セル結合のように colSpan で表示するためのレイアウト計算。
//
// - 範囲ラベル: `始点(〜|～|~)終点`。始点・終点が同じ学年の通常クラスの
//   ラベルに一致し、始点が終点より左にある場合のみ範囲列として扱う
//   (解釈できないラベルは通常の列のまま)
// - データモデルは不変: 範囲列はクラス列として存在し続け、セルも
//   (day, periodId, 範囲列の classId) のまま。反映の round-trip も不変。
// - 同じ範囲ラベルが複数列ある並列合同 (確認テストの複数監督など) は、
//   スパンを列数で分割して横に並べる (5 列を 2 セルなら 3+2)
// - 「同じ行に範囲セルと構成クラスの個別セルが両方ある」「範囲同士が
//   部分的に交差する」データは結合表示できないため、その学年は従来の
//   独立列表示にフォールバックする (mergeFallback)

import { makeCellKey } from "./model";

const RANGE_RE = /^(.+?)[〜～~](.+)$/;

/**
 * タブのクラス列を「表示列 (通常クラス)」と「範囲列」に分ける。
 * @returns {{visible: object[], ranges: {cls: object, startIdx: number, endIdx: number}[]}}
 *   startIdx / endIdx は visible 配列上の添字 (両端含む)
 */
export function computeMergeLayout(tab) {
  const classes = tab.classes || [];
  const candidates = new Map(); // cls.id → [start, end] (ラベル文字列)
  for (const cls of classes) {
    const m = RANGE_RE.exec(cls.label || "");
    if (m) candidates.set(cls.id, [m[1], m[2]]);
  }
  const visible = classes.filter((c) => !candidates.has(c.id));
  const idxByLabel = new Map();
  visible.forEach((c, i) => {
    if (!idxByLabel.has(c.label)) idxByLabel.set(c.label, i);
  });

  const ranges = [];
  const invalid = new Set();
  for (const cls of classes) {
    const cand = candidates.get(cls.id);
    if (!cand) continue;
    const startIdx = idxByLabel.get(cand[0]);
    const endIdx = idxByLabel.get(cand[1]);
    if (startIdx == null || endIdx == null || startIdx > endIdx) {
      invalid.add(cls.id); // 解釈不能 → 通常の列に戻す
      continue;
    }
    ranges.push({ cls, startIdx, endIdx });
  }
  if (invalid.size) {
    // 通常列へ戻す (元の並び順を保つ)
    const vis = classes.filter((c) => !candidates.has(c.id) || invalid.has(c.id));
    return computeMergeLayoutWithVisible(vis, ranges);
  }
  return { visible, ranges };
}

// invalid 混在時の再構築: visible が変わると添字がずれるため引き直す
function computeMergeLayoutWithVisible(visible, prevRanges) {
  const idxByLabel = new Map();
  visible.forEach((c, i) => {
    if (!idxByLabel.has(c.label)) idxByLabel.set(c.label, i);
  });
  const ranges = [];
  for (const r of prevRanges) {
    const m = RANGE_RE.exec(r.cls.label || "");
    const startIdx = idxByLabel.get(m[1]);
    const endIdx = idxByLabel.get(m[2]);
    if (startIdx == null || endIdx == null || startIdx > endIdx) continue;
    ranges.push({ cls: r.cls, startIdx, endIdx });
  }
  return { visible, ranges };
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
 * 並列合同 (同一スパンに k 個の範囲セル) の colSpan 配分。
 * スパン幅を k 分割し、余りは先頭から 1 ずつ足す (5 を 2 分割 → 3, 2)。
 */
export function splitSpan(spanLen, k) {
  const base = Math.floor(spanLen / k);
  const rem = spanLen % k;
  return Array.from({ length: k }, (_, i) => base + (i < rem ? 1 : 0));
}
