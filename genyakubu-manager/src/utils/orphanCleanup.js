// 削除済みコマに紐づく代行 / 時間割調整 / 回数補正を検出するユーティリティ。
// useSlotsCrud の cascade 削除が導入される前に作られた orphan データの
// 一括掃除に使用する。検出ロジックは「コマ削除時の cascade 」と整合させる。

/**
 * 既存コマが参照する slot id の集合を作る。
 * K2f: schema の FK 検証 (toSlotIdKey) は string/number を同一視するのに、
 * ここが厳格比較だと文字列 slotId (Firebase 手編集等) の参照が「孤立」と
 * 誤検出される。String 化して型を正規化する (has 側も同様)。
 * @param {Array<{id:number}>} slots
 * @returns {Set<string>}
 */
function buildLiveSlotIdSet(slots) {
  const set = new Set();
  for (const s of slots || []) {
    if (s && s.id != null) set.add(String(s.id));
  }
  return set;
}

// live set の照合キー (buildLiveSlotIdSet と対で使う)
function slotIdKey(v) {
  return String(v);
}

/**
 * 孤立した代行 (slot 削除済み) を返す。
 */
export function findOrphanSubs(subs, slots) {
  const live = buildLiveSlotIdSet(slots);
  return (subs || []).filter((r) => !live.has(slotIdKey(r.slotId)));
}

/**
 * 孤立した回数補正 (slot 削除済み) を返す。
 */
export function findOrphanOverrides(sessionOverrides, slots) {
  const live = buildLiveSlotIdSet(slots);
  return (sessionOverrides || []).filter((o) => !live.has(slotIdKey(o.slotId)));
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
    if (!live.has(slotIdKey(adj.slotId))) {
      removed.push(adj);
      continue;
    }

    if (adj.type === "combine" && Array.isArray(adj.combineSlotIds)) {
      const remaining = adj.combineSlotIds.filter((id) => live.has(slotIdKey(id)));
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
      !live.has(slotIdKey(adj.targetSlotId))
    ) {
      const next = { ...adj };
      delete next.targetSlotId;
      updated.push({ original: adj, next });
    }
  }
  return { removed, updated };
}

/**
 * 旧形式 (slotIds) の授業セットの orphan 解析。units 形式 (学年 × 曜日) は
 * コマ id を参照しないので対象外。
 * - removed: slotIds の参照先が全部消えた (セットとして意味が無い)
 * - updated: 一部だけ消えた → 消えた id を抜くだけ
 * (2026-09-04: 反映の「置き換え」で残る旧式セットが、掃除の対象外だった)
 *
 * @returns {{ removed: Array<object>, updated: Array<{ original: object, next: object }> }}
 */
export function analyzeOrphanClassSets(classSets, slots) {
  const live = buildLiveSlotIdSet(slots);
  const removed = [];
  const updated = [];
  for (const set of classSets || []) {
    if (!set) continue;
    if (Array.isArray(set.units) && set.units.length > 0) continue;
    if (!Array.isArray(set.slotIds)) continue;
    const remaining = set.slotIds.filter((id) => live.has(slotIdKey(id)));
    if (remaining.length === set.slotIds.length) continue;
    if (remaining.length === 0) {
      removed.push(set);
    } else {
      updated.push({ original: set, next: { ...set, slotIds: remaining } });
    }
  }
  return { removed, updated };
}

/**
 * 全 orphan を一括検出。表示用に件数も返す。classSets は省略可 (旧呼び出し)。
 */
export function detectOrphans({ slots, subs, adjustments, sessionOverrides, classSets }) {
  const orphanSubs = findOrphanSubs(subs, slots);
  const orphanOverrides = findOrphanOverrides(sessionOverrides, slots);
  const adj = analyzeOrphanAdjustments(adjustments, slots);
  const sets = analyzeOrphanClassSets(classSets, slots);
  const total =
    orphanSubs.length +
    adj.removed.length +
    adj.updated.length +
    orphanOverrides.length +
    sets.removed.length +
    sets.updated.length;
  return {
    orphanSubs,
    orphanAdjustments: adj.removed,
    updatedAdjustments: adj.updated,
    orphanOverrides,
    orphanClassSets: sets.removed,
    updatedClassSets: sets.updated,
    total,
  };
}

