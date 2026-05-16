import { makeKey } from '../../utils/scheduleKey';

// schedule の状態に対する判定の純粋関数群。
// autoGenerator の solver で「同日同クラス同科目重複禁止」「同時限同講師
// 重複禁止」「科目クォータ残量」といった既存制約を表す。

// 「同日・同クラスに同じ科目があるかどうか」。dIdx, cIdx を固定し、すべての
// pIdx について subject 一致をチェック。
export function hasSubjectInSameDayClass(schedule, periods, dIdx, cIdx, subject) {
  return periods.some((_p, pi) => schedule[makeKey(dIdx, pi, cIdx)]?.subject === subject);
}

// 同上だが特定の pIdx を除外する版 (合同 secondary チェック用)。
export function hasSubjectInSameDayClassExcept(schedule, periods, dIdx, cIdx, subject, excludePIdx) {
  return periods.some((_p, pi) =>
    pi !== excludePIdx &&
    schedule[makeKey(dIdx, pi, cIdx)]?.subject === subject
  );
}

// 「同日・同時限の他クラスに同じ講師がいるかどうか」。合同グループ内の
// クラスは除外して判定する。
export function hasTeacherInSamePeriod(schedule, classes, dIdx, pIdx, cIdx, teacherName, excludedCIndices = []) {
  return classes.some((_oc, oci) =>
    oci !== cIdx &&
    !excludedCIndices.includes(oci) &&
    schedule[makeKey(dIdx, pIdx, oci)]?.teacher === teacherName
  );
}

// 科目クォータが残っているか (true なら更に割り当て可能)
export function hasSubjectQuotaRemaining(tempCounts, cIdx, subject, subjectCounts) {
  return (tempCounts[cIdx]?.[subject] || 0) < (subjectCounts[subject] ?? 0);
}
