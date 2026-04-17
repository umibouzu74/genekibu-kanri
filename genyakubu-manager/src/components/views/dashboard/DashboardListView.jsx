import {
  isBeyondCutoff,
  isEntireDayBeyondCutoff,
  isTimetableActiveForDate,
} from "../../../utils/timetable";
import { DashDayRow } from "./DashDayRow";
import { SubSummaryCards } from "./SubSummaryCards";

export function DashboardListView({
  slots,
  subs,
  timetables,
  displayCutoff,
  days,
  todayStr,
  holidaysFor,
  examPeriodsFor,
  isOffForGrade,
  sessionCtx,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SubSummaryCards subs={subs} slots={slots} todayStr={todayStr} />
      {days.map(({ dateStr, dow }) => {
        const hols = holidaysFor(dateStr);
        const entireDayCutoff = isEntireDayBeyondCutoff(dateStr, displayCutoff);
        const daySlots = entireDayCutoff
          ? []
          : slots.filter(
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
              subs={subs}
              examPeriodsForDate={examPeriodsFor(dateStr)}
              sessionCtx={sessionCtx}
            />
          </div>
        );
      })}
    </div>
  );
}
