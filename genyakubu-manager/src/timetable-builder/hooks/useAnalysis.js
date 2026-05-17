import { useMemo } from 'react';
import {
  computeGlobalUsage,
  computeActiveAnalysis,
  computeDashboard,
  computeTabErrorCounts,
  computeViolations,
} from '../utils/analysisHelpers';

const DEFAULT_MAX_DAILY_HOURS = 6;

// project 状態から派生する集計データを返すフック。
// 純粋関数は utils/analysisHelpers.js に切り出してテスト可能にしてある (D4e)。
//
// useMemo を 5 段に分けて deps を最小化:
//   - globalUsage / teacherDailyCounts: 全タブの schedule + combinedGroups +
//     externalCounts に依存
//   - activeAnalysis (conflictMap / errorKeys / dailySubjectMap /
//     subjectOrders): 現タブの config + schedule + globalUsage に依存
//   - dashboard: 現タブの schedule + config (subjectCounts / classes) に依存
//   - tabErrorCounts: 全タブ × globalUsage (TabBar の各タブ badge 用、D1c)
//   - violations: 現タブの種別別 violation 集計 (Toolbar popover 用、D1c)
//
// 公開 API:
//   - analysis: { conflictMap, subjectOrders, dailySubjectMap, errorKeys,
//                 teacherDailyCounts, tabErrorCounts, violations }
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
    () => computeTabErrorCounts(project.tabs, globalUsage),
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
    }),
    [currentConfig, currentSchedule, activeAnalysis, teacherDailyCounts, maxDailyHours],
  );

  const analysis = useMemo(
    () => ({ ...activeAnalysis, teacherDailyCounts, tabErrorCounts, violations }),
    [activeAnalysis, teacherDailyCounts, tabErrorCounts, violations],
  );

  const dashboard = useMemo(
    () => computeDashboard(currentSchedule, currentConfig),
    [currentSchedule, currentConfig],
  );

  return { analysis, dashboard };
}
