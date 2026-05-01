// 削除済みコマに紐づく代行 / 時間割調整 / 回数補正を検出するユーティリティ。
// useSlotsCrud の cascade 削除が導入される前に作られた orphan データの
// 一括掃除に使用する。検出ロジックは「コマ削除時の cascade 」と整合させる。

/**
 * 既存コマが参照する slot id の集合を作る。
 * @param {Array<{id:number}>} slots
 * @returns {Set<number>}
 */
function buildLiveSlotIdSet(slots) {
  const set = new Set();
  for (const s of slots || []) {
    if (s && s.id != null) set.add(s.id);
  }
  return set;
}

/**
 * 孤立した代行 (slot 削除済み) を返す。
 */
export function findOrphanSubs(subs, slots) {
  const live = buildLiveSlotIdSet(slots);
  return (subs || []).filter((r) => !live.has(r.slotId));
}

/**
 * 孤立した回数補正 (slot 削除済み) を返す。
 */
export function findOrphanOverrides(sessionOverrides, slots) {
  const live = buildLiveSlotIdSet(slots);
  return (sessionOverrides || []).filter((o) => !live.has(o.slotId));
}

/**
 * 時間割調整の orphan 解析。
 * - removed: host slot が削除済 → 完全削除対象
 * - updated: combine の吸収側 (combineSlotIds) のみに含まれる削除済 id を
 *   抜くだけ。すべての吸収側が削除済 (host は生きている) なら、結果として
 *   combineSlotIds が空になり、その合同自体は無意味になるため removed 扱い。
 *
 * @returns {{
 *   removed: Array<object>,
 *   updated: Array<{ original: object, next: object }>,
 * }}
 */
export function analyzeOrphanAdjustments(adjustments, slots) {
  const live = buildLiveSlotIdSet(slots);
  const removed = [];
  const updated = [];
  for (const adj of adjustments || []) {
    if (!adj) continue;
    if (!live.has(adj.slotId)) {
      removed.push(adj);
      continue;
    }
    if (adj.type === "combine" && Array.isArray(adj.combineSlotIds)) {
      const remaining = adj.combineSlotIds.filter((id) => live.has(id));
      if (remaining.length === adj.combineSlotIds.length) continue; // 変化なし
      if (remaining.length === 0) {
        removed.push(adj);
      } else {
        updated.push({ original: adj, next: { ...adj, combineSlotIds: remaining } });
      }
    }
  }
  return { removed, updated };
}

/**
 * 全 orphan を一括検出。表示用に件数も返す。
 */
export function detectOrphans({ slots, subs, adjustments, sessionOverrides }) {
  const orphanSubs = findOrphanSubs(subs, slots);
  const orphanOverrides = findOrphanOverrides(sessionOverrides, slots);
  const adj = analyzeOrphanAdjustments(adjustments, slots);
  const total =
    orphanSubs.length +
    adj.removed.length +
    adj.updated.length +
    orphanOverrides.length;
  return {
    orphanSubs,
    orphanAdjustments: adj.removed,
    updatedAdjustments: adj.updated,
    orphanOverrides,
    total,
  };
}

/**
 * 検出結果を反映するための新しいリストを返す (純粋関数)。
 */
export function applyOrphanCleanup({
  subs,
  adjustments,
  sessionOverrides,
  detection,
}) {
  const subRemovedIds = new Set(detection.orphanSubs.map((r) => r.id));
  const adjRemovedIds = new Set(detection.orphanAdjustments.map((a) => a.id));
  const adjUpdatedById = new Map(
    detection.updatedAdjustments.map(({ next }) => [next.id, next])
  );
  const overrideRemovedIds = new Set(detection.orphanOverrides.map((o) => o.id));

  const nextSubs = (subs || []).filter((r) => !subRemovedIds.has(r.id));
  const nextAdjustments = [];
  for (const a of adjustments || []) {
    if (adjRemovedIds.has(a.id)) continue;
    if (adjUpdatedById.has(a.id)) {
      nextAdjustments.push(adjUpdatedById.get(a.id));
    } else {
      nextAdjustments.push(a);
    }
  }
  const nextOverrides = (sessionOverrides || []).filter(
    (o) => !overrideRemovedIds.has(o.id)
  );
  return { nextSubs, nextAdjustments, nextOverrides };
}
