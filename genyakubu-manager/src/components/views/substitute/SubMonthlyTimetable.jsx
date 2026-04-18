import { useMemo } from "react";
import { fmtDate } from "../../../data";
import {
  isBeyondCutoff,
  isEntireDayBeyondCutoff,
  isTimetableActiveForDate,
} from "../../../utils/timetable";
import { DashDayRow } from "../dashboard/DashDayRow";
import { buildDayRange, makeHolidayHelpers } from "../dashboardHelpers";

// 代行管理「代行一覧」タブ用: 選択月の 1 日〜末日を Dashboard 日別モード
// と同じ DashDayRow で並べる。DashboardListView は再利用しない
// (SubSummaryCards が todayStr 基準で動くため、過去月・未来月での
//  サマリが直感に反する)。

function daysInMonth(year, month) {
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
}) {
  const { holidaysFor, examPeriodsFor, isOffForGrade } = useMemo(
    () => makeHolidayHelpers(holidays || [], examPeriods || []),
    [holidays, examPeriods]
  );

  const days = useMemo(() => {
    if (!year || !month) return [];
    return buildDayRange(
      fmtDate(new Date(year, month - 1, 1)),
      daysInMonth(year, month)
    );
  }, [year, month]);

  const sessionCtx = useMemo(
    () => ({
      classSets: classSets || [],
      allSlots: slots || [],
      displayCutoff,
      isOffForGrade,
      biweeklyAnchors: biweeklyAnchors || [],
      adjustments: adjustments || [],
      sessionOverrides: sessionOverrides || [],
      orientationOnFirstDay: true,
    }),
    [
      classSets,
      slots,
      displayCutoff,
      isOffForGrade,
      biweeklyAnchors,
      adjustments,
      sessionOverrides,
    ]
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
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {days.map(({ dateStr, dow }) => {
        const hols = holidaysFor(dateStr);
        const entireDayCutoff = isEntireDayBeyondCutoff(dateStr, displayCutoff);
        const daySlots = entireDayCutoff
          ? []
          : (slots || []).filter(
              (s) =>
                s.day === dow &&
                !isOffForGrade(dateStr, s.grade, s.subj) &&
                (!timetables ||
                  timetables.length === 0 ||
                  isTimetableActiveForDate(
                    timetables.find((t) => t.id === (s.timetableId ?? 1)),
                    dateStr,
                    s.grade
                  )) &&
                !isBeyondCutoff(dateStr, s.grade, displayCutoff)
            );
        return (
          <div key={dateStr}>
            {entireDayCutoff && (
              <div
                style={{
                  background: "#fff8e0",
                  border: "1px solid #e0d080",
                  borderRadius: 8,
                  padding: "8px 14px",
                  marginBottom: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#8a7020",
                  textAlign: "center",
                }}
              >
                この日以降の予定は未確定です
              </div>
            )}
            <DashDayRow
              date={dateStr}
              dow={dow}
              holidays={hols}
              slots={daySlots}
              subs={filteredSubs}
              examPeriodsForDate={examPeriodsFor(dateStr)}
              sessionCtx={sessionCtx}
            />
          </div>
        );
      })}
    </div>
  );
}
