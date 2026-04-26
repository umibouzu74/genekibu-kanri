import { useMemo } from "react";
import { fmtDate } from "../../../data";
import { formatDateRange, overlapsRange } from "../../../utils/dateHelpers";
import { specialEventTypeMeta } from "../../../constants/specialEvents";

// ─── 直近 7 日のイベントサマリ ───────────────────────────────────────
// 休講・テスト期間・特別イベントを直近 7 日内のものに絞って件数 +
// 当日先頭 3 件を表示。代行 (SubSummaryCards) と並ぶ位置取り。
//
// onJumpToEventCalendar が渡されると、カードクリックでイベント
// カレンダービューへ遷移する。
export function EventSummaryCards({
  todayStr,
  holidays = [],
  examPeriods = [],
  specialEvents = [],
  onJumpToEventCalendar,
}) {
  const summary = useMemo(() => {
    if (!todayStr) return null;
    const base = new Date(todayStr + "T12:00:00");
    const end = new Date(base);
    end.setDate(end.getDate() + 6);
    const endStr = fmtDate(end);

    const upcomingHolidays = holidays.filter((h) =>
      overlapsRange(h.date, h.date, todayStr, endStr)
    );
    const upcomingExams = examPeriods.filter((ep) =>
      overlapsRange(ep.startDate, ep.endDate, todayStr, endStr)
    );
    const upcomingSpecial = specialEvents.filter((ev) =>
      overlapsRange(ev.startDate, ev.endDate, todayStr, endStr)
    );

    return { upcomingHolidays, upcomingExams, upcomingSpecial };
  }, [todayStr, holidays, examPeriods, specialEvents]);

  if (!summary) return null;
  const { upcomingHolidays, upcomingExams, upcomingSpecial } = summary;
  const total =
    upcomingHolidays.length + upcomingExams.length + upcomingSpecial.length;
  if (total === 0) return null;

  const clickable = !!onJumpToEventCalendar;

  const Card = ({ label, count, color, bg, accent, items, formatItem }) => (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onJumpToEventCalendar() : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onJumpToEventCalendar();
              }
            }
          : undefined
      }
      title={clickable ? "クリックでイベントカレンダーを開く" : undefined}
      style={{
        background: bg,
        borderRadius: 10,
        padding: "10px 14px",
        border: `1px solid ${accent}`,
        minWidth: 150,
        flex: "1 1 150px",
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>
        {count}
        <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 4 }}>件</span>
      </div>
      {items.length > 0 && (
        <div
          style={{
            marginTop: 6,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {items.slice(0, 3).map((it, i) => (
            <div
              key={i}
              style={{
                fontSize: 10,
                lineHeight: 1.3,
                color: "#444",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {formatItem(it)}
            </div>
          ))}
          {items.length > 3 && (
            <div style={{ fontSize: 9, color: "#888" }}>
              他 {items.length - 3} 件
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {upcomingHolidays.length > 0 && (
        <Card
          label="今後7日の休講"
          count={upcomingHolidays.length}
          color="#a02020"
          bg="#fdeeee"
          accent="#c4404033"
          items={upcomingHolidays}
          formatItem={(h) => `${h.date} ${h.label}`}
        />
      )}
      {upcomingExams.length > 0 && (
        <Card
          label="今後7日のテスト期間"
          count={upcomingExams.length}
          color="#7a4a10"
          bg="#fdf3e2"
          accent="#e0a03033"
          items={upcomingExams}
          formatItem={(ep) =>
            `${formatDateRange(ep.startDate, ep.endDate)} ${ep.name}`
          }
        />
      )}
      {upcomingSpecial.length > 0 && (
        <Card
          label="今後7日の特別イベント"
          count={upcomingSpecial.length}
          color="#5a3a8e"
          bg="#f3eef9"
          accent="#8a5ec433"
          items={upcomingSpecial}
          formatItem={(ev) => {
            const meta = specialEventTypeMeta(ev.eventType);
            return `${meta.icon} ${formatDateRange(ev.startDate, ev.endDate)} ${ev.name}`;
          }}
        />
      )}
    </div>
  );
}
