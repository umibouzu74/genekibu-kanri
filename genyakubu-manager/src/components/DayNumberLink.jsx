// カレンダー (講師別月間 / イベントカレンダー) の日付の数字。
// onSelectDate があれば「その日をダッシュボードで見る」ボタンにし、
// onJumpToAbsenceFlow があれば隣に 🚑 (その日の欠勤組み換え) を出す。
// 数字は紙面にも要るので、ボタンは見た目を素の文字に寄せる (背景・枠なし)。
// 🚑 は画面だけの道具なので no-print。
export function DayNumberLink({ d, month, ds, onSelectDate, onJumpToAbsenceFlow }) {
  const label = `${month}/${d}`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {onSelectDate ? (
        <button
          type="button"
          onClick={() => onSelectDate(ds)}
          aria-label={`${label} をダッシュボードで見る`}
          title={`${label} をダッシュボードで見る`}
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
          className="no-print"
          onClick={() => onJumpToAbsenceFlow(ds)}
          aria-label={`${label} の欠勤組み換え`}
          title={`${label} の欠勤組み換えを開く`}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            margin: 0,
            fontSize: 10,
            lineHeight: 1,
            cursor: "pointer",
            opacity: 0.7,
          }}
        >
          🚑
        </button>
      )}
    </span>
  );
}
