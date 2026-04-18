import { useMemo } from "react";
import { fmtDate } from "../../../data";
import { DashboardListView } from "../dashboard/DashboardListView";
import { buildDayRange, makeHolidayHelpers } from "../dashboardHelpers";

// ─── 代行管理: 選択月の日別時間割 ───────────────────────────────
// Dashboard の「日別」モード (DashboardListView) を月単位で表示する。
// 親から渡された `filteredSubs` (月/講師/ステータスで絞り済み) のみが
// 各コマに 代行バッジとして反映されるため、ユーザーはフィルタ条件を
// 時間割上で視覚的に確認できる。

function daysInMonth(year, month) {
  // month: 1-indexed
  return new Date(year, month, 0).getDate();
}

export function SubMonthlyTimetable({
  year,
  month,
  filteredSubs,
  slots,
  holidays,
  examPeriods,
  biweeklyAnchors,
  classSets,
  displayCutoff,
  timetables,
  adjustments,
  sessionOverrides,
  todayStr,
}) {
  const { holidaysFor, examPeriodsFor, isOffForGrade } = useMemo(
    () => makeHolidayHelpers(holidays || [], examPeriods || []),
    [holidays, examPeriods]
  );

  // 選択月の 1 日〜末日までを days に展開
  const days = useMemo(() => {
    if (!year || !month) return [];
    const first = new Date(year, month - 1, 1);
    return buildDayRange(fmtDate(first), daysInMonth(year, month));
  }, [year, month]);

  const sessionCtx = useMemo(
    () => ({
      classSets: classSets || [],
      allSlots: slots,
      displayCutoff,
      isOffForGrade,
      biweeklyAnchors: biweeklyAnchors || [],
      adjustments: adjustments || [],
      sessionOverrides: sessionOverrides || [],
      orientationOnFirstDay: true,
    }),
    [classSets, slots, displayCutoff, isOffForGrade, biweeklyAnchors, adjustments, sessionOverrides]
  );

  if (!year || !month) {
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          padding: 40,
          textAlign: "center",
          color: "#888",
          fontSize: 13,
        }}
      >
        月を選択してください
      </div>
    );
  }

  return (
    <DashboardListView
      slots={slots}
      subs={filteredSubs}
      timetables={timetables}
      displayCutoff={displayCutoff}
      days={days}
      holidaysFor={holidaysFor}
      examPeriodsFor={examPeriodsFor}
      isOffForGrade={isOffForGrade}
      sessionCtx={sessionCtx}
      todayStr={todayStr}
    />
  );
}
