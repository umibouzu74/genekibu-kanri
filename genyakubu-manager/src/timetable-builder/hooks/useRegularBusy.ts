import { useMemo } from 'react';
import { useHostData } from '../contexts/hostDataContext';
import { buildRegularBusy, regularBusyInputKey } from '../utils/regularBusy';
import type { RegularBusy } from '../utils/autoNg';
import type { Project } from '../types';

// 通常授業との講師の重なり (utils/regularBusy) を作業領域で 1 回だけ導出する。
// ProjectProvider が呼び、useAnalysis (自動NG) と analysis.regularBusy (Excel・
// 自動作成・セルの表の貼り付け確認など、project から自動NG を作り直す所) へ渡す。
// セルの編集では作り直さない: 鍵は使う日・講師名・年の基準日 (regularBusyInputKey) と
// 本体のデータだけ。本体のデータが無い (単体で描く) ときは空 (同じ参照)。
export function useRegularBusy(project: Project): RegularBusy {
  const host = useHostData();
  const {
    regularSlots, regularTimetables, holidays, examPeriods, biweeklyAnchors,
    substitutes, adjustments, daySchedules, displayCutoff,
  } = host;
  const inputKey = regularBusyInputKey(project);
  return useMemo(
    () => buildRegularBusy(project, {
      regularSlots, regularTimetables, holidays, examPeriods, biweeklyAnchors,
      substitutes, adjustments, daySchedules, displayCutoff,
    }),
    // project の中で使うのは inputKey にまとめたものだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      inputKey, regularSlots, regularTimetables, holidays, examPeriods, biweeklyAnchors,
      substitutes, adjustments, daySchedules, displayCutoff,
    ],
  );
}
