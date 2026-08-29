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
// holidays のうち (date, slot.grade, slot.subj) にマッチして当該 slot を
// 休講扱いにするものが 1 つでもあるか。examPeriods は見ない。
// 隔週ローテーションのスキップ判定でも共用するため pure 関数として切り出す。
export function isSlotCancelledByHoliday(slot, dateStr, holidays) {
  if (!holidays || holidays.length === 0) return false;
  const dept = slot.grade ? gradeToDept(slot.grade) : null;
  return holidays.some((h) => {
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
}

// テスト期間の「例外的に授業を行う日」(classExceptions) に (日付, 学年) が
// 該当するか。イレギュラーで特訓は始まっているが授業は休みにしない日を表す。
// grades 未指定 / 空 = そのテスト期間の対象学年すべてで授業を行う。
export function isExamClassExceptionFor(ep, dateStr, grade) {
  const list = ep?.classExceptions;
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.some((ex) => {
    if (!ex || ex.date !== dateStr) return false;
    const g = ex.grades || [];
    if (g.length === 0) return true;
    return g.includes(grade);
  });
}

// その日に効いている「例外的に授業を行う日」を返す (表示専用)。
// 返すのは { ep, exception, grades } — grades が空だった例外は
// テスト期間の対象学年に展開する (対象学年も空なら全学年なので空のまま)。
export function examClassExceptionsOnDate(examPeriods, dateStr) {
  const out = [];
  for (const ep of examPeriods || []) {
    if (!ep || ep.stopsClasses === false) continue;
    if (dateStr < ep.startDate || dateStr > ep.endDate) continue;
    for (const ex of ep.classExceptions || []) {
      if (!ex || ex.date !== dateStr) continue;
      const grades =
        (ex.grades || []).length > 0
          ? [...ex.grades]
          : [...(ep.targetGrades || [])];
      out.push({ ep, exception: ex, grades });
    }
  }
  return out;
}

// そのテスト期間が (日付, 学年) の通常授業を止めるか。
// 判定はこの 1 か所に集約する (期間・対象学年・stopsClasses・授業実施日の
// 例外を画面ごとに書き起こさない)。
export function examPeriodStopsClassesOn(ep, dateStr, grade) {
  if (!ep) return false;
  if (ep.stopsClasses === false) return false;
  if (dateStr < ep.startDate || dateStr > ep.endDate) return false;
  const tg = ep.targetGrades || [];
  if (tg.length > 0 && !tg.includes(grade)) return false;
  // 例外的に授業を行う日はテスト期間中でも休止しない。
  if (isExamClassExceptionFor(ep, dateStr, grade)) return false;
  return true;
}

export function isSlotOffOnDate(slot, dateStr, holidays, examPeriods) {
  if (isSlotCancelledByHoliday(slot, dateStr, holidays)) return true;
  return (examPeriods || []).some((ep) => {
    if (dateStr < ep.startDate || dateStr > ep.endDate) return false;
    if (ep.targetGrades && ep.targetGrades.length > 0
      && !ep.targetGrades.includes(slot.grade)) return false;
    // 例外的に授業を行う日は期間中でも off にしない。
    return !isExamClassExceptionFor(ep, dateStr, slot.grade);
  });
}

// 隔週ローテーション補正で「実施されなかった週」と判定するか。
// 休講 (Holiday) または stopsClasses≠false のテスト期間 (ExamPeriod) で
// 当該 slot が当日休止になる場合に true。
// stopsClasses=false の高校テスト等は授業継続扱いなので対象外。
// テスト期間の「授業実施日の例外」も授業を行う日なので対象外 (週が送られない)。
export function isSlotCancelledForBiweeklyShift(slot, dateStr, holidays, examPeriods) {
  if (isSlotCancelledByHoliday(slot, dateStr, holidays)) return true;
  return (examPeriods || []).some((ep) =>
    examPeriodStopsClassesOn(ep, dateStr, slot.grade)
  );
}
