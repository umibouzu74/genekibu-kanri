import { useMemo } from "react";
import {
  isSlotBeyondCutoff,
  getCutoffGroupLabelsWithSlots,
  getDayCutoffKind,
  isTimetableActiveForDate,
} from "../../../utils/timetable";
import { cutoffBannerText } from "../../../constants/cutoffMessages";
import { extraLessonsOnDate } from "../../../utils/extraLessons";
import {
  getDaySchedulesForDate,
  isSlotCancelledByDaySchedule,
} from "../../../utils/daySchedules";
import { DashDayRow } from "./DashDayRow";
import { EventSummaryCards } from "./EventSummaryCards";
import { SubSummaryCards } from "./SubSummaryCards";

export function DashboardListView({
  slots,
  subs,
  timetables,
  displayCutoff,
  days,
  todayStr,
  holidays = [],
  examPeriods = [],
  specialEvents = [],
  extraLessons = [],
  daySchedules = [],
  holidaysFor,
  examPeriodsFor,
  specialEventsFor,
  isOffForGrade,
  sessionCtx,
  adjustments = [],
  onJumpToEventCalendar,
  onJumpToRequestedSubs,
}) {
  // コマが 1 つも無い学年グループ (運用していない学年) は全日判定から外す。
  // 終了日が空のまま残っていると、他が全部終わってもバナーが出ないため。
  const activeGroupLabels = useMemo(
    () => getCutoffGroupLabelsWithSlots(slots, displayCutoff),
    [slots, displayCutoff]
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SubSummaryCards
        subs={subs}
        slots={slots}
        todayStr={todayStr}
        onJumpToRequestedSubs={onJumpToRequestedSubs}
      />
      <EventSummaryCards
        todayStr={todayStr}
        holidays={holidays}
        examPeriods={examPeriods}
        specialEvents={specialEvents}
        onJumpToEventCalendar={onJumpToEventCalendar}
      />
      {days.map(({ dateStr, dow }) => {
        const hols = holidaysFor(dateStr);
        const cutoffKind = getDayCutoffKind(dateStr, displayCutoff, { activeGroupLabels });
        const entireDayCutoff = cutoffKind != null;
        const daySlots = entireDayCutoff
          ? []
          : slots.filter(
              (s) =>
                s.day === dow &&
                !isOffForGrade(dateStr, s.grade, s.subj) &&
                // 特別時程の部分休講 (1限カット等) は休講と同じ扱いで外す
                !isSlotCancelledByDaySchedule(s, dateStr, daySchedules) &&
                (!timetables ||
                  timetables.length === 0 ||
                  isTimetableActiveForDate(
                    timetables.find((t) => t.id === (s.timetableId ?? 1)),
                    dateStr,
                    s.grade
                  )) &&
                !isSlotBeyondCutoff(dateStr, s, displayCutoff)
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
                {cutoffBannerText(cutoffKind)}
              </div>
            )}
            <DashDayRow
              date={dateStr}
              dow={dow}
              holidays={hols}
              slots={daySlots}
              subs={subs}
              adjustments={adjustments}
              examPeriodsForDate={examPeriodsFor(dateStr)}
              specialEventsForDate={
                specialEventsFor ? specialEventsFor(dateStr) : []
              }
              extraLessonsForDate={
                entireDayCutoff ? [] : extraLessonsOnDate(extraLessons, dateStr)
              }
              daySchedulesForDate={getDaySchedulesForDate(daySchedules, dateStr)}
              sessionCtx={sessionCtx}
            />
          </div>
        );
      })}
    </div>
  );
}
