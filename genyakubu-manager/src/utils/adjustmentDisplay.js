// 調整 (合同/移動/振替) の表示用インデックスを日付ごとに構築するヘルパ。
// ビュー側で同じロジックを繰り返さないために集約。

import { resolveSlotDaySchedule } from "./daySchedules";
import { dateToDay } from "./dateHelpers";

/**
 * 指定日の adjustments から、slot id ベースの表示用情報を構築する。
 * 振替 (reschedule) は、date が源泉日と一致するコマを
 * rescheduleOutBySlot に、targetDate が一致する (他日からこの日へ入る)
 * コマを rescheduleInBySlot にそれぞれ集約する。
 *
 * opts.slots + opts.daySchedules を渡すと、特別時程 (日単位の時刻読み替え)
 * を moveBySlot に合流させる — 既存のコマ移動表示 (実効時間グループ化・
 * 移 バッジ) がそのまま特別時程にも効く。個別の move 調整が同じコマに
 * ある場合はそちらが優先。特別時程由来の読み替えは dayScheduleMoveBySlot
 * にも載る (バッジのツールチップ出し分け用)。cancelTimes による部分休講は
 * ここでは扱わない (休講系の表示・フィルタはビュー側の既存経路で行う)。
 *
 * @param {Array} adjustments  全 adjustments 配列
 * @param {string} date        "YYYY-MM-DD"
 * @param {{slots?: Array, daySchedules?: Array}} [opts]
 * @returns {{
 *   combineAbsorbedBySlot: Map<number, number>,
 *   combineHostBySlot: Map<number, number[]>,
 *   moveBySlot: Map<number, string>,
 *   rescheduleOutBySlot: Map<number, object>,  // slotId -> adjustment (他日へ出ていく)
 *   rescheduleInBySlot: Map<number, object>,   // slotId -> adjustment (他日から来る)
 *   dayScheduleMoveBySlot: Map<number, object>, // slotId -> DaySchedule (特別時程由来)
 * }}
 */
export function buildAdjustmentIndex(adjustments, date, opts = {}) {
  const combineAbsorbedBySlot = new Map();
  const combineHostBySlot = new Map();
  const moveBySlot = new Map();
  const rescheduleOutBySlot = new Map();
  const rescheduleInBySlot = new Map();
  const dayScheduleMoveBySlot = new Map();
  const index = {
    combineAbsorbedBySlot,
    combineHostBySlot,
    moveBySlot,
    rescheduleOutBySlot,
    rescheduleInBySlot,
    dayScheduleMoveBySlot,
  };
  if (!date) return index;
  for (const adj of adjustments || []) {
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

  // 特別時程の時刻読み替えを合流 (個別 move 優先)。休講扱い
  // (resolve が cancelled を返すコマ) には読み替えを作らない。
  // opts.slots は曜日フィルタ前の一覧でも良いよう、date の曜日と
  // slot.day が一致するコマだけを対象にする。
  if (Array.isArray(opts.daySchedules) && Array.isArray(opts.slots)) {
    const dow = dateToDay(date);
    for (const s of opts.slots) {
      if (dow && s.day !== dow) continue;
      if (moveBySlot.has(s.id)) continue;
      const r = resolveSlotDaySchedule(s, date, opts.daySchedules);
      if (r && !r.cancelled && r.time) {
        moveBySlot.set(s.id, r.time);
        dayScheduleMoveBySlot.set(s.id, r.schedule);
      }
    }
  }
  return index;
}

// スロットの短い表示ラベル "grade(cls) subj" を返す。slot が null の場合は fallback。
export function describeSlot(slot, fallback = "(不明コマ)") {
  if (!slot) return fallback;
  const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
  return `${slot.grade}${cls} ${slot.subj}`;
}
