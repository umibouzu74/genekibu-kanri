import { S } from "../styles/common";

// 月送りの操作列 (◀ / YYYY年M月 / ▶ / 今月 / 月ピッカー)。
// イベントカレンダーと講師別月間 (App) で同じ見た目・同じ読み上げ名・同じ
// title にするため 1 か所に置く。月の state はビュー側が持ち (絶対の
// "YYYY-MM" でも今日からの差でもよい)、ここは表示と callback だけ。
//   year / month (1-12) = 表示中の月
//   onPrev / onNext / onToday = ◀ / ▶ / 今月 (← / → / t と同じ動き)
//   onPick(ym)  = <input type="month"> の値 ("YYYY-MM"。空や形式外もそのまま
//                 渡すので、受け側で検証する)
//   isCurrent   = 表示中の月が今月か (「今月」ボタンの強調)
//   label       = 年月の表示を差し替えたいとき (省略時は「YYYY年M月」)
// 年月の表示は紙面にも要るので残し、操作 (ボタン・ピッカー) だけ no-print。
export function MonthNav({
  year,
  month,
  onPrev,
  onNext,
  onToday,
  onPick,
  isCurrent = false,
  label,
  style,
}) {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        ...style,
      }}
    >
      <button
        type="button"
        className="no-print"
        onClick={onPrev}
        aria-label="前の月"
        title="前の月 (←)"
        style={{ ...S.btn(false), padding: "4px 10px", fontSize: 14 }}
      >
        ◀
      </button>
      <span style={{ fontSize: 15, fontWeight: 800 }} aria-live="polite">
        {label ?? `${year}年${month}月`}
      </span>
      <button
        type="button"
        className="no-print"
        onClick={onNext}
        aria-label="次の月"
        title="次の月 (→)"
        style={{ ...S.btn(false), padding: "4px 10px", fontSize: 14 }}
      >
        ▶
      </button>
      <button
        type="button"
        className="no-print"
        onClick={onToday}
        title="今月 (t)"
        style={{ ...S.btn(isCurrent), fontSize: 11 }}
      >
        今月
      </button>
      <input
        type="month"
        className="no-print"
        aria-label="表示する月"
        title="表示する月を選ぶ (← / → で前後の月、t で今月)"
        value={ym}
        onChange={(e) => onPick?.(e.target.value)}
        style={{ ...S.input, width: "auto", padding: "4px 8px", fontSize: 12 }}
      />
    </div>
  );
}
