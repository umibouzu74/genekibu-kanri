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

  const isOffForGrade = (d, grade) => {
    // Holiday check (existing)
    const dept = gradeToDept(grade);
    const offByHoliday = holidays.some((h) => {
      if (h.date !== d) return false;
      const sc = h.scope || ["全部"];
      return sc.includes("全部") || (dept && sc.includes(dept));
    });
    if (offByHoliday) return true;

    // Exam period check
    return examPeriods.some((ep) => {
      if (d < ep.startDate || d > ep.endDate) return false;
      if (ep.targetGrades.length === 0) return true; // empty = all grades
      return ep.targetGrades.includes(grade);
    });
  };

  return { holidaysFor, examPeriodsFor, isOffForGrade };
}
