import { useMemo } from 'react';
import {
  computeGlobalUsage,
  computeActiveAnalysis,
  computeDashboard,
  computeTabViolationCounts,
  computeViolations,
  computeInfeasibilities,
} from '../utils/analysisHelpers';

const DEFAULT_MAX_DAILY_HOURS = 6;

// project 状態から派生する集計データを返すフック。
// 純粋関数は utils/analysisHelpers.js に切り出してテスト可能にしてある (D4e)。
//
// 公開 API:
//   - analysis: { conflictMap, subjectOrders, dailySubjectMap, errorKeys,
//                 teacherDailyCounts, tabErrorCounts, violations,
//                 infeasibilities }
//   - dashboard: { progress, filled, total }
export function useAnalysis(project, currentSchedule, currentConfig) {
  const { teacherDailyCounts, globalUsage } = useMemo(
    () => computeGlobalUsage(project.tabs, project.combinedGroups, project.externalCounts),
    [project.tabs, project.combinedGroups, project.externalCounts],
  );

  const activeAnalysis = useMemo(
    () => computeActiveAnalysis(currentConfig, currentSchedule, globalUsage),
    [currentConfig, currentSchedule, globalUsage],
  );

  const tabErrorCounts = useMemo(
    () => computeTabViolationCounts({ tabs: project.tabs, globalUsage }),
    [project.tabs, globalUsage],
  );

  const maxDailyHours = project.maxDailyHours ?? DEFAULT_MAX_DAILY_HOURS;

  const violations = useMemo(
    () => computeViolations({
      currentConfig,
      currentSchedule,
      errorKeys: activeAnalysis.errorKeys,
      dailySubjectMap: activeAnalysis.dailySubjectMap,
      subjectOrders: activeAnalysis.subjectOrders,
      teacherDailyCounts,
      maxDailyHours,
      teachers: project.teachers,
    }),
    [currentConfig, currentSchedule, activeAnalysis, teacherDailyCounts, maxDailyHours, project.teachers],
  );

  const commonSubjects = useMemo(
    () => project.subjects || Object.keys(currentConfig.subjectCounts || {}),
    [project.subjects, currentConfig.subjectCounts],
  );

  const infeasibilities = useMemo(
    () => computeInfeasibilities({
      teachers: project.teachers,
      commonSubjects,
      currentConfig,
      maxDailyHours,
    }),
    [project.teachers, commonSubjects, currentConfig, maxDailyHours],
  );

  const analysis = useMemo(
    () => ({ ...activeAnalysis, teacherDailyCounts, tabErrorCounts, violations, infeasibilities }),
    [activeAnalysis, teacherDailyCounts, tabErrorCounts, violations, infeasibilities],
  );

  const dashboard = useMemo(
    () => computeDashboard(currentSchedule, currentConfig),
    [currentSchedule, currentConfig],
  );

  return { analysis, dashboard };
}
