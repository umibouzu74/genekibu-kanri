import { fmtDateWeekday } from "../utils/dateHelpers";

// カレンダー (講師別月間 / イベントカレンダー) の日付の数字。
// onSelectDate があれば「その日をダッシュボードで見る」ボタンにし、
// onJumpToAbsenceFlow があれば隣に 🚑 (その日の欠勤組み換え) を出す。
// 数字は紙面にも要るので、ボタンは見た目を素の文字に寄せる (背景・枠なし。
// 点線の下線は紙面では消す = appShell.css の .day-number-link)。
// 🚑 は画面だけの道具なので no-print。タッチ端末には hover が無いので常時
// 出しておき、薄く (0.45) してホバー / フォーカスで濃くする (同 CSS)。
// どちらのボタンも行内の小さな道具なので、モバイルの 40px 規則
// (appShell.css の button 最小高) から `inline-activate` で外す。
//
// 読み上げ名 / title は他の導線 (DashboardDateNav / DashDayRow) と同じ文言:
//   「YYYY-MM-DD (曜) をダッシュボードで見る」「YYYY-MM-DD (曜) の欠勤組み換えを開く」
function dayNumberLabels(ds) {
  const day = fmtDateWeekday(ds);
  return {
    dashboard: `${day} をダッシュボードで見る`,
    absence: `${day} の欠勤組み換えを開く`,
  };
}

export function DayNumberLink({ d, ds, onSelectDate, onJumpToAbsenceFlow }) {
  const labels = dayNumberLabels(ds);
  return (
    <span
      className="day-number-link"
      style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
    >
      {onSelectDate ? (
        <button
          type="button"
          className="inline-activate"
          onClick={() => onSelectDate(ds)}
          aria-label={labels.dashboard}
          title={labels.dashboard}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            margin: 0,
            font: "inherit",
            color: "inherit",
            cursor: "pointer",
            textDecoration: "underline dotted",
            textUnderlineOffset: 2,
          }}
        >
          {d}
        </button>
      ) : (
        <span>{d}</span>
      )}
      {onJumpToAbsenceFlow && (
        <button
          type="button"
          className="no-print inline-activate day-number-absence"
          onClick={() => onJumpToAbsenceFlow(ds)}
          aria-label={labels.absence}
          title={labels.absence}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            margin: 0,
            fontSize: 10,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          🚑
        </button>
      )}
    </span>
  );
}

// カレンダーのヘッダに出す凡例 (画面だけ)。渡された導線ぶんだけ書く。
// 「🚑 が何か」は凡例が無いと判らない (毎日並ぶ絵文字なので)
export function DayNumberLegend({ onSelectDate, onJumpToAbsenceFlow, style }) {
  const parts = [];
  if (onSelectDate) parts.push("日付クリック = その日のダッシュボード");
  if (onJumpToAbsenceFlow) parts.push("🚑 = 欠勤組み換え");
  if (parts.length === 0) return null;
  return (
    <span
      className="no-print"
      data-testid="day-number-legend"
      style={{ fontSize: 10, color: "#888", whiteSpace: "nowrap", ...style }}
    >
      {parts.join(" / ")}
    </span>
  );
}
