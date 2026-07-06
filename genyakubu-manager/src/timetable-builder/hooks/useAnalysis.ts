import { useMemo } from 'react';
import type { EffectiveConfig, Project, Schedule } from '../types';
import {
  computeGlobalUsage,
  computeActiveAnalysis,
  computeDashboard,
  computeIncompleteDateIds,
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
//                 infeasibilities, incompleteDateIds }
//   - dashboard: { progress, filled, total }
export function useAnalysis(project: Project, currentSchedule: Schedule, currentConfig: EffectiveConfig) {
  const { teacherDailyCounts, globalUsage } = useMemo(
    () => computeGlobalUsage(project.tabs, project.combinedGroups, project.externalCounts, project.externalSessions, project.dates, project.periods),
    [project.tabs, project.combinedGroups, project.externalCounts, project.externalSessions, project.dates, project.periods],
  );

  // 他学年セッションと時限の時間重複から派生する自動NG (講師ごと)。
  // ScheduleCell や computeActiveAnalysis から共有して使う。
  // 時限は currentConfig (タブの subset) ではなく **プール全体** で計算する。
  // NG パネルはプール全時限を表示する仕様 (他タブ専用の時限にも『自』マークを
  // 出す必要がある) で、subset だとタブを切り替えるたびに表示が変わり、
  // 一括登録プレビューの件数ともズレていた。キーはラベルベースなので
  // superset にしても既存の参照先 (可視セルの NG 判定) には影響しない。
  const autoNgByTeacher = useMemo(
    () => computeAutoNgByTeacher(
      project.teachers,
      project.externalSessions || [],
      project.periods || [],
    ),
    [project.teachers, project.externalSessions, project.periods],
  );

  const activeAnalysis = useMemo(
    () => computeActiveAnalysis(currentConfig, currentSchedule, globalUsage, project.teachers, autoNgByTeacher),
    [currentConfig, currentSchedule, globalUsage, project.teachers, autoNgByTeacher],
  );

  const tabErrorCounts = useMemo(
    // v4: dates / periods は project 共通。各タブの実効 config で分析する。
    () => computeTabViolationCounts({
      tabs: project.tabs, globalUsage, teachers: project.teachers,
      externalSessions: project.externalSessions || [],
      dates: project.dates, periods: project.periods,
    }),
    [project.tabs, globalUsage, project.teachers, project.externalSessions, project.dates, project.periods],
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
        combinedGroups: project.combinedGroups || [],
        // F5w: 空ロックセルを生成対象セル数から除外するため schedule も渡す
        currentSchedule,
      }),
      { currentConfig, teachers: project.teachers, maxDailyHours, autoNgByTeacher },
    ),
    [project.teachers, commonSubjects, currentConfig, currentSchedule, maxDailyHours, autoNgByTeacher, project.combinedGroups],
  );

  // 「不備あり」の自動判定 (ScheduleTable の日付ステータス表示用)。
  // 手動チェック (OK/要確認) は tab.dayStatuses、不備ありはこの導出のみ。
  const incompleteDateIds = useMemo(
    () => computeIncompleteDateIds(currentSchedule, currentConfig),
    [currentSchedule, currentConfig],
  );

  const analysis = useMemo(
    () => ({ ...activeAnalysis, teacherDailyCounts, tabErrorCounts, violations, infeasibilities, autoNgByTeacher, incompleteDateIds }),
    [activeAnalysis, teacherDailyCounts, tabErrorCounts, violations, infeasibilities, autoNgByTeacher, incompleteDateIds],
  );

  const dashboard = useMemo(
    () => computeDashboard(currentSchedule, currentConfig),
    [currentSchedule, currentConfig],
  );

  return { analysis, dashboard };
}
