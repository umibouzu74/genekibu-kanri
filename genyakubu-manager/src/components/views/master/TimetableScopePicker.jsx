import { fmtMD } from "../../../utils/dateHelpers";
import { getTimetableStatusOn } from "../../../utils/timetable";

// コースマスター管理で見る時間割の選択。既定は「今の時間割」(今日の日付で
// 決まる時間割。ほかの画面と同じ)。前の期のコマを直す・次の期のコマを
// 先に見るときだけ時間割を選ぶ。選択はこの画面の中だけで、端末にも
// ほかの画面にも持ち越さない (以前のヘッダのセレクタは端末ごとに覚えて
// いたため、前の期のまま止まる端末が出た)。

export const CURRENT_TIMETABLE = "current";

const STATUS_LABEL = { active: "今日有効", upcoming: "開始前", ended: "終了" };

// 「1学期（4/1〜8/31・終了）」「2学期（9/1〜・今日有効）」「通常（今日有効）」
function optionLabel(tt, today) {
  const range =
    tt.startDate || tt.endDate
      ? `${tt.startDate ? fmtMD(tt.startDate) : ""}〜${tt.endDate ? fmtMD(tt.endDate) : ""}・`
      : "";
  return `${tt.name}（${range}${STATUS_LABEL[getTimetableStatusOn(tt, today)]}）`;
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
        title="コマ一覧・隔週管理・時間割表に出す時間割（この画面の中だけの選択で、端末には覚えません。ほかの画面は日付で自動的に決まります）"
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
