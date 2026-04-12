import { useMemo } from "react";
import { dateToDay } from "../../data";
import { DashDayRow } from "./Dashboard";
import { makeHolidayHelpers } from "./dashboardHelpers";

// Shows a Dashboard-style listing of classes on days that have at least one
// confirmed substitute. Days are rendered in date-ascending order.
export function ConfirmedSubsView({ slots, holidays, subs }) {
  const { holidaysFor, isOffForGrade } = useMemo(
    () => makeHolidayHelpers(holidays),
    [holidays]
  );

  const days = useMemo(() => {
    const dates = [
      ...new Set(subs.filter((s) => s.status === "confirmed").map((s) => s.date)),
    ].sort();
    return dates.map((dateStr) => ({ dateStr, dow: dateToDay(dateStr) }));
  }, [subs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#fff",
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #e0e0e0",
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 13, color: "#444" }}>
          ✅ 代行確定一覧
        </span>
        <span style={{ fontSize: 11, color: "#888" }}>
          確定済みの代行がある日の授業一覧を日付順に表示します
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#888" }}>
          {days.length}日
        </span>
      </div>
      {days.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "#999",
            padding: 40,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e0e0e0",
            fontSize: 14,
          }}
        >
          確定済みの代行はありません
        </div>
      ) : (
        days.map(({ dateStr, dow }) => {
          const hols = holidaysFor(dateStr);
          const daySlots = slots.filter(
            (s) => s.day === dow && !isOffForGrade(dateStr, s.grade)
          );
          return (
            <DashDayRow
              key={dateStr}
              date={dateStr}
              dow={dow}
              holidays={hols}
              slots={daySlots}
              subs={subs}
            />
          );
        })
      )}
    </div>
  );
}
