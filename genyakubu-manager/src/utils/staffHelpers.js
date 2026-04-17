import { WEEKDAYS } from "../constants/schools";
import { isSlotForTeacher } from "./biweekly";
import { isSlotOffOnDate } from "./scheduleHelpers";

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
 * @param {import("../types").Slot[]} slots
 * @param {string} staffName
 * @param {import("../types").Holiday[]} holidays
 * @param {number} year
 * @param {number} month
 * @param {import("../types").ExamPeriod[]} [examPeriods]
 * @returns {string[]}
 */
export function staffMonthlyRegularDates(
  slots,
  staffName,
  holidays,
  year,
  month,
  examPeriods = []
) {
  const teacherSlots = slots.filter((s) => isSlotForTeacher(s, staffName));
  if (teacherSlots.length === 0) return [];

  const slotsByDay = new Map();
  for (const s of teacherSlots) {
    if (!slotsByDay.has(s.day)) slotsByDay.set(s.day, []);
    slotsByDay.get(s.day).push(s);
  }

  const dates = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = WEEKDAYS[dt.getDay()];
    const daySlots = slotsByDay.get(dow);
    if (!daySlots || daySlots.length === 0) continue;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const allOff = daySlots.every((s) =>
      isSlotOffOnDate(s, dateStr, holidays, examPeriods)
    );
    if (allOff) continue;
    dates.push(dateStr);
  }
  return dates;
}
