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
  returnCautionTeachers,
} from '../utils/planningHints';
import { computeTravelCautionList, computeTravelCautions } from '../utils/travel';

// 講習の組み方の手がかり (planningContextValue) を作業領域で 1 回だけ作る
// (セルの数だけ作らない)
export function UsualTeachersProvider({ children }: { children: ReactNode }) {
  const { project, analysis } = useProjectContext();
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
  // 場所の違う授業 (亀井町) との間の注意 (utils/travel)。「戻り」は本体の所属が予備校部の講師
  const teachers = project?.teachers;
  const externalSessions = project?.externalSessions;
  const travel = analysis?.travel;
  const autoNgByTeacher = analysis?.autoNgByTeacher;
  const travelCautions = useMemo(
    () => (travel
      ? computeTravelCautions(teachers, externalSessions, periods, travel, returnCautionTeachers(teachers, categories))
      : new Map()),
    [teachers, externalSessions, periods, travel, categories],
  );
  const travelCautionList = useMemo(() => {
    if (!project || travelCautions.size === 0) return [];
    const byName = new Map((teachers || []).map(t => [t.name, t]));
    return computeTravelCautionList(project, travelCautions, (name, ngKey) =>
      !!byName.get(name)?.ngSlots?.includes(ngKey) || !!autoNgByTeacher?.get(name)?.has(ngKey));
    // project の中で使うのはタブ・日付・時限・講師 (NG) だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, dates, periods, teachers, travelCautions, autoNgByTeacher]);
  const value = useMemo<PlanningValue>(() => {
    const byName = new Map((project?.teachers || []).map(t => [t.name, t]));
    return {
      usual,
      categories,
      usageOf: (name) => resolveTeacherUsage(byName.get(name) || { name }, project || {}, categories),
      streakViolations: project ? computeStreakViolations(project, categories) : [],
      travelCautions,
      travelCautionList,
    };
  }, [usual, categories, project, travelCautions, travelCautionList]);
  return <PlanningContext.Provider value={value}>{children}</PlanningContext.Provider>;
}
