import { fmtDate, gradeToDept, WEEKDAYS } from "../../data";

// Parse a "YYYY-MM-DD" string into a local Date. Avoids timezone drift that
// `new Date("YYYY-MM-DD")` can introduce (UTC parsing).
function parseDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Build an array of `count` consecutive days starting from a "YYYY-MM-DD"
// string. Each entry contains the formatted date and weekday label used by
// DashDayRow.
export function buildDayRange(startDateStr, count) {
  const base = parseDateStr(startDateStr);
  return Array.from({ length: count }, (_, i) => {
    const dt = new Date(base);
    dt.setDate(dt.getDate() + i);
    return { dateStr: fmtDate(dt), dow: WEEKDAYS[dt.getDay()] };
  });
}

// Shift a "YYYY-MM-DD" string by `days` days and return the new string.
export function shiftDate(dateStr, days) {
  const dt = parseDateStr(dateStr);
  dt.setDate(dt.getDate() + days);
  return fmtDate(dt);
}

// Compute holiday / exam-period utilities shared between Dashboard and
// ConfirmedSubsView.
export function makeHolidayHelpers(holidays, examPeriods = []) {
  const holidaysFor = (d) => holidays.filter((h) => h.date === d);

  // Returns exam periods that are active on a given date.
  const examPeriodsFor = (d) =>
    examPeriods.filter((ep) => d >= ep.startDate && d <= ep.endDate);

  // Check if a specific slot is off on a given date.
  // `subj` is optional for backward compat; when omitted, holidays with
  // subjKeywords set will NOT match (safe-side).
  const isOffForGrade = (d, grade, subj) => {
    const dept = gradeToDept(grade);
    const offByHoliday = holidays.some((h) => {
      if (h.date !== d) return false;

      // 1. Department scope check (always applied)
      const sc = h.scope || ["全部"];
      if (!sc.includes("全部") && !(dept && sc.includes(dept))) return false;

      // 2. Grade-level check (when targetGrades is set)
      const tg = h.targetGrades || [];
      if (tg.length > 0 && !tg.includes(grade)) return false;

      // 3. Subject keyword check
      const sk = h.subjKeywords || [];
      if (sk.length > 0) {
        if (!subj) return false; // cannot match without subject info
        if (!sk.some((kw) => subj.includes(kw))) return false;
      }

      return true;
    });
    if (offByHoliday) return true;

    // Exam period check (unchanged)
    return examPeriods.some((ep) => {
      if (d < ep.startDate || d > ep.endDate) return false;
      if (ep.targetGrades.length === 0) return true; // empty = all grades
      return ep.targetGrades.includes(grade);
    });
  };

  return { holidaysFor, examPeriodsFor, isOffForGrade };
}
