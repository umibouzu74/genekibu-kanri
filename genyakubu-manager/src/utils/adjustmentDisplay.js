// 調整 (合同/移動/振替) の表示用インデックスを日付ごとに構築するヘルパ。
// ビュー側で同じロジックを繰り返さないために集約。

import { resolveSlotDaySchedule } from "./daySchedules";
import { dateToDay, fmtDateWeekday, timeStartToMin } from "./dateHelpers";

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

/**
 * 他日から「その日へ」振り替えられてくるコマを集める (時刻順)。
 * 元コマは別の曜日に属するので、日付で絞ったコマ一覧には出てこない。
 * ダッシュボード日別・タイムテーブルのバナーで共有する。
 *
 * **休講・全日休講で除外しないこと。** 「その日にやる」と明示登録された
 * コマなので、休みの日へ寄せる日まるごと振替の受け先で消えてしまう。
 *
 * @param {Array} adjustments
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {Array} slots 元コマを引くための一覧 (全コマ)
 * @returns {{adj: object, slot: object}[]}
 */
export function collectIncomingReschedules(adjustments, dateStr, slots) {
  if (!dateStr || !adjustments?.length) return [];
  const byId = new Map((slots || []).map((s) => [s.id, s]));
  const out = [];
  for (const adj of adjustments) {
    if (adj?.type !== "reschedule" || adj.targetDate !== dateStr) continue;
    const slot = byId.get(adj.slotId);
    if (slot) out.push({ adj, slot });
  }
  return out.sort(
    (a, b) =>
      timeStartToMin(a.adj.targetTime || a.slot.time) -
      timeStartToMin(b.adj.targetTime || b.slot.time)
  );
}

// スロットの短い表示ラベル "grade(cls) subj" を返す。slot が null の場合は fallback。
export function describeSlot(slot, fallback = "(不明コマ)") {
  if (!slot) return fallback;
  const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
  return `${slot.grade}${cls} ${slot.subj}`;
}

/**
 * 「この日から他日へ出ていく」振替を、渡したコマの範囲で集める (時刻順)。
 * rescheduleOutBySlot は buildAdjustmentIndex の戻り値のものをそのまま渡す。
 *
 * @param {Array} slots その日に表示しているコマ (ビューごとに絞り込み済み)
 * @param {Map<number, object>} rescheduleOutBySlot
 * @returns {{slot: object, adj: object}[]}
 */
export function collectOutgoingReschedules(slots, rescheduleOutBySlot) {
  if (!slots?.length || !rescheduleOutBySlot?.size) return [];
  const out = [];
  for (const slot of slots) {
    const adj = rescheduleOutBySlot.get(slot.id);
    if (adj) out.push({ slot, adj });
  }
  return out.sort(
    (a, b) => timeStartToMin(a.slot.time) - timeStartToMin(b.slot.time)
  );
}

/**
 * その日が「振替で授業なし」= 実質休みになったか。
 *
 * 出ていくコマの数だけでは足りない。**その日にやると明示登録されたもの**
 * (他日から入ってくる振替・追加授業・講習コマ) が 1 つでも残っていれば
 * 休みではないので、呼び出し側がその件数を `otherLessons` に渡すこと。
 *
 * @param {Array} slots その日に表示しているコマ
 * @param {{slot: object, adj: object}[]} outgoing collectOutgoingReschedules の結果
 * @param {number} [otherLessons] その日に残る他のコマ数 (振替で入る / 追加授業 / 講習)
 * @returns {boolean}
 */
export function isDayEmptiedByReschedule(slots, outgoing, otherLessons = 0) {
  if (!slots?.length) return false;
  if (otherLessons > 0) return false;
  return outgoing.length === slots.length;
}

/**
 * 振替先の表記。"2026-08-28 (金) 19:40 (福江)" のように、
 * 日付 → 時刻 → 担当 の順で、入っているものだけを並べる。
 * short: true で日付を "8/28" に縮める (月間カレンダーのカード内など)。
 *
 * originalTeacher を渡すと、**担当が変わらない振替では担当を出さない**。
 * 振替の targetTeacher には元担当がそのまま入っていることがあり
 * (振替ピッカーの既定だった)、そのまま出すと担当が変わったように読める。
 */
export function describeRescheduleTarget(
  adj,
  { short = false, originalTeacher = "" } = {}
) {
  if (!adj?.targetDate) return "";
  const parts = [short ? shortDate(adj.targetDate) : fmtDateWeekday(adj.targetDate)];
  if (adj.targetTime) parts.push(short ? adj.targetTime.split("-")[0] : adj.targetTime);
  if (adj.targetTeacher && adj.targetTeacher !== originalTeacher) {
    parts.push(`(${adj.targetTeacher})`);
  }
  return parts.join(" ");
}

// "2026-08-28" → "8/28"
function shortDate(dateStr) {
  const [, m, d] = (dateStr || "").split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : dateStr || "";
}

/**
 * 「振替で授業なし」バナーの見出し文。行き先が 1 つならその日付まで出す。
 * @param {{slot: object, adj: object}[]} outgoing
 */
export function outgoingDayLabel(outgoing) {
  if (!outgoing?.length) return "";
  const targets = [...new Set(outgoing.map((o) => o.adj.targetDate))].sort();
  const to =
    targets.length === 1
      ? fmtDateWeekday(targets[0])
      : `${fmtDateWeekday(targets[0])} 他 ${targets.length - 1} 日`;
  return `この日の授業は ${outgoing.length} コマとも ${to} へ振替済み`;
}
