// ─── 不定期のコマ (指定した日だけ実施するコマ) ──────────────────────
// マークテストのように「毎週のコマとして時間割に載っているが、実施するのは
// 決まった日だけ」のコマ。実施しない日を 1 日ずつ休講にする代わりに、コマに
// 実施日の一覧を持たせる:
//   { irregular: true, onlyDates: ["2026-10-05", "2026-11-09", …] }
//
// - `irregular` が true のときだけ効く。onlyDates が空 (RTDB は空配列を
//   消すので undefined も同じ) なら**どの日も実施しない**。一覧を空にした
//   だけで毎週のコマに戻らないように、モードと一覧を分けて持つ
// - 一覧に無い日は「その日のコマではない」= 画面に出さない。表示期間
//   (timetable.isSlotBeyondCutoff) と回数計算 (sessionCount.isSlotHeldOnDate)
//   の両方がここを通す。**画面ごとに onlyDates を見に行かない**
// - 休講 (Holiday) とは別物。実施日でない日は「休講」とも出さない

/** 不定期のコマか (実施日の一覧で日を決めるコマ)。 */
export function isIrregularSlot(slot) {
  return !!slot && slot.irregular === true;
}

/** 不定期のコマの実施日 (並べ替え・重複除去済み)。毎週のコマは []。 */
export function slotOnlyDates(slot) {
  if (!isIrregularSlot(slot)) return [];
  const list = Array.isArray(slot.onlyDates) ? slot.onlyDates : [];
  return [...new Set(list.filter((d) => typeof d === "string" && d))].sort();
}

/**
 * そのコマがその日に予定されているか (不定期のコマは実施日の一覧にある日だけ)。
 * 曜日・時間割の期間・休講はここでは見ない (それぞれの経路の担当)。
 * @param {object} slot
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {boolean}
 */
export function isSlotScheduledOnDate(slot, dateStr) {
  if (!isIrregularSlot(slot)) return true;
  const list = Array.isArray(slot.onlyDates) ? slot.onlyDates : [];
  return list.includes(dateStr);
}

/** 実施日でない日の理由の文言 (日まるごと振替・予定表チェックなどの表示用)。 */
export const IRREGULAR_OFF_LABEL = "実施日でない (不定期のコマ)";
