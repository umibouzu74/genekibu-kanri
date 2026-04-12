import { useMemo } from "react";
import { DAY_COLOR as DC, DAYS, timeToMin } from "../../data";

// 背景色の補間: 0→白, max→濃い色
function heatColor(count, max) {
  if (!max || count === 0) return "#f8f8f8";
  const ratio = Math.min(count / max, 1);
  // 薄い青 → 濃い青
  const r = Math.round(240 - ratio * 180);
  const g = Math.round(245 - ratio * 190);
  const b = Math.round(255 - ratio * 80);
  return `rgb(${r},${g},${b})`;
}

export function HeatmapView({ slots }) {
  // 全ユニーク時間帯を時間順でソート
  const timeSlots = useMemo(() => {
    const set = new Set(slots.map((s) => s.time));
    return [...set].sort(
      (a, b) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
    );
  }, [slots]);

  // 曜日×時間帯 のコマ数集計 + 最大値
  const { grid, max, detailGrid } = useMemo(() => {
    const g = {};
    const d = {};
    let mx = 0;
    for (const day of DAYS) {
      g[day] = {};
      d[day] = {};
      for (const t of timeSlots) {
        g[day][t] = 0;
        d[day][t] = [];
      }
    }
    for (const s of slots) {
      if (g[s.day]?.[s.time] != null) {
        g[s.day][s.time]++;
        d[s.day][s.time].push(s);
        if (g[s.day][s.time] > mx) mx = g[s.day][s.time];
      }
    }
    return { grid: g, max: mx, detailGrid: d };
  }, [slots, timeSlots]);

  // 行ごと合計
  const timeTotals = useMemo(() => {
    const totals = {};
    for (const t of timeSlots) {
      totals[t] = DAYS.reduce((sum, d) => sum + (grid[d]?.[t] || 0), 0);
    }
    return totals;
  }, [grid, timeSlots]);

  // 列ごと合計
  const dayTotals = useMemo(() => {
    const totals = {};
    for (const d of DAYS) {
      totals[d] = timeSlots.reduce((sum, t) => sum + (grid[d]?.[t] || 0), 0);
    }
    return totals;
  }, [grid, timeSlots]);

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 14,
          border: "1px solid #e0e0e0",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#444" }}>
          曜日×時間帯ごとのコマ数を色の濃さで可視化しています
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11 }}>
          <span style={{ color: "#888" }}>凡例:</span>
          {[0, 2, 4, 6, 8].map((n) => (
            <span
              key={n}
              style={{
                display: "inline-block",
                width: 24,
                height: 18,
                background: heatColor(n, 8),
                border: "1px solid #ddd",
                borderRadius: 3,
                textAlign: "center",
                lineHeight: "18px",
                fontSize: 9,
                fontWeight: 700,
                color: n > 4 ? "#fff" : "#555",
              }}
            >
              {n}
            </span>
          ))}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            minWidth: 520,
            fontSize: 12,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: "8px 10px",
                  textAlign: "left",
                  background: "#1a1a2e",
                  color: "#fff",
                  borderRadius: "8px 0 0 0",
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                }}
              >
                時間帯
              </th>
              {DAYS.map((d) => (
                <th
                  key={d}
                  style={{
                    padding: "8px 10px",
                    textAlign: "center",
                    background: DC[d],
                    color: "#fff",
                    fontWeight: 800,
                    minWidth: 56,
                  }}
                >
                  {d}
                </th>
              ))}
              <th
                style={{
                  padding: "8px 10px",
                  textAlign: "center",
                  background: "#333",
                  color: "#fff",
                  borderRadius: "0 8px 0 0",
                  fontWeight: 800,
                }}
              >
                計
              </th>
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((t) => (
              <tr key={t}>
                <td
                  style={{
                    padding: "6px 10px",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    background: "#fff",
                    borderBottom: "1px solid #eee",
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                  }}
                >
                  {t}
                </td>
                {DAYS.map((d) => {
                  const cnt = grid[d]?.[t] || 0;
                  const detail = detailGrid[d]?.[t] || [];
                  const tip = detail
                    .map(
                      (s) =>
                        `${s.grade}${s.cls && s.cls !== "-" ? s.cls : ""} ${s.subj} (${s.teacher})`
                    )
                    .join("\n");
                  return (
                    <td
                      key={d}
                      title={tip || "コマなし"}
                      style={{
                        padding: "6px 10px",
                        textAlign: "center",
                        fontWeight: cnt > 0 ? 800 : 400,
                        fontSize: cnt > 0 ? 15 : 12,
                        color: cnt > max * 0.6 ? "#fff" : cnt > 0 ? "#1a1a2e" : "#ccc",
                        background: heatColor(cnt, max),
                        borderBottom: "1px solid #eee",
                        cursor: cnt > 0 ? "help" : "default",
                        transition: "background .2s",
                      }}
                    >
                      {cnt || "–"}
                    </td>
                  );
                })}
                <td
                  style={{
                    padding: "6px 10px",
                    textAlign: "center",
                    fontWeight: 700,
                    borderBottom: "1px solid #eee",
                    background: "#f8f8f8",
                  }}
                >
                  {timeTotals[t]}
                </td>
              </tr>
            ))}
            <tr>
              <td
                style={{
                  padding: "8px 10px",
                  fontWeight: 800,
                  background: "#f0f0f0",
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                }}
              >
                合計
              </td>
              {DAYS.map((d) => (
                <td
                  key={d}
                  style={{
                    padding: "8px 10px",
                    textAlign: "center",
                    fontWeight: 800,
                    background: "#f0f0f0",
                    fontSize: 14,
                  }}
                >
                  {dayTotals[d]}
                </td>
              ))}
              <td
                style={{
                  padding: "8px 10px",
                  textAlign: "center",
                  fontWeight: 800,
                  background: "#1a1a2e",
                  color: "#fff",
                  fontSize: 14,
                  borderRadius: "0 0 8px 0",
                }}
              >
                {slots.length}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
