import { S } from "../styles/common";
import { LIST_PERIOD_MODES } from "../utils/listPeriod";

// 一覧の期間絞り込みのバー (utils/listPeriod)。5 つのマネージャで同じ部品を使う。
//   const period = useListPeriod();            // hooks/useListPeriod
//   const shown = period.apply(sorted, (x) => [x.startDate, x.endDate]);
//   <ListPeriodFilter period={period} shown={shown.length} total={sorted.length} noun="テスト期間" />
export function ListPeriodFilter({ period, shown, total, noun = "件" }) {
  const hidden = total - shown;
  return (
    <div
      className="no-print"
      style={{
        display: "flex",
        gap: 6,
        marginBottom: 8,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700 }}>期間:</span>
      {LIST_PERIOD_MODES.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => period.setMode(m.key)}
          aria-pressed={period.mode === m.key}
          style={{ ...S.btn(period.mode === m.key), fontSize: 11, padding: "4px 10px" }}
        >
          {m.label}
        </button>
      ))}
      {period.mode === "month" && (
        <input
          type="month"
          value={period.month}
          onChange={(e) => e.target.value && period.setMonth(e.target.value)}
          aria-label={`${noun}の表示月`}
          style={{ ...S.input, width: "auto", fontSize: 12, padding: "3px 6px" }}
        />
      )}
      <span style={{ fontSize: 12, color: "#888" }}>
        {shown} / {total} 件表示
        {hidden > 0 && period.mode !== "all" && (
          <>
            {" "}
            <button
              type="button"
              onClick={() => period.setMode("all")}
              style={{
                border: "none",
                background: "none",
                color: "#2a6a9e",
                cursor: "pointer",
                fontSize: 11,
                padding: 0,
                textDecoration: "underline",
              }}
            >
              (期間外の {hidden} 件も表示)
            </button>
          </>
        )}
      </span>
    </div>
  );
}
