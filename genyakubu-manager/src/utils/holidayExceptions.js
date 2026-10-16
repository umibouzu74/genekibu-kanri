// ─── 休講日の例外 (この日はこのコマだけ授業あり) ─────────────────────
// 「9/9 は高1・高2 休講。ただし高2 高松一 物理だけ授業あり」のように、休講日
// (Holiday) の対象に入るが授業を行うコマ。休講日に例外のコマ id を持たせる:
//   { …Holiday, excludeSlotIds: [123] }
//
// - 判定は scheduleHelpers.holidayMatches の 1 か所 (コマ id を渡したときだけ
//   例外を見る)。コマを描く経路は isOffForGrade / isHolidayForSlot に
//   コマ id を渡すこと
// - 休講日は日付ごとのレコードなので、例外もその日だけに効く。コマを消したら
//   孤立データ掃除 (utils/orphanCleanup) が id を抜く
// - 例外のある休講日は部門を丸ごと隠す「全日休講」扱いにしない
//   (scheduleHelpers.isGranularHoliday)
//
// 純粋関数のみ。書き込みは呼び出し側 (removeWithUndo と同じく 6 秒の
// 「元に戻す」を出す。cascade の無い変更)。

import { getAbsenceDaySlots } from "./absenceHelpers";
import { dateToDay, timeStartToMin } from "./dateHelpers";
import { holidayMatches } from "./scheduleHelpers";

function hasException(h, slotId) {
  const key = String(slotId);
  return (h.excludeSlotIds || []).some((id) => String(id) === key);
}

/**
 * その日にそのコマを休講にしている休講日 (例外を考慮した上で効いているもの)。
 * @param {Array} holidays
 * @param {object} slot
 * @param {string} dateStr
 * @returns {Array}
 */
export function holidaysCancellingSlot(holidays, slot, dateStr) {
  if (!slot) return [];
  return (holidays || []).filter(
    (h) => h && h.date === dateStr && holidayMatches(h, slot.grade, slot.subj, slot.id)
  );
}

/**
 * その日にそのコマを例外 (授業あり) にしている休講日。例外が無ければ
 * 休講になっていたもの。
 * @param {Array} holidays
 * @param {object} slot
 * @param {string} dateStr
 * @returns {Array}
 */
export function holidaysExceptingSlot(holidays, slot, dateStr) {
  if (!slot) return [];
  return (holidays || []).filter(
    (h) =>
      h &&
      h.date === dateStr &&
      hasException(h, slot.id) &&
      holidayMatches(h, slot.grade, slot.subj)
  );
}

/**
 * そのコマをその日だけ休講日の例外にする (その日にそのコマを止めている休講日
 * すべてに id を足す)。止めている休講日が無ければ changedIds は空。
 * @param {Array} holidays
 * @param {object} slot
 * @param {string} dateStr
 * @returns {{ next: Array, changedIds: Array }}
 */
export function addHolidayException(holidays, slot, dateStr) {
  const targets = new Set(holidaysCancellingSlot(holidays, slot, dateStr).map((h) => h.id));
  if (targets.size === 0) return { next: holidays || [], changedIds: [] };
  const next = (holidays || []).map((h) =>
    targets.has(h.id)
      ? { ...h, excludeSlotIds: [...(h.excludeSlotIds || []), slot.id] }
      : h
  );
  return { next, changedIds: [...targets] };
}

/**
 * 例外を外す (そのコマを休講日どおり休講に戻す)。
 * @param {Array} holidays
 * @param {object} slot
 * @param {string} dateStr
 * @returns {{ next: Array, changedIds: Array }}
 */
export function removeHolidayException(holidays, slot, dateStr) {
  const targets = new Set(holidaysExceptingSlot(holidays, slot, dateStr).map((h) => h.id));
  if (targets.size === 0) return { next: holidays || [], changedIds: [] };
  const key = String(slot.id);
  const next = (holidays || []).map((h) => {
    if (!targets.has(h.id)) return h;
    const rest = (h.excludeSlotIds || []).filter((id) => String(id) !== key);
    if (rest.length > 0) return { ...h, excludeSlotIds: rest };
    // 空配列は RTDB が消すので、キーごと外して保存形をそろえる
    const base = { ...h };
    delete base.excludeSlotIds;
    return base;
  });
  return { next, changedIds: [...targets] };
}

/**
 * 休講日の例外のコマ (一覧の表示用)。消えたコマは名前の代わりに id を出す。
 * @param {object} h Holiday
 * @param {Map<number, object> | Array} slotsOrMap
 * @returns {Array<{ id: number|string, slot: object|null }>}
 */
export function holidayExceptionSlots(h, slotsOrMap) {
  const ids = h?.excludeSlotIds || [];
  if (ids.length === 0) return [];
  const byId =
    slotsOrMap instanceof Map
      ? slotsOrMap
      : new Map((slotsOrMap || []).map((s) => [String(s.id), s]));
  return ids.map((id) => ({
    id,
    slot: byId.get(String(id)) || byId.get(id) || null,
  }));
}

/**
 * その日にその休講日 (の対象設定) が止めるコマ。例外は見ない (例外にする候補を
 * 並べるため)。画面に出るコマ (時間割の期間・表示期間) だけ —
 * absenceHelpers.getAbsenceDaySlots と同じ窓で、期切替で残した旧期のコマを
 * 二重に並べない。
 * @param {Array} slots
 * @param {string} dateStr
 * @param {{scope?: string[], targetGrades?: string[], subjKeywords?: string[]}} criteria
 * @param {{timetables?: Array, displayCutoff?: object}} [opts]
 * @returns {Array}
 */
export function slotsStoppedByHoliday(slots, dateStr, criteria, opts = {}) {
  const day = dateToDay(dateStr);
  if (!day) return [];
  return getAbsenceDaySlots(slots, dateStr, day, opts)
    .filter((s) => holidayMatches(criteria, s.grade, s.subj))
    .sort((a, b) => timeStartToMin(a.time) - timeStartToMin(b.time) || a.id - b.id);
}
