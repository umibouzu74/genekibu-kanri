import { DAYS } from "../constants/schools";
import { timeToMin } from "./dateHelpers";

export function gradeToDept(grade) {
  if (grade.includes("附中") || grade.includes("中")) return "中学部";
  if (grade.includes("高")) return "高校部";
  return null;
}

export const isKameiRoom = (room) => room?.startsWith("亀");

export function sortSlots(arr) {
  const idx = Object.fromEntries(DAYS.map((d, i) => [d, i]));
  return [...arr].sort((a, b) => {
    const dd = idx[a.day] - idx[b.day];
    return dd || timeToMin(a.time.split("-")[0]) - timeToMin(b.time.split("-")[0]);
  });
}

/**
 * Returns true if the given slot should be considered "off" on the given date
 * because of a matching holiday or because it falls inside an exam period.
 * Centralised here to avoid duplication between dashboard helpers and staff
 * monthly-date computations.
 */
export function isSlotOffOnDate(slot, dateStr, holidays, examPeriods) {
  const dept = slot.grade ? gradeToDept(slot.grade) : null;
  const offByHoliday = (holidays || []).some((h) => {
    if (h.date !== dateStr) return false;
    const sc = h.scope || ["全部"];
    if (!sc.includes("全部") && !(dept && sc.includes(dept))) return false;
    const tg = h.targetGrades || [];
    if (tg.length > 0 && !tg.includes(slot.grade)) return false;
    const sk = h.subjKeywords || [];
    if (sk.length > 0) {
      if (!slot.subj) return false;
      if (!sk.some((kw) => slot.subj.includes(kw))) return false;
    }
    return true;
  });
  if (offByHoliday) return true;
  return (examPeriods || []).some((ep) => {
    if (dateStr < ep.startDate || dateStr > ep.endDate) return false;
    if (!ep.targetGrades || ep.targetGrades.length === 0) return true;
    return ep.targetGrades.includes(slot.grade);
  });
}
