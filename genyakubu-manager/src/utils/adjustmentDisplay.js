// 調整 (合同/移動) の表示用インデックスを日付ごとに構築するヘルパ。
// ビュー側で同じロジックを繰り返さないために集約。

/**
 * 指定日の adjustments から、slot id ベースの表示用情報を構築する。
 *
 * @param {Array} adjustments  全 adjustments 配列
 * @param {string} date        "YYYY-MM-DD"
 * @returns {{
 *   combineAbsorbedBySlot: Map<number, number>,       // absorbedSlotId -> hostSlotId
 *   combineHostBySlot: Map<number, number[]>,         // hostSlotId -> absorbedSlotIds[]
 *   moveBySlot: Map<number, string>,                  // slotId -> targetTime
 * }}
 */
export function buildAdjustmentIndex(adjustments, date) {
  const combineAbsorbedBySlot = new Map();
  const combineHostBySlot = new Map();
  const moveBySlot = new Map();
  if (!adjustments || !date) {
    return { combineAbsorbedBySlot, combineHostBySlot, moveBySlot };
  }
  for (const adj of adjustments) {
    if (adj.date !== date) continue;
    if (adj.type === "combine") {
      const ids = adj.combineSlotIds || [];
      if (ids.length > 0) combineHostBySlot.set(adj.slotId, [...ids]);
      for (const id of ids) combineAbsorbedBySlot.set(id, adj.slotId);
    } else if (adj.type === "move" && adj.targetTime) {
      moveBySlot.set(adj.slotId, adj.targetTime);
    }
  }
  return { combineAbsorbedBySlot, combineHostBySlot, moveBySlot };
}

// スロットの短い表示ラベル "grade(cls) subj" を返す。slot が null の場合は fallback。
export function describeSlot(slot, fallback = "(不明コマ)") {
  if (!slot) return fallback;
  const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
  return `${slot.grade}${cls} ${slot.subj}`;
}
