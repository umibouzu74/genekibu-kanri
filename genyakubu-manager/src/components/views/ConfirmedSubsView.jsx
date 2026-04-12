import { useCallback, useMemo, useState } from "react";
import { dateToDay, fmtDate } from "../../data";
import { S } from "../../styles/common";
import { encodeShareData } from "../../utils/shareCodec";
import { useToasts } from "../../hooks/useToasts";
import { DashDayRow } from "./Dashboard";
import { makeHolidayHelpers, shiftDate } from "./dashboardHelpers";
import { isTimetableActiveForDate, isBeyondCutoff } from "../../utils/timetable";

// Shows a Dashboard-style listing of classes on days that have at least one
// confirmed substitute.
//
// Default (future mode): only today and later confirmed subs are shown.
// Past mode: toggle reveals from/to date pickers for arbitrary range lookup
// over confirmed subs whose date falls within the selected range.
export function ConfirmedSubsView({ slots, holidays, subs, timetables, displayCutoff, examPeriods = [] }) {
  const todayStr = fmtDate(new Date());
  const [showPast, setShowPast] = useState(false);
  // Past-mode defaults: last 30 days, up to yesterday (inclusive of both ends).
  const [fromDate, setFromDate] = useState(() => shiftDate(todayStr, -30));
  const [toDate, setToDate] = useState(() => shiftDate(todayStr, -1));

  const { holidaysFor, examPeriodsFor, isOffForGrade } = useMemo(
    () => makeHolidayHelpers(holidays, examPeriods),
    [holidays, examPeriods]
  );

  const confirmedSubs = useMemo(
    () => subs.filter((s) => s.status === "confirmed"),
    [subs]
  );

  const filteredSubs = useMemo(() => {
    return showPast
      ? confirmedSubs.filter((s) => s.date >= fromDate && s.date <= toDate)
      : confirmedSubs.filter((s) => s.date >= todayStr);
  }, [confirmedSubs, showPast, fromDate, toDate, todayStr]);

  const days = useMemo(() => {
    const dates = [...new Set(filteredSubs.map((s) => s.date))].sort();
    // Past mode is shown newest-first so recent history sits at the top.
    if (showPast) dates.reverse();
    return dates.map((dateStr) => ({ dateStr, dow: dateToDay(dateStr) }));
  }, [filteredSubs, showPast]);

  const toasts = useToasts();
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    if (filteredSubs.length === 0) {
      toasts.error("共有する代行データがありません");
      return;
    }
    setSharing(true);
    try {
      const referencedSlotIds = new Set(filteredSubs.map((s) => s.slotId));
      const referencedSlots = slots.filter((s) => referencedSlotIds.has(s.id));
      const encoded = await encodeShareData({
        slots: referencedSlots,
        substitutions: filteredSubs,
        generatedAt: new Date().toISOString(),
      });
      const url = `${window.location.origin}${window.location.pathname}#/share/${encoded}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: "代行確定情報", url });
          toasts.success("共有しました");
          return;
        } catch {
          // User cancelled or Web Share unavailable – fall through to clipboard
        }
      }
      await navigator.clipboard.writeText(url);
      toasts.success("共有リンクをコピーしました");
    } catch {
      toasts.error("共有リンクの生成に失敗しました");
    } finally {
      setSharing(false);
    }
  }, [filteredSubs, slots, sharing, toasts]);

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
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            style={{
              ...S.btn(false),
              fontSize: 11,
              background: "#eef2ff",
              color: "#1a1a6e",
              border: "1px solid #c0c8e8",
              opacity: sharing ? 0.6 : 1,
            }}
          >
            {sharing ? "生成中..." : "共有リンクを作成"}
          </button>
          <span style={{ fontSize: 11, color: "#888" }}>{days.length}日</span>
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
            (s) =>
              s.day === dow &&
              !isOffForGrade(dateStr, s.grade) &&
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
            <DashDayRow
              key={dateStr}
              date={dateStr}
              dow={dow}
              holidays={hols}
              slots={daySlots}
              subs={subs}
              examPeriodsForDate={examPeriodsFor(dateStr)}
            />
          );
        })
      )}
    </div>
  );
}
