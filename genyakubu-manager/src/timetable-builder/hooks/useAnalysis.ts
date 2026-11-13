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
import { EMPTY_REGULAR_BUSY, computeAutoNgByTeacher } from '../utils/autoNg';
import type { RegularBusy } from '../utils/autoNg';
import { answeredTeacherNames, computeSurveyDays } from '../utils/availability';
import { buildFixSuggestions } from '../utils/fixSuggestions';
import { computeNgViolationList } from '../utils/ngViolations';

const DEFAULT_MAX_DAILY_HOURS = 6;

// project 状態から派生する集計データを返すフック。
// 純粋関数は utils/analysisHelpers.js に切り出してテスト可能にしてある (D4e)。
//
// 公開 API:
//   - analysis: { conflictMap, subjectOrders, dailySubjectMap, errorKeys,
//                 teacherDailyCounts, tabErrorCounts, violations,
//                 infeasibilities, incompleteDateIds }
//   - dashboard: { progress, filled, total }
//
// regularBusy: 通常授業との講師の重なり (hooks/useRegularBusy が本体のデータから
// 導出したもの)。自動NG に合流させ、analysis.regularBusy としても配る — project から
// 自動NG を作り直す所 (Excel・自動作成・セルの表の貼り付け確認・未充填の診断) が
// 同じものを computeAutoNgByTeacher に渡せるように。
export function useAnalysis(
  project: Project,
  currentSchedule: Schedule,
  currentConfig: EffectiveConfig,
  regularBusy: RegularBusy = EMPTY_REGULAR_BUSY,
) {
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
      regularBusy,
    ),
    [project.teachers, project.externalSessions, project.periods, regularBusy],
  );

  // 出勤可能調査に回答済みの講師 (今の調査の対象マスに記号が 1 つでもある人)。
  // セルの講師プルダウンの「?」(回答はあるが未記入) の判定に使う。前の季節の
  // 日付に残った回答だけの講師は未回答 (「?」を出さない)
  const surveyAnsweredTeachers = useMemo(
    () => answeredTeacherNames(
      project.teachers,
      computeSurveyDays({ dates: project.dates, periods: project.periods, tabs: project.tabs }),
    ),
    [project.teachers, project.dates, project.periods, project.tabs],
  );

  // NG に当たっている割当 (全タブ)。⚠ の内訳と講師不在・NG の一覧に出す
  const ngViolationList = useMemo(
    () => computeNgViolationList(
      { tabs: project.tabs, dates: project.dates, periods: project.periods, teachers: project.teachers },
      autoNgByTeacher,
    ),
    [project.tabs, project.dates, project.periods, project.teachers, autoNgByTeacher],
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
      regularBusy,
    }),
    [project.tabs, globalUsage, project.teachers, project.externalSessions, project.dates, project.periods, regularBusy],
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
    () => ({ ...activeAnalysis, teacherDailyCounts, tabErrorCounts, violations, infeasibilities, autoNgByTeacher, incompleteDateIds, surveyAnsweredTeachers, ngViolationList, regularBusy }),
    [activeAnalysis, teacherDailyCounts, tabErrorCounts, violations, infeasibilities, autoNgByTeacher, incompleteDateIds, surveyAnsweredTeachers, ngViolationList, regularBusy],
  );

  const dashboard = useMemo(
    () => computeDashboard(currentSchedule, currentConfig),
    [currentSchedule, currentConfig],
  );

  return { analysis, dashboard };
}
