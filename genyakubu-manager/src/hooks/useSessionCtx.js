import { useMemo } from "react";
import { makeEventHelpers } from "../components/views/dashboardHelpers";

// buildSessionCountMap に渡す ctx を組み立てる共通フック。
// Dashboard と WeekView/MonthView で同じ形を使いたいので重複を避けるために集約。
// `allSlots` が省略されたら `slots` で代替する (クラスセット解決用の母集合)。
//
// ホリデー系ヘルパ (holidaysFor, examPeriodsFor, isOffForGrade) もまとめて
// 返すので、呼び出し側で makeEventHelpers を重ねて呼ばなくて済む。
export function useSessionCtx({
  classSets,
  slots,
  allSlots,
  displayCutoff,
  timetables,
  holidays,
  examPeriods,
  specialEvents,
  biweeklyAnchors,
  sessionOverrides,
  daySchedules,
}) {
  // holidays/examPeriods/specialEvents は makeEventHelpers 内で filter/some を呼ぶので
  // undefined 防御として空配列フォールバック。
  const helpers = useMemo(
    () => makeEventHelpers(holidays || [], examPeriods || [], specialEvents || []),
    [holidays, examPeriods, specialEvents]
  );
  const sessionCtx = useMemo(
    () => ({
      classSets: classSets || [],
      allSlots: allSlots || slots || [],
      displayCutoff,
      // 期またぎ (前期/後期) の二重カウント防止と、期ごとの回数リセットに使う。
      timetables: timetables || [],
      isOffForGrade: helpers.isOffForGrade,
      biweeklyAnchors: biweeklyAnchors || [],
      // 隔週ローテーションを「実施されなかった週ぶんスキップする」補正に使う。
      // 休講 (holidays) と stopsClasses≠false のテスト期間 (examPeriods) が
      // 対象。振替は対象外。
      holidays: holidays || [],
      examPeriods: examPeriods || [],
      sessionOverrides: sessionOverrides || [],
      // 特別時程の部分休講 (1 限カット等) をカウント対象外にする。
      daySchedules: daySchedules || [],
      // 中学部の開講日 1 限目をオリエン扱いとして第1回を 2 限目に繰下げる。
      orientationOnFirstDay: true,
    }),
    [classSets, allSlots, slots, displayCutoff, timetables, helpers, biweeklyAnchors, holidays, examPeriods, sessionOverrides, daySchedules]
  );
  return { sessionCtx, ...helpers };
}
