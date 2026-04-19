import { useMemo } from "react";
import { makeHolidayHelpers } from "../components/views/dashboardHelpers";

// buildSessionCountMap に渡す ctx を組み立てる共通フック。
// Dashboard と WeekView で同じ形を使いたいので重複を避けるために集約。
// `allSlots` が省略されたら `slots` で代替する (クラスセット解決用の母集合)。
export function useSessionCtx({
  classSets,
  slots,
  allSlots,
  displayCutoff,
  holidays,
  examPeriods,
  biweeklyAnchors,
  sessionOverrides,
}) {
  const { isOffForGrade } = useMemo(
    () => makeHolidayHelpers(holidays || [], examPeriods || []),
    [holidays, examPeriods]
  );
  return useMemo(
    () => ({
      classSets: classSets || [],
      allSlots: allSlots || slots || [],
      displayCutoff,
      isOffForGrade,
      biweeklyAnchors: biweeklyAnchors || [],
      sessionOverrides: sessionOverrides || [],
      // 中学部の開講日 1 限目をオリエン扱いとして第1回を 2 限目に繰下げる。
      orientationOnFirstDay: true,
    }),
    [classSets, allSlots, slots, displayCutoff, isOffForGrade, biweeklyAnchors, sessionOverrides]
  );
}
