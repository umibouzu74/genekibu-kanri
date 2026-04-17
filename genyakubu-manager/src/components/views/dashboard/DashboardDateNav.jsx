import { S } from "../../../styles/common";
import { shiftDate } from "../dashboardHelpers";
import { DAY_COUNT_OPTIONS } from "./constants";

export function DashboardDateNav({
  startDate,
  setStartDate,
  daysInRange,
  changeDayCount,
  todayStr,
  isToday,
  days,
  viewMode,
}) {
  const stepDays = viewMode === "timetable" ? 1 : daysInRange;
  const label = viewMode === "timetable" ? "表示日" : "表示開始日";
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        background: "#fff",
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #e0e0e0",
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 13, color: "#444" }}>{label}</span>
      <input
        type="date"
        value={startDate}
        onChange={(e) => e.target.value && setStartDate(e.target.value)}
        style={{ ...S.input, width: "auto" }}
      />
      <button
        type="button"
        onClick={() => setStartDate(shiftDate(startDate, -stepDays))}
        style={S.btn(false)}
      >
        ← 前
      </button>
      <button
        type="button"
        onClick={() => setStartDate(todayStr)}
        style={S.btn(isToday)}
      >
        今日
      </button>
      <button
        type="button"
        onClick={() => setStartDate(shiftDate(startDate, stepDays))}
        style={S.btn(false)}
      >
        次 →
      </button>
      {viewMode === "list" && (
        <div style={{ display: "flex", gap: 2 }}>
          {DAY_COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => changeDayCount(n)}
              style={{
                ...S.btn(daysInRange === n),
                padding: "4px 8px",
                fontSize: 11,
                minWidth: 32,
              }}
            >
              {n}日
            </button>
          ))}
        </div>
      )}
      <span style={{ marginLeft: "auto", fontSize: 11, color: "#888" }}>
        {viewMode === "timetable"
          ? startDate
          : `${startDate} 〜 ${days[days.length - 1].dateStr}（${daysInRange}日間）`}
      </span>
    </div>
  );
}
