import { fmtDate, WEEKDAYS } from "../../data";
import { addDays, parseLocalDate } from "../../utils/dateHelpers";
import {
  examClassExceptionsOnDate,
  examPeriodStopsClassesOn,
  holidayAppliesTo,
} from "../../utils/scheduleHelpers";

// Build an array of `count` consecutive days starting from a "YYYY-MM-DD"
// string. Each entry contains the formatted date and weekday label used by
// DashDayRow.
export function buildDayRange(startDateStr, count) {
  // 無効な日付は従来どおり Invalid Date のまま流す (null を Date に渡すと
  // 1970-01-01 になり、黙って別の日を並べてしまう)。
  const base = parseLocalDate(startDateStr) ?? new Date(NaN);
  return Array.from({ length: count }, (_, i) => {
    const dt = new Date(base);
    dt.setDate(dt.getDate() + i);
    return { dateStr: fmtDate(dt), dow: WEEKDAYS[dt.getDay()] };
  });
}

// Shift a "YYYY-MM-DD" string by `days` days and return the new string.
// (実装は utils/dateHelpers.addDays。名前は従来の呼び出し側に合わせて残す)
export const shiftDate = addDays;

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
  // 適用判定は utils/scheduleHelpers.holidayAppliesTo (バイトの出勤日・隔週の
  // 週送りと同じ述語)。
  const isHolidayForSlot = (d, grade, subj) => {
    const dayHols = holidaysByDate.get(d);
    if (!dayHols) return false;
    return dayHols.some((h) => holidayAppliesTo(h, grade, subj));
  };

  // Check whether (date, grade) falls within any exam period that stops classes.
  // 高校テスト期間など `stopsClasses: false` のものは授業停止扱いにしない。
  // (これらは表示専用で、休講ラベルは出さず通常授業として扱う)
  // 「例外的に授業を行う日」(classExceptions) も授業停止にしない。
  // 判定は utils/scheduleHelpers の examPeriodStopsClassesOn に集約。
  const isInExamPeriodForGrade = (d, grade) =>
    examPeriods.some((ep) => examPeriodStopsClassesOn(ep, d, grade));

  // その日に効いている「例外的に授業を行う日」の一覧 (表示専用)。
  // テスト期間バッジの脇に「授業あり (中3)」を出すために使う。
  const examClassExceptionsFor = (d) => examClassExceptionsOnDate(examPeriods, d);

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
    examClassExceptionsFor,
  };
}
