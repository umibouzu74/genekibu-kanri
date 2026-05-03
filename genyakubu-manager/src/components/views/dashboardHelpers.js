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
export function makeEventHelpers(holidays, examPeriods = [], specialEvents = []) {
  const holidaysFor = (d) => holidays.filter((h) => h.date === d);

  // Returns exam periods that are active on a given date.
  const examPeriodsFor = (d) =>
    examPeriods.filter((ep) => d >= ep.startDate && d <= ep.endDate);

  // Returns special events active on a given date (purely informational; does
  // NOT influence isOffForGrade).
  const specialEventsFor = (d) =>
    specialEvents.filter((ev) => d >= ev.startDate && d <= ev.endDate);

  // 日付 → その日の休講エントリ群、の索引。
  // isHolidayForSlot は時間割描画ループから 1 スロットあたり 1 回呼ばれるため、
  // 全 holidays の線形走査を毎回行うと O(slots × holidays) になる。
  const holidaysByDate = new Map();
  for (const h of holidays) {
    if (!holidaysByDate.has(h.date)) holidaysByDate.set(h.date, []);
    holidaysByDate.get(h.date).push(h);
  }

  // Check if a specific (date, grade, subj) is cancelled by a holiday entry.
  // 「テスト期間」は含めない (テスト期間中は別途振替が走るためここでは別扱い)。
  const isHolidayForSlot = (d, grade, subj) => {
    const dayHols = holidaysByDate.get(d);
    if (!dayHols) return false;
    const dept = gradeToDept(grade);
    return dayHols.some((h) => {
      // 1. Department scope check
      const sc = h.scope || ["全部"];
      if (!sc.includes("全部") && !(dept && sc.includes(dept))) return false;

      // 2. Grade-level check
      const tg = h.targetGrades || [];
      if (tg.length > 0 && !tg.includes(grade)) return false;

      // 3. Subject keyword check
      const sk = h.subjKeywords || [];
      if (sk.length > 0) {
        if (!subj) return false;
        if (!sk.some((kw) => subj.includes(kw))) return false;
      }
      return true;
    });
  };

  // Check whether (date, grade) falls within any exam period that stops classes.
  // 高校テスト期間など `stopsClasses: false` のものは授業停止扱いにしない。
  // (これらは表示専用で、休講ラベルは出さず通常授業として扱う)
  const isInExamPeriodForGrade = (d, grade) =>
    examPeriods.some((ep) => {
      if (ep.stopsClasses === false) return false;
      if (d < ep.startDate || d > ep.endDate) return false;
      if (ep.targetGrades.length === 0) return true; // empty = all grades
      return ep.targetGrades.includes(grade);
    });

  // Check if a specific slot is off on a given date.
  // `subj` is optional for backward compat; when omitted, holidays with
  // subjKeywords set will NOT match (safe-side).
  const isOffForGrade = (d, grade, subj) =>
    isHolidayForSlot(d, grade, subj) || isInExamPeriodForGrade(d, grade);

  return {
    holidaysFor,
    examPeriodsFor,
    specialEventsFor,
    isOffForGrade,
    isHolidayForSlot,
    isInExamPeriodForGrade,
  };
}
