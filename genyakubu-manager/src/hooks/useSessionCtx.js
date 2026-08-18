import { useMemo } from "react";
import { makeEventHelpers } from "../components/views/dashboardHelpers";
import { buildClassSetIndex } from "../utils/classSets";
import { buildSlotCohortIndex } from "../utils/cohorts";

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

  // 「どのコマを 1 本のカウンタで数えるか」の索引。ここで 1 度だけ作る。
  // buildSessionCountMap は月次カレンダー (日ごと) や最終授業日の逆算
  // (最大 29 日ぶん遡る) のようにループの中から呼ばれるので、呼び出しごとに
  // 索引を作り直すと全コマの走査がその回数だけ走る。
  const slotPool = useMemo(() => allSlots || slots || [], [allSlots, slots]);
  const cohortIndex = useMemo(() => buildSlotCohortIndex(slotPool), [slotPool]);
  const classSetIndex = useMemo(
    () => buildClassSetIndex(classSets || [], slotPool),
    [classSets, slotPool]
  );
  const sessionCtx = useMemo(
    () => ({
      classSets: classSets || [],
      allSlots: slotPool,
      // sessionCount 側の索引キャッシュ (未指定なら向こうで作られる)。
      _cohortIndex: cohortIndex,
      _classSetIndex: classSetIndex,
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
      // 開講日 1 限目のオリエン扱い (第1回を 2 限目に繰下げる) を有効にする。
      // 実際に適用するかは学年グループの設定 (表示期間設定の
      // orientationFirstDay。未設定なら中学部のみ) が決める。
      orientationOnFirstDay: true,
    }),
    [classSets, slotPool, cohortIndex, classSetIndex, displayCutoff, timetables, helpers, biweeklyAnchors, holidays, examPeriods, sessionOverrides, daySchedules]
  );
  return { sessionCtx, ...helpers };
}
