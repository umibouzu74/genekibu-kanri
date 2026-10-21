import { fmtMD } from "../../../utils/dateHelpers";
import { getTimetableStatusOn } from "../../../utils/timetable";

// コースマスター管理で見る時間割の選択。既定は「今の時間割」(今日の日付で
// 決まる時間割。ほかの画面と同じ)。前の期のコマを直す・次の期のコマを
// 先に見るときだけ時間割を選ぶ。選択はこの画面の中だけで、端末にも
// ほかの画面にも持ち越さない (以前のヘッダのセレクタは端末ごとに覚えて
// いたため、前の期のまま止まる端末が出た)。

export const CURRENT_TIMETABLE = "current";

function statusLabel(tt, today) {
  const status = getTimetableStatusOn(tt, today);
  if (status === "active") return "今日有効";
  if (status === "upcoming") return tt.startDate ? `開始前 ${fmtMD(tt.startDate)}〜` : "開始前";
  return "終了";
}

function optionLabel(tt, today) {
  const range =
    tt.startDate || tt.endDate
      ? ` ${tt.startDate ? fmtMD(tt.startDate) : ""}〜${tt.endDate ? fmtMD(tt.endDate) : ""}`
      : "";
  return `${tt.name}（${statusLabel(tt, today)}${range}）`;
}

export function TimetableScopePicker({ timetables, value, onChange, currentNames, today }) {
  if (!timetables || timetables.length <= 1) return null;
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      時間割
      <select
        value={value === CURRENT_TIMETABLE ? CURRENT_TIMETABLE : String(value)}
        onChange={(e) =>
          onChange(
            e.target.value === CURRENT_TIMETABLE ? CURRENT_TIMETABLE : Number(e.target.value)
          )
        }
        title="一覧・時間割表に出す時間割 (この画面だけの選択。ほかの画面は今日の日付で決まります)"
        style={{
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid #ccc",
          fontSize: 12,
          fontWeight: 600,
          background: value === CURRENT_TIMETABLE ? "#f0f4ff" : "#fff6e5",
          color: value === CURRENT_TIMETABLE ? "#2a4a8e" : "#8a4a00",
          maxWidth: "100%",
        }}
      >
        <option value={CURRENT_TIMETABLE}>
          今の時間割{currentNames ? `（${currentNames}）` : ""}
        </option>
        {timetables.map((tt) => (
          <option key={tt.id} value={String(tt.id)}>
            {optionLabel(tt, today)}
          </option>
        ))}
      </select>
    </label>
  );
}
