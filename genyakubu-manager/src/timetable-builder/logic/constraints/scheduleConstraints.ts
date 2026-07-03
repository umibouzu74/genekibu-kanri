import { makeKey } from '../../utils/scheduleKey';
import type { Entity, Schedule } from '../../types';

// schedule の状態に対する判定の純粋関数群。
// autoGenerator の solver で「同日同クラス同科目重複禁止」「同時限同講師
// 重複禁止」「科目クォータ残量」といった既存制約を表す。
//
// v3 schema 以降: schedule key は ID ベース。periods / classes は { id, label }
// の entity 配列。引数の dateId / periodId / classId は ID (number)。

// 「同日・同クラスに同じ科目があるかどうか」。dateId, classId を固定し、すべての
// period について subject 一致をチェック。
export function hasSubjectInSameDayClass(
  schedule: Schedule,
  periods: Entity[],
  dateId: number,
  classId: number,
  subject: string,
): boolean {
  return periods.some(p => schedule[makeKey(dateId, p.id, classId)]?.subject === subject);
}

// 同上だが特定の periodId を除外する版 (合同 secondary チェック用)。
export function hasSubjectInSameDayClassExcept(
  schedule: Schedule,
  periods: Entity[],
  dateId: number,
  classId: number,
  subject: string,
  excludePeriodId: number,
): boolean {
  return periods.some(p =>
    p.id !== excludePeriodId &&
    schedule[makeKey(dateId, p.id, classId)]?.subject === subject
  );
}

// 「同日・同時限の他クラスに同じ講師がいるかどうか」。合同グループ内の
// クラスは excludedClassIds で除外して判定する。
export function hasTeacherInSamePeriod(
  schedule: Schedule,
  classes: Entity[],
  dateId: number,
  periodId: number,
  currentClassId: number,
  teacherName: string,
  excludedClassIds: number[] = [],
): boolean {
  return classes.some(oc =>
    oc.id !== currentClassId &&
    !excludedClassIds.includes(oc.id) &&
    schedule[makeKey(dateId, periodId, oc.id)]?.teacher === teacherName
  );
}

// 科目クォータが残っているか (true なら更に割り当て可能)。
// tempCounts は cIdx (配列インデックス) で索引される solver 内部 state。
// 同一 solve 呼び出し内で classes 配列順は不変なので index 索引で OK。
export function hasSubjectQuotaRemaining(
  tempCounts: Record<number, Record<string, number>>,
  cIdx: number,
  subject: string,
  subjectCounts: Record<string, number>,
): boolean {
  return (tempCounts[cIdx]?.[subject] || 0) < (subjectCounts[subject] ?? 0);
}