/**
 * 検出結果を反映するための新しいリストを返す (純粋関数)。
 * classSets を渡さなければ nextClassSets は undefined。
 */
export function applyOrphanCleanup({
  subs,
  adjustments,
  sessionOverrides,
  classSets,
  detection,
}) {
  const subRemovedIds = new Set(detection.orphanSubs.map((r) => r.id));
  const adjRemovedIds = new Set(detection.orphanAdjustments.map((a) => a.id));
  const adjUpdatedById = new Map(
    detection.updatedAdjustments.map(({ next }) => [next.id, next])
  );
  const overrideRemovedIds = new Set(detection.orphanOverrides.map((o) => o.id));
  const setRemovedIds = new Set((detection.orphanClassSets || []).map((s) => s.id));
  const setUpdatedById = new Map(
    (detection.updatedClassSets || []).map(({ next }) => [next.id, next])
  );

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
  let nextClassSets;
  if (classSets) {
    nextClassSets = [];
    for (const s of classSets) {
      if (setRemovedIds.has(s.id)) continue;
      nextClassSets.push(setUpdatedById.has(s.id) ? setUpdatedById.get(s.id) : s);
    }
  }
  return { nextSubs, nextAdjustments, nextOverrides, nextClassSets };
}

/**
 * 「消えたコマ」の後始末を 1 か所で。反映 (置き換え) や一括削除の後に、
 * 新しい slots に対して孤立した代行・調整・回数補正・旧式授業セットを
 * 検出して掃除済みのリストを返す。何も無ければ detection.total === 0。
 * 呼び出し側は変わったリストだけ保存すればよい (`changed` フラグ)。
 */
export function cascadeOrphansForSlots({
  slots,
  subs,
  adjustments,
  sessionOverrides,
  classSets,
}) {
  const detection = detectOrphans({ slots, subs, adjustments, sessionOverrides, classSets });
  if (detection.total === 0) {
    return { detection, changed: {}, nextSubs: subs, nextAdjustments: adjustments, nextOverrides: sessionOverrides, nextClassSets: classSets };
  }
  const next = applyOrphanCleanup({ subs, adjustments, sessionOverrides, classSets, detection });
  return {
    detection,
    changed: {
      subs: detection.orphanSubs.length > 0,
      adjustments:
        detection.orphanAdjustments.length > 0 || detection.updatedAdjustments.length > 0,
      sessionOverrides: detection.orphanOverrides.length > 0,
      classSets: detection.orphanClassSets.length > 0 || detection.updatedClassSets.length > 0,
    },
    ...next,
  };
}

/** 検出結果を「代行 N 件 / 調整 N 件 …」の短い文にする (toast・確認文用) */
export function describeOrphanDetection(detection) {
  const parts = [];
  if (detection.orphanSubs.length) parts.push(`代行 ${detection.orphanSubs.length} 件`);
  if (detection.orphanAdjustments.length)
    parts.push(`調整 ${detection.orphanAdjustments.length} 件`);
  if (detection.updatedAdjustments.length)
    parts.push(`合同 ${detection.updatedAdjustments.length} 件更新`);
  if (detection.orphanOverrides.length)
    parts.push(`回数補正 ${detection.orphanOverrides.length} 件`);
  if (detection.orphanClassSets?.length)
    parts.push(`授業セット ${detection.orphanClassSets.length} 件`);
  if (detection.updatedClassSets?.length)
    parts.push(`授業セット ${detection.updatedClassSets.length} 件更新`);
  return parts.join(" / ");
}
