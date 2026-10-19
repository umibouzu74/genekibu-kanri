// ─── 年間カレンダーとシステムの休講日の突き合わせ ─────────────────────
// 教員用の年間カレンダー (annualCalendarSheet) の「授業の無い日」と、システムが
// その日に授業を出しているかを比べる。講座ごとの予定表 (compare) と違い、日単位:
//
//   - 授業の無い日 = 凡例の「予備校授業なし→現役生も休み」(塾の休み) と、
//     「授業可能」の印の無い祝日。システムでその日に授業のあるコマがあれば
//     食い違い。直す案は**全日休講** (休講日、部門 = 全部)
//   - ただし予定表の注記で他の日へ振り替えている日 (「12/7(月)の授業を12/4(金)に
//     振替」) は休講日にしない — 休講日を先に入れると日まるごと振替の対象から
//     外れ、第N回も振替元の日で数えられなくなる (compare.buildDayPlans の moves と
//     同じ決まり)。日まるごと振替を開く案内だけ出す
//   - 「授業可能」の祝日にシステムが全日休講を入れていれば知らせる (直す案は出さない。
//     休講日の削除は休講日の画面で)
//   - システムの全日休講で、年間カレンダーでは休みの印の無い日も知らせる (同上)
//
// システム側の実施判定は compare.systemSlotStatus (= 既存の判定関数) に任せる。
// 自動では何も書き換えない。

import { isFullDayHoliday } from "../scheduleHelpers";
import { parseSourceDate, registrationOn, systemSlotStatus } from "./compare";
import { weekdayOf } from "./highSchoolSheet";

/** 全日休講の案の名前 (行事の欄に文字が無い塾の休み) */
export const CALENDAR_HOLIDAY_LABEL = "休講 (年間カレンダー)";

/** 年間カレンダーで授業の無い日か (塾の休み / 授業可能の印の無い祝日) */
export function isNoClassDay(day) {
  if (!day) return false;
  return day.kind === "closed" || (day.holiday && day.kind !== "open");
}

/** その日の年間カレンダーでの呼び方 (「塾の休み」「祝日 文化の日」「授業可能の祝日 昭和の日」) */
export function calendarDayLabel(day) {
  if (!day) return "";
  const what =
    day.kind === "closed" ? "塾の休み" : day.holiday ? (day.kind === "open" ? "授業可能の祝日" : "祝日") : "";
  return [what, day.event].filter(Boolean).join(" ");
}

/**
 * 予定表 (講座の表) の注記から、振替元の日 → 振替先の日。
 * @param {Array<{days: Map<string, {notes?: string[]}>}>} parsedSheets 読めた講座の表 (選んでいないものも)
 * @returns {Map<string, Set<string>>}
 */
export function collectMovesFromSheets(parsedSheets) {
  const out = new Map();
  for (const p of parsedSheets || []) {
    for (const [date, day] of p?.days || []) {
      const src = parseSourceDate(day?.notes, date);
      if (!src || src === date) continue;
      if (!out.has(src)) out.set(src, new Set());
      out.get(src).add(date);
    }
  }
  return out;
}

/**
 * @param {{ calendar: object, slots: Array, sys: object, subs?: Array, moves?: Map<string, Set<string>> }} args
 *   calendar: parseAnnualCalendarSheet の戻り値 / sys: compare.systemSlotStatus と同じ
 * @returns {Array<{
 *   date: string, type: "classes"|"openButClosed"|"systemOnly", label: string,
 *   held?: Array, moveTargets?: string[], fix?: {holidays: Array, cancels: []},
 *   cautions?: Array<{slot, reason}>, holidays?: Array
 * }>} 日付順
 */
export function compareCalendar({ calendar, slots = [], sys, subs = [], moves = new Map() }) {
  const out = [];
  if (!calendar) return out;
  const fullByDate = new Map();
  for (const h of sys?.holidays || []) {
    if (!isFullDayHoliday(h)) continue;
    if (!fullByDate.has(h.date)) fullByDate.set(h.date, []);
    fullByDate.get(h.date).push(h);
  }
  for (const date of [...calendar.days.keys()].sort()) {
    const day = calendar.days.get(date);
    const label = calendarDayLabel(day);
    const full = fullByDate.get(date) || [];
    if (isNoClassDay(day)) {
      const wd = weekdayOf(date);
      const held = (slots || []).filter((s) => s.day === wd && systemSlotStatus(s, date, sys).held);
      if (!held.length) continue;
      const moveTargets = [...(moves.get(date) || [])].sort();
      const holidayLabel = day.event || (day.kind === "closed" ? CALENDAR_HOLIDAY_LABEL : "祝日");
      const fix = moveTargets.length
        ? { holidays: [], cancels: [] }
        : {
            holidays: [{ date, label: holidayLabel, scope: ["全部"], targetGrades: [], subjKeywords: [] }],
            cancels: [],
          };
      const cautions = moveTargets.length
        ? []
        : held
            .map((slot) => ({ slot, reason: registrationOn(slot, date, sys.adjustments || [], subs) }))
            .filter((x) => x.reason);
      out.push({ date, type: "classes", label, held, moveTargets, fix, cautions });
      continue;
    }
    // 日曜は年間カレンダーに印が無くても休み (授業のある日曜は模試などの別扱い)
    if (!full.length || weekdayOf(date) === "日") continue;
    out.push({ date, type: day.kind === "open" ? "openButClosed" : "systemOnly", label, holidays: full });
  }
  return out;
}
