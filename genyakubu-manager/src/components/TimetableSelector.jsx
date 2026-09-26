import { useToday } from "../hooks/useToday";
import { fmtMD } from "../utils/dateHelpers";
import { getTimetableStatusOn, suggestTimetableSwitch } from "../utils/timetable";

// 今日から見た時間割の状態 (選択肢の名前の後ろに付ける)。
// 選択は端末ごと (localStorage) なので、期切替のあと旧期を表示したままの
// 端末が出る。プルダウンを開いたときにどれが今の期かを読めるようにする。
function statusLabel(tt, today) {
  const status = getTimetableStatusOn(tt, today);
  if (status === "active") return "(今日有効)";
  if (status === "upcoming") return `(開始前 ${fmtMD(tt.startDate)}〜)`;
  return "(終了)";
}

function optionLabel(tt, today) {
  const range = tt.startDate && tt.endDate ? ` (${tt.startDate}〜${tt.endDate})` : "";
  return `${tt.name}${range} ${statusLabel(tt, today)}`;
}

// 表示中の時間割が今日有効でないときの注意書き。
// **保存された選択を勝手に切り替えない** (選んだのはその端末の人なので、
// 過去の期を見返している最中かもしれない)。気付かせてボタン 1 つで
// 切り替えられるようにするだけ。今日有効な時間割が複数あるとき (学年を
// 分けた時間割を並走させている場合) は並び順の先頭を出し、残りは
// プルダウンから選んでもらう (どれが本命かは推測しない)。
function SwitchNotice({ suggestion, onChange }) {
  if (!suggestion) return null;
  const { current, status, suggestion: next, otherCount } = suggestion;
  const reason =
    status === "upcoming"
      ? `はまだ開始前です (${fmtMD(current.startDate)}〜)`
      : current.endDate
        ? `は ${fmtMD(current.endDate)} で終了しています`
        : "は終了しています";
  return (
    <span
      role="status"
      className="no-print"
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
        maxWidth: "100%",
        fontSize: 11,
        color: "#8a4a00",
        background: "#fff6e5",
        border: "1px solid #f0c070",
        borderRadius: 6,
        padding: "2px 6px",
      }}
    >
      <span>
        ⚠ 表示中の「{current.name}」{reason}
      </span>
      <button
        type="button"
        onClick={() => onChange(next.id)}
        title="週間・月間・一覧などに使う時間割を切り替えます (この端末の表示だけ)"
        style={{
          padding: "2px 8px",
          borderRadius: 5,
          border: "1px solid #f0c070",
          background: "#fff",
          color: "#8a4a00",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {next.name} (今日有効) に切り替える
      </button>
      {otherCount > 0 && (
        <span style={{ color: "#a07040" }}>ほか {otherCount} 件はプルダウンから</span>
      )}
    </span>
  );
}

// Compact timetable selector dropdown for the header area.
export function TimetableSelector({ timetables, activeTimetableId, onChange }) {
  // 「今日」はタブを開いたまま日付を跨いでも更新される (useToday)。
  // 早期 return より前に呼ぶ (hooks の順序を変えない)
  const today = useToday();
  if (!timetables || timetables.length <= 1) return null;

  // Fall back to first timetable if active ID no longer exists.
  const validId = timetables.some((t) => t.id === activeTimetableId)
    ? activeTimetableId
    : timetables[0]?.id ?? 1;
  const suggestion = suggestTimetableSwitch(timetables, validId, today);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 5,
        maxWidth: "100%",
      }}
    >
      <select
        value={validId}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid #ccc",
          fontSize: 11,
          fontWeight: 600,
          background: "#f0f4ff",
          color: "#2a4a8e",
          cursor: "pointer",
          outline: "none",
          maxWidth: "100%",
        }}
        title="表示する時間割を選択"
      >
        {timetables.map((tt) => (
          <option key={tt.id} value={tt.id}>
            {optionLabel(tt, today)}
          </option>
        ))}
      </select>
      <SwitchNotice suggestion={suggestion} onChange={onChange} />
    </span>
  );
}
