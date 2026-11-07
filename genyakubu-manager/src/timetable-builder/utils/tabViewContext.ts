// 画面で開いていないタブを「そのタブを開いたときと同じ値」で描くためのコンテキスト
// (まとめて印刷 L2h、2026-11-07)。
//
// まとめて印刷はタブを切り替えずに各タブの時間割を描く。activeTabId は project の
// 一部で保存・同期の対象なので、切り替えるたびに LocalStorage と Firebase へ書き込みが
// 走り、元のタブへ戻す後始末も要る。代わりに ProjectContext の値のうちタブで決まる
// ものだけを差し替えて、同じ ScheduleTable / ScheduleCell をそのまま描く:
//   - currentConfig   = effectiveConfigForTab (useProject と同じ)
//   - currentSchedule = tab.schedule
//   - activeTab / project.activeTabId (DayStatusChecks・普段の担当 ★ が読む)
//   - analysis のうちタブで決まるもの = computeActiveAnalysis + computeIncompleteDateIds
//     (useAnalysis と同じ関数・同じ引数)。講師の日ごとの数・自動NG・調査の回答は
//     プロジェクト全体の値なのでそのまま
// violations / infeasibilities / dashboard は開いているタブのまま (時間割の描画は
// 読まない)。描画は読むだけで、書き込み系の関数は呼ばれない前提。
// useAnalysis / useProject の導出を変えたら、ここも同じにする
// (tabViewContext.test.jsx が本物の値と突き合わせている)。
import { computeActiveAnalysis, computeGlobalUsage, computeIncompleteDateIds } from './analysisHelpers';
import { effectiveConfigForTab } from './scheduleKey';
import type { GlobalUsage } from './analysisHelpers';
import type { ProjectContextValue } from '../contexts/projectContextValue';
import type { Project } from '../types';

/** 講師の使用状況 (全タブ + 他学年セッション)。useAnalysis と同じ引数で作る */
export function globalUsageOf(project: Project): GlobalUsage {
  return computeGlobalUsage(
    project.tabs,
    project.combinedGroups,
    project.externalCounts,
    project.externalSessions,
    project.dates,
    project.periods,
  ).globalUsage;
}

export function buildTabViewContext(
  base: ProjectContextValue,
  tabId: number,
  globalUsage: GlobalUsage,
): ProjectContextValue | null {
  const { project } = base;
  const tab = project.tabs.find(t => t.id === tabId);
  if (!tab) return null;
  if (tab.id === project.activeTabId) return base;
  const currentConfig = effectiveConfigForTab({ dates: project.dates, periods: project.periods }, tab);
  const currentSchedule = tab.schedule;
  const active = computeActiveAnalysis(
    currentConfig,
    currentSchedule,
    globalUsage,
    project.teachers,
    base.analysis.autoNgByTeacher,
  );
  return {
    ...base,
    project: { ...project, activeTabId: tab.id },
    activeTab: tab,
    currentSchedule,
    currentConfig,
    analysis: {
      ...base.analysis,
      ...active,
      incompleteDateIds: computeIncompleteDateIds(currentSchedule, currentConfig),
    },
  };
}
