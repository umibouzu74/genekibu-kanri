// 調整 (合同/移動/振替) の表示用インデックスを日付ごとに構築するヘルパ。
// ビュー側で同じロジックを繰り返さないために集約。

/**
 * 指定日の adjustments から、slot id ベースの表示用情報を構築する。
 * 振替 (reschedule) は、date が源泉日と一致するコマを
 * rescheduleOutBySlot に、targetDate が一致する (他日からこの日へ入る)
 * コマを rescheduleInBySlot にそれぞれ集約する。
 *
 * @param {Array} adjustments  全 adjustments 配列
 * @param {string} date        "YYYY-MM-DD"
 * @returns {{
 *   combineAbsorbedBySlot: Map<number, number>,
 *   combineHostBySlot: Map<number, number[]>,
 *   moveBySlot: Map<number, string>,
 *   rescheduleOutBySlot: Map<number, object>,  // slotId -> adjustment (他日へ出ていく)
 *   rescheduleInBySlot: Map<number, object>,   // slotId -> adjustment (他日から来る)
 * }}
 */
export function buildAdjustmentIndex(adjustments, date) {
  const combineAbsorbedBySlot = new Map();
  const combineHostBySlot = new Map();
  const moveBySlot = new Map();
  const rescheduleOutBySlot = new Map();
  const rescheduleInBySlot = new Map();
  if (!adjustments || !date) {
    return {
      combineAbsorbedBySlot,
      combineHostBySlot,
      moveBySlot,
      rescheduleOutBySlot,
      rescheduleInBySlot,
    };
  }
  for (const adj of adjustments) {
    if (adj.type === "reschedule") {
      if (adj.date === date) rescheduleOutBySlot.set(adj.slotId, adj);
      if (adj.targetDate === date) rescheduleInBySlot.set(adj.slotId, adj);
      continue;
    }
    if (adj.date !== date) continue;
    if (adj.type === "combine") {
      const ids = adj.combineSlotIds || [];
      if (ids.length > 0) combineHostBySlot.set(adj.slotId, [...ids]);
      for (const id of ids) combineAbsorbedBySlot.set(id, adj.slotId);
    } else if (adj.type === "move" && adj.targetTime) {
      moveBySlot.set(adj.slotId, adj.targetTime);
    }
  }
  return {
    combineAbsorbedBySlot,
    combineHostBySlot,
    moveBySlot,
    rescheduleOutBySlot,
    rescheduleInBySlot,
  };
}

// スロットの短い表示ラベル "grade(cls) subj" を返す。slot が null の場合は fallback。
export function describeSlot(slot, fallback = "(不明コマ)") {
  if (!slot) return fallback;
  const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
  return `${slot.grade}${cls} ${slot.subj}`;
}
