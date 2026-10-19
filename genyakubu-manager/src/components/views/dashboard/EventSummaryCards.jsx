import { useMemo } from "react";
import { fmtDate } from "../../../data";
import { formatDateRange, overlapsRange } from "../../../utils/dateHelpers";
import { specialEventTypeMeta } from "../../../constants/specialEvents";
import { fmtMDWeekday } from "../../../utils/dateHelpers";
import { leaveKindMeta } from "../../../utils/staffLeave";

// ─── 直近 7 日のイベントサマリ ───────────────────────────────────────
// 休講・テスト期間・特別イベントを直近 7 日内のものに絞って件数 +
// 当日先頭 3 件を表示。代行 (SubSummaryCards) と並ぶ位置取り。
//
// onJumpToEventCalendar が渡されると、カードクリックでイベント
// カレンダービューへ遷移する。
//
// leaveSoon (staffLeave.upcomingLeave の戻り値) を渡すと「今後7日の休暇」
// (現役部 常勤の有給・半休) も並べる。管理者だけが読めるデータなので、読める
// 人のときだけ Dashboard が渡す。休暇の 1 行を押すとその人・その日を直す欄を
// 開いた有給・半休の画面へ、「＋ 入れる」で人と日を選んで入れる欄へ
// (onOpenLeave({name, date}) / onOpenLeave({}))。カード全体はボタンにしない
// (中にボタンを並べるため)。
export function EventSummaryCards({
  todayStr,
  holidays = [],
  examPeriods = [],
  specialEvents = [],
  onJumpToEventCalendar,
  leaveSoon = [],
  onOpenLeave,
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
  // 休暇は人 × 日の件数
  const leaveItems = (leaveSoon || []).flatMap((d) => d.records);
  const total =
    upcomingHolidays.length +
    upcomingExams.length +
    upcomingSpecial.length +
    leaveItems.length;
  if (total === 0) return null;

  const Card = ({
    label,
    count,
    color,
    bg,
    accent,
    items,
    formatItem,
    onOpen = onJumpToEventCalendar,
    openTitle = "クリックでイベントカレンダーを開く",
  }) => {
    const clickable = !!onOpen;
    return (
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onOpen() : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen();
                }
              }
            : undefined
        }
        title={clickable ? openTitle : undefined}
        style={{
          background: bg,
          borderRadius: 10,
          padding: "10px 14px",
          border: `1px solid ${accent}`,
          minWidth: 150,
          // 1 枚だけのときに横幅いっぱいに伸びて間延びしないように上限を付ける
          maxWidth: 360,
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
  };

  return (
    // 直近 7 日のサマリも画面用の道具なので紙面には載せない
    // (SubSummaryCards と同じ。2026-09-15)
    <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
      {leaveItems.length > 0 && <LeaveSoonCard items={leaveItems} onOpenLeave={onOpenLeave} />}
    </div>
  );
}

// 「今後7日の休暇 (有給・半休)」。1 行ずつ押せる (その人・その日を直す欄へ) +
// 「＋ 入れる」(人と日を選んで入れる欄へ)
function LeaveSoonCard({ items, onOpenLeave }) {
  const color = "#1f6a3a";
  const rowBtn = {
    display: "block",
    width: "100%",
    textAlign: "left",
    border: "none",
    background: "none",
    padding: 0,
    margin: 0,
    fontSize: 10,
    lineHeight: 1.3,
    color: "#444",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    cursor: onOpenLeave ? "pointer" : "default",
  };
  return (
    <div
      style={{
        background: "#eef7f0",
        borderRadius: 10,
        padding: "10px 14px",
        border: "1px solid #7cc08e55",
        minWidth: 150,
        maxWidth: 360,
        flex: "1 1 150px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>今後7日の休暇 (有給・半休)</span>
        {onOpenLeave && (
          <button
            type="button"
            className="inline-activate"
            onClick={() => onOpenLeave({})}
            title="人と日を選んで有給・半休を入れる"
            style={{
              marginLeft: "auto",
              border: `1px solid ${color}66`,
              background: "#fff",
              color,
              borderRadius: 6,
              padding: "1px 8px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ＋ 入れる
          </button>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>
        {items.length}
        <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 4 }}>件</span>
      </div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
        {items.slice(0, 3).map((r) => {
          const text = `${fmtMDWeekday(r.date)} ${r.name} ${leaveKindMeta(r.kind).label}${
            r.memo ? ` (${r.memo})` : ""
          }`;
          return onOpenLeave ? (
            <button
              key={`${r.name}|${r.date}`}
              type="button"
              className="inline-activate"
              onClick={() => onOpenLeave({ name: r.name, date: r.date })}
              title={`${text} を有給・半休の画面で直す`}
              style={rowBtn}
            >
              {text}
            </button>
          ) : (
            <div key={`${r.name}|${r.date}`} style={rowBtn}>
              {text}
            </div>
          );
        })}
        {items.length > 3 &&
          (onOpenLeave ? (
            <button
              type="button"
              className="inline-activate"
              onClick={() => onOpenLeave(null)}
              title="有給・半休の画面を開く"
              style={{ ...rowBtn, fontSize: 9, color: "#888" }}
            >
              他 {items.length - 3} 件 →
            </button>
          ) : (
            <div style={{ fontSize: 9, color: "#888" }}>他 {items.length - 3} 件</div>
          ))}
      </div>
    </div>
  );
}
