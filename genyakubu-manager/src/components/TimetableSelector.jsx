// Compact timetable selector dropdown for the header area.
export function TimetableSelector({ timetables, activeTimetableId, onChange }) {
  if (!timetables || timetables.length <= 1) return null;

  return (
    <select
      value={activeTimetableId}
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
      }}
      title="表示する時間割を選択"
    >
      {timetables.map((tt) => (
        <option key={tt.id} value={tt.id}>
          {tt.name}
          {tt.startDate && tt.endDate
            ? ` (${tt.startDate}〜${tt.endDate})`
            : ""}
        </option>
      ))}
    </select>
  );
}
