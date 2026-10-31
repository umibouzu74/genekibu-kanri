import { createContext, useContext } from 'react';
import { EMPTY_USUAL_INDEX } from '../utils/usualTeachersIndex';
import type { UsualTeachersIndex } from '../utils/usualTeachersIndex';
import type { StreakViolation } from '../utils/planningHints';
import type { TeacherUsage } from '../types';

// 講習の組み方の手がかり (B1 普段の担当・B2 連続出勤日数・B3 講師の使い方)。
// Provider は usualTeachersContext.tsx (作業領域で 1 回だけ作る)
export interface PlanningValue {
  usual: UsualTeachersIndex;
  /** 講習の初日の年度の講師の所属 (本体) */
  categories: Record<string, string>;
  usageOf: (name: string) => TeacherUsage;
  streakViolations: StreakViolation[];
}

export const EMPTY_PLANNING: PlanningValue = {
  usual: EMPTY_USUAL_INDEX,
  categories: {},
  usageOf: () => 'normal',
  streakViolations: [],
};

export const PlanningContext = createContext<PlanningValue>(EMPTY_PLANNING);

export function usePlanning(): PlanningValue {
  return useContext(PlanningContext);
}

export function useUsualTeachers(): UsualTeachersIndex {
  return useContext(PlanningContext).usual;
}
