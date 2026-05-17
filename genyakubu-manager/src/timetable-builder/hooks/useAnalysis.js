import { useMemo } from 'react';
import {
  computeGlobalUsage,
  computeActiveAnalysis,
  computeDashboard,
} from '../utils/analysisHelpers';

// project 状態から派生する集計データを返すフック。
// 純粋関数は utils/analysisHelpers.js に切り出してテスト可能にしてある (D4e)。
//
// useMemo を 3 段に分けて deps を最小化:
//   - globalUsage / teacherDailyCounts: 全タブの schedule + combinedGroups +
//     externalCounts に依存
//   - activeAnalysis (conflictMap / errorKeys / dailySubjectMap /
//     subjectOrders): 現タブの config + schedule + globalUsage に依存
//   - dashboard: 現タブの schedule + config (subjectCounts / classes) に依存
//
// 公開 API:
//   - analysis: { conflictMap, subjectOrders, dailySubjectMap, errorKeys, teacherDailyCounts }
//   - dashboard: { progress, filled, total }
// consumer (Toolbar / SummaryPanel / ScheduleCell / ProjectContext) は不変。
export function useAnalysis(project, currentSchedule, currentConfig) {
  const { teacherDailyCounts, globalUsage } = useMemo(
    () => computeGlobalUsage(project.tabs, project.combinedGroups, project.externalCounts),
    [project.tabs, project.combinedGroups, project.externalCounts],
  );

  const activeAnalysis = useMemo(
    () => computeActiveAnalysis(currentConfig, currentSchedule, globalUsage),
    [currentConfig, currentSchedule, globalUsage],
  );

  const analysis = useMemo(
    () => ({ ...activeAnalysis, teacherDailyCounts }),
    [activeAnalysis, teacherDailyCounts],
  );

  const dashboard = useMemo(
    () => computeDashboard(currentSchedule, currentConfig),
    [currentSchedule, currentConfig],
  );

  return { analysis, dashboard };
}
