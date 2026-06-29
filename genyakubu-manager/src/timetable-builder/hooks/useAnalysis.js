import { useMemo } from 'react';
import {
  computeGlobalUsage,
  computeActiveAnalysis,
  computeDashboard,
  computeTabViolationCounts,
  computeViolations,
  computeInfeasibilities,
} from '../utils/analysisHelpers';
import { computeAutoNgByTeacher } from '../utils/autoNg';
import { buildFixSuggestions } from '../utils/fixSuggestions';

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
    () => computeGlobalUsage(project.tabs, project.combinedGroups, project.externalCounts, project.externalSessions),
    [project.tabs, project.combinedGroups, project.externalCounts, project.externalSessions],
  );

  // 他学年セッションと時限の時間重複から派生する自動NG (講師ごと)。
  // ScheduleCell や computeActiveAnalysis から共有して使う。
  const autoNgByTeacher = useMemo(
    () => computeAutoNgByTeacher(
      project.teachers,
      project.externalSessions || [],
      currentConfig.periods,
    ),
    [project.teachers, project.externalSessions, currentConfig.periods],
  );

  const activeAnalysis = useMemo(
    () => computeActiveAnalysis(currentConfig, currentSchedule, globalUsage, project.teachers, autoNgByTeacher),
    [currentConfig, currentSchedule, globalUsage, project.teachers, autoNgByTeacher],
  );

  const tabErrorCounts = useMemo(
    // externalSessions を渡し、各タブの period に合わせた自動NGを内部で再計算させる
    // (タブ毎に period ラベルが違う可能性があるため、active タブの autoNgByTeacher
    //  を流用せず再計算する)。
    () => computeTabViolationCounts({
      tabs: project.tabs, globalUsage, teachers: project.teachers,
      externalSessions: project.externalSessions || [],
    }),
    [project.tabs, globalUsage, project.teachers, project.externalSessions],
  );

  const maxDailyHours = project.maxDailyHours ?? DEFAULT_MAX_DAILY_HOURS;

  const violations = useMemo(
    () => computeViolations({
      currentConfig,
      currentSchedule,
      errorKeys: activeAnalysis.errorKeys,
      dailySubjectMap: activeAnalysis.dailySubjectMap,
      subjectOrders: activeAnalysis.subjectOrders,
      ngViolationKeys: activeAnalysis.ngViolationKeys,
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
    () => buildFixSuggestions(
      computeInfeasibilities({
        teachers: project.teachers,
        commonSubjects,
        currentConfig,
        maxDailyHours,
        autoNgByTeacher,
      }),
      { currentConfig, teachers: project.teachers, maxDailyHours, autoNgByTeacher },
    ),
    [project.teachers, commonSubjects, currentConfig, maxDailyHours, autoNgByTeacher],
  );

  const analysis = useMemo(
    () => ({ ...activeAnalysis, teacherDailyCounts, tabErrorCounts, violations, infeasibilities, autoNgByTeacher }),
    [activeAnalysis, teacherDailyCounts, tabErrorCounts, violations, infeasibilities, autoNgByTeacher],
  );

  const dashboard = useMemo(
    () => computeDashboard(currentSchedule, currentConfig),
    [currentSchedule, currentConfig],
  );

  return { analysis, dashboard };
}
