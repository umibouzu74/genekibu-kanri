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
 * - removed: 完全削除対象。
 *     - host slot (adj.slotId) が削除済
 *     - move: 元コマも targetSlotId の参照先も両方とも削除済
 *     - combine の吸収側がすべて削除済 (host だけ生存しているケース)
 * - updated: 部分修正で生存させられるケース。
 *     - combine: 一部の combineSlotIds だけ削除済 → 抜くだけ
 *     - reschedule / move: targetSlotId の参照先だけ削除済 → ピッカーで
 *       選んだ参照は失うが、targetDate / targetTime / targetTeacher 等の
 *       テキスト情報は意味があるので残し、targetSlotId のみ取り除く。
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

    // 元コマ (adj.slotId) が消えていたら、調整自体が無意味なので removed。
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
      continue;
    }

    // move / reschedule の targetSlotId は省略可だが、入っていて参照先が
    // 消えていれば、targetSlotId だけ落とす (テキスト情報は残す)。
    if (
      (adj.type === "move" || adj.type === "reschedule") &&
      adj.targetSlotId != null &&
      !live.has(adj.targetSlotId)
    ) {
      const next = { ...adj };
      delete next.targetSlotId;
      updated.push({ original: adj, next });
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
