import { WEEKDAYS } from "../constants/schools";
import { isSlotForTeacher } from "./biweekly";
import { isSlotOffOnDate } from "./scheduleHelpers";
import { isSlotBeyondCutoff, isTimetableActiveForDate } from "./timetable";
import { isSlotCancelledByDaySchedule } from "./daySchedules";

export function getSubForSlot(subs, slotId, date) {
  if (!subs) return null;
  return subs.find((s) => s.slotId === slotId && s.date === date) || null;
}

export function monthlyTally(subs, year, month) {
  const covered = {};
  const coveredFor = {};
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  subs.forEach((s) => {
    if (!s.date?.startsWith(ym)) return;
    if (s.status === "requested") return;
    if (s.substitute) covered[s.substitute] = (covered[s.substitute] || 0) + 1;
    if (s.originalTeacher)
      coveredFor[s.originalTeacher] = (coveredFor[s.originalTeacher] || 0) + 1;
  });
  return { covered, coveredFor };
}

/**
 * Return sorted unique dates a staff member worked as a substitute in a given month.
 * Only confirmed substitutions are counted.
 * @param {import("../types").Substitute[]} subs
 * @param {string} staffName
 * @param {number} year
 * @param {number} month
 * @returns {string[]}
 */
export function staffMonthlyWorkDates(subs, staffName, year, month) {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const dates = new Set();
  for (const s of subs) {
    if (s.status !== "confirmed") continue;
    if (!s.date?.startsWith(ym)) continue;
    if (s.substitute === staffName) dates.add(s.date);
  }
  return [...dates].sort();
}

/**
 * Return sorted unique dates a staff member was substituted for in a given month.
 * Only confirmed substitutions are counted.
 * @param {import("../types").Substitute[]} subs
 * @param {string} staffName
 * @param {number} year
 * @param {number} month
 * @returns {string[]}
 */
export function staffMonthlyAbsenceDates(subs, staffName, year, month) {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const dates = new Set();
  for (const s of subs) {
    if (s.status !== "confirmed") continue;
    if (!s.date?.startsWith(ym)) continue;
    if (s.originalTeacher === staffName) dates.add(s.date);
  }
  return [...dates].sort();
}

/**
 * Return sorted unique dates a staff member would normally work in a given month
 * based on their slot schedule, excluding holidays / exam periods.
 *
 * 曜日と休講だけでは足りない: 時間割の有効期間 (前期/後期) と表示期間設定
 * (開講前 / 終講後) を外すと、7 月で終わった通常授業が 8 月の出勤日として
 * 数えられる。opts でこの 2 つを渡すこと (未指定なら従来どおり曜日 + 休講
 * だけで数える)。
 * @param {import("../types").Slot[]} slots
 * @param {string} staffName
 * @param {import("../types").Holiday[]} holidays
 * @param {number} year
 * @param {number} month
 * @param {import("../types").ExamPeriod[]} [examPeriods]
 * @param {{timetables?: import("../types").Timetable[],
 *          displayCutoff?: import("../types").DisplayCutoff | null,
 *          daySchedules?: import("../types").DaySchedule[]}} [opts]
 * @returns {string[]}
 */
export function staffMonthlyRegularDates(
  slots,
  staffName,
  holidays,
  year,
  month,
  examPeriods = [],
  opts = {}
) {
  const teacherSlots = slots.filter((s) => isSlotForTeacher(s, staffName));
  if (teacherSlots.length === 0) return [];

  const { timetables, displayCutoff, daySchedules } = opts;
  const hasTimetables = Array.isArray(timetables) && timetables.length > 0;

  const slotsByDay = new Map();
  for (const s of teacherSlots) {
    if (!slotsByDay.has(s.day)) slotsByDay.set(s.day, []);
    slotsByDay.get(s.day).push(s);
  }

  // その日にそのコマが実際に成立するか (休講・時間割の有効期間・表示期間・
  // 特別時程の部分休講)。1 つでも成立すれば出勤日。
  const isHeld = (slot, dateStr) => {
    if (isSlotOffOnDate(slot, dateStr, holidays, examPeriods)) return false;
    if (hasTimetables) {
      const tt = timetables.find((t) => t.id === (slot.timetableId ?? 1));
      if (!isTimetableActiveForDate(tt, dateStr, slot.grade)) return false;
    }
    if (displayCutoff && isSlotBeyondCutoff(dateStr, slot, displayCutoff)) return false;
    if (isSlotCancelledByDaySchedule(slot, dateStr, daySchedules)) return false;
    return true;
  };

  const dates = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = WEEKDAYS[dt.getDay()];
    const daySlots = slotsByDay.get(dow);
    if (!daySlots || daySlots.length === 0) continue;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!daySlots.some((s) => isHeld(s, dateStr))) continue;
    dates.push(dateStr);
  }
  return dates;
}
