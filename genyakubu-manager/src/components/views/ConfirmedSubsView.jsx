import { useMemo, useState } from "react";
import { dateToDay, fmtDate } from "../../data";
import { S } from "../../styles/common";
import { DashDayRow } from "./Dashboard";
import { makeHolidayHelpers, shiftDate } from "./dashboardHelpers";

// Shows a Dashboard-style listing of classes on days that have at least one
// confirmed substitute.
//
// Default (future mode): only today and later confirmed subs are shown.
// Past mode: toggle reveals from/to date pickers for arbitrary range lookup
// over confirmed subs whose date falls within the selected range.
export function ConfirmedSubsView({ slots, holidays, subs }) {
  const todayStr = fmtDate(new Date());
  const [showPast, setShowPast] = useState(false);
  // Past-mode defaults: last 30 days, up to yesterday (inclusive of both ends).
  const [fromDate, setFromDate] = useState(() => shiftDate(todayStr, -30));
  const [toDate, setToDate] = useState(() => shiftDate(todayStr, -1));

  const { holidaysFor, isOffForGrade } = useMemo(
    () => makeHolidayHelpers(holidays),
    [holidays]
  );

  const days = useMemo(() => {
    const confirmed = subs.filter((s) => s.status === "confirmed");
    const filtered = showPast
      ? confirmed.filter((s) => s.date >= fromDate && s.date <= toDate)
      : confirmed.filter((s) => s.date >= todayStr);
    const dates = [...new Set(filtered.map((s) => s.date))].sort();
    // Past mode is shown newest-first so recent history sits at the top.
    if (showPast) dates.reverse();
    return dates.map((dateStr) => ({ dateStr, dow: dateToDay(dateStr) }));
  }, [subs, showPast, fromDate, toDate, todayStr]);

  const rangeInvalid = showPast && fromDate > toDate;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
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
          {showPast
            ? "指定期間の確定代行を新しい順に表示します"
            : "今日以降の確定代行を日付順に表示します"}
        </span>
        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          <button
            type="button"
            onClick={() => setShowPast(false)}
            style={S.btn(!showPast)}
          >
            未来のみ
          </button>
          <button
            type="button"
            onClick={() => setShowPast(true)}
            style={S.btn(showPast)}
          >
            過去を表示
          </button>
        </div>
        {showPast && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => e.target.value && setFromDate(e.target.value)}
              style={{ ...S.input, width: "auto" }}
            />
            <span style={{ fontSize: 12, color: "#666" }}>〜</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => e.target.value && setToDate(e.target.value)}
              style={{ ...S.input, width: "auto" }}
            />
          </div>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#888" }}>
          {days.length}日
        </span>
      </div>
      {rangeInvalid ? (
        <div
          style={{
            textAlign: "center",
            color: "#c03030",
            padding: 40,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e0e0e0",
            fontSize: 14,
          }}
        >
          開始日が終了日より後になっています
        </div>
      ) : days.length === 0 ? (
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
          {showPast
            ? "指定期間に確定済みの代行はありません"
            : "今日以降の確定済み代行はありません"}
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
