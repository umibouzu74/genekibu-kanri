// ─── コマ休講 (日付 × コマ 1 つの休講) ─────────────────────────────
// 「9/19 (土) は 15:30 より前の授業だけ休講」「このコマだけ今日は休講」の
// ように、休講 (Holiday: 日付 × 部 × 学年 × 科目) では表せない
// **コマ単位の休講**。時間割調整 (adjustments) の種別 `cancel` で表す:
//   { type: "cancel", date, slotId, memo }
// 日付 × コマの参照なので、合同・移動・振替と同じ経路 (時間割調整一覧・
// 孤立データ掃除・削除の Undo) にそのまま乗る。**休講専用のモデルは足さない。**
//
// 「そのコマがその日に休講か」は 2 つの経路を合わせて 1 か所で決める:
//   - 特別時程の部分休講 (daySchedules.cancelTimes = 学年 × 時間帯)
//   - コマ休講 (adjustments の cancel = コマ 1 つ)
// 画面・回数計算・出勤日・日まるごと振替はすべて `isSlotCancelledOnDate` を
// 通すこと (**`isSlotCancelledByDaySchedule` を直に呼ぶ経路を残さない**。
// 片方だけ見るとコマ休講が第N回を進めたり出勤日に数えられたりする)。
//
// 制限: 特別時程と同じく、隔週の週送り (biweekly) には関与しない。コマ休講に
// した隔週コマも週タイプは進む。

import { isSlotCancelledByDaySchedule, resolveSlotDaySchedule } from "./daySchedules";
import { timeStartToMin } from "./dateHelpers";

export const CANCEL_TYPE = "cancel";

const HHMM_RE = /^\d{1,2}:\d{2}/;

export function isCancelAdjustment(adj) {
  return !!adj && adj.type === CANCEL_TYPE;
}

export function cancelKey(slotId, dateStr) {
  return `${dateStr}|${slotId}`;
}

/**
 * (日付, コマ) → cancel adjustment の索引。月次のように日付ループの中から
 * 何度も引くところは、これを ctx._cancelIndex に持って線形走査を避ける。
 * @param {Array} adjustments
 * @returns {Map<string, object>}
 */
export function buildCancelIndex(adjustments) {
  const m = new Map();
  for (const adj of adjustments || []) {
    if (!isCancelAdjustment(adj)) continue;
    if (!adj.date || adj.slotId == null) continue;
    const k = cancelKey(adj.slotId, adj.date);
    if (!m.has(k)) m.set(k, adj);
  }
  return m;
}

/**
 * そのコマをその日に休講にしている cancel adjustment (無ければ null)。
 * @param {object|number} slotOrId
 * @param {string} dateStr
 * @param {Array|Map<string, object>} adjustmentsOrIndex 配列でも buildCancelIndex の Map でも
 */
export function findCancelAdjustment(slotOrId, dateStr, adjustmentsOrIndex) {
  if (!dateStr || slotOrId == null) return null;
  const slotId = typeof slotOrId === "object" ? slotOrId.id : slotOrId;
  if (slotId == null) return null;
  if (adjustmentsOrIndex instanceof Map) {
    return adjustmentsOrIndex.get(cancelKey(slotId, dateStr)) || null;
  }
  for (const adj of adjustmentsOrIndex || []) {
    if (isCancelAdjustment(adj) && adj.date === dateStr && adj.slotId === slotId) {
      return adj;
    }
  }
  return null;
}

export function isSlotCancelledByAdjustment(slotOrId, dateStr, adjustmentsOrIndex) {
  return findCancelAdjustment(slotOrId, dateStr, adjustmentsOrIndex) != null;
}

/**
 * そのコマがその日に休講か (特別時程の部分休講 or コマ休講)。
 * 休講 (Holiday) / テスト期間は含まない — それらは isOffForGrade の担当
 * (学年単位で日ごとに決まるので、コマを持たない画面でも判定できる)。
 *
 * @param {object} slot
 * @param {string} dateStr
 * @param {{daySchedules?: Array, adjustments?: Array, _cancelIndex?: Map}} [ctx]
 */
export function isSlotCancelledOnDate(slot, dateStr, ctx = {}) {
  if (!slot || !dateStr) return false;
  if (isSlotCancelledByDaySchedule(slot, dateStr, ctx?.daySchedules)) return true;
  const index = ctx?._cancelIndex;
  if (index instanceof Map) return index.has(cancelKey(slot.id, dateStr));
  return isSlotCancelledByAdjustment(slot, dateStr, ctx?.adjustments);
}

/**
 * 休講の理由 (表示用)。無ければ null。
 * @returns {null | {kind: "daySchedule", schedule: object} | {kind: "cancel", adj: object}}
 */
export function slotCancelReason(slot, dateStr, ctx = {}) {
  if (!slot || !dateStr) return null;
  const r = resolveSlotDaySchedule(slot, dateStr, ctx?.daySchedules);
  if (r?.cancelled) return { kind: "daySchedule", schedule: r.schedule };
  const adj = findCancelAdjustment(
    slot,
    dateStr,
    ctx?._cancelIndex instanceof Map ? ctx._cancelIndex : ctx?.adjustments
  );
  return adj ? { kind: "cancel", adj } : null;
}

/**
 * その日にコマ休講になっているコマを時刻順に集める (日単位のバナー用)。
 * slots は日付で絞る前の一覧でもよい (cancel adjustment が指すコマだけ拾う)。
 * @returns {{slot: object, adj: object}[]}
 */
export function collectCancelledSlots(slots, dateStr, adjustments) {
  if (!dateStr || !adjustments?.length) return [];
  const byId = new Map((slots || []).map((s) => [s.id, s]));
  const out = [];
  const seen = new Set();
  for (const adj of adjustments) {
    if (!isCancelAdjustment(adj) || adj.date !== dateStr) continue;
    if (seen.has(adj.slotId)) continue;
    const slot = byId.get(adj.slotId);
    if (!slot) continue;
    seen.add(adj.slotId);
    out.push({ slot, adj });
  }
  return out.sort(
    (a, b) => timeStartToMin(a.slot.time) - timeStartToMin(b.slot.time) || a.slot.id - b.slot.id
  );
}

/**
 * 「◯◯:◯◯ より前に始まるコマ」を選ぶ (一括休講ダイアログの補助)。
 * 9/19 のように「15:30 以降は通常運行」を 1 手で選べるようにする。
 * @param {Array} slots
 * @param {string} hhmm "15:30"
 * @returns {Array} 開始時刻が hhmm より前のコマ (時刻の読めないコマは含めない)
 */
export function slotsStartingBefore(slots, hhmm) {
  if (!HHMM_RE.test(String(hhmm || ""))) return [];
  const limit = timeStartToMin(hhmm);
  return (slots || []).filter(
    (s) => HHMM_RE.test(String(s?.time || "")) && timeStartToMin(s.time) < limit
  );
}
