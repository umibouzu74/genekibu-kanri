import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useProjectContext } from './projectContextValue';
import { useHostData } from './hostDataContext';
import { PlanningContext } from './planningContextValue';
import type { PlanningValue } from './planningContextValue';
import { buildBuilderUsualIndex } from '../utils/usualTeachersIndex';
import {
  categoriesForSeason,
  computeStreakViolations,
  resolveTeacherUsage,
} from '../utils/planningHints';

// 講習の組み方の手がかり (planningContextValue) を作業領域で 1 回だけ作る
// (セルの数だけ作らない)
export function UsualTeachersProvider({ children }: { children: ReactNode }) {
  const { project } = useProjectContext();
  const { regularSlots, regularTimetables, teacherCategoriesByYear } = useHostData();
  const tabs = project?.tabs;
  const dates = project?.dates;
  const periods = project?.periods;
  const usual = useMemo(
    () => buildBuilderUsualIndex(project, regularSlots, regularTimetables),
    // project の中で使うのはタブ (クラスの対応・使う日) と日付・時限だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, dates, periods, regularSlots, regularTimetables],
  );
  const categories = useMemo(
    () => categoriesForSeason(teacherCategoriesByYear, usual.refYmd),
    [teacherCategoriesByYear, usual.refYmd],
  );
  const value = useMemo<PlanningValue>(() => {
    const byName = new Map((project?.teachers || []).map(t => [t.name, t]));
    return {
      usual,
      categories,
      usageOf: (name) => resolveTeacherUsage(byName.get(name) || { name }, project || {}, categories),
      streakViolations: project ? computeStreakViolations(project, categories) : [],
    };
  }, [usual, categories, project]);
  return <PlanningContext.Provider value={value}>{children}</PlanningContext.Provider>;
}
