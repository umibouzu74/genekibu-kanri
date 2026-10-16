import { useState } from "react";
import { WEEKDAYS } from "../constants/schools";
import { fmtDate, fmtDateWeekday, parseLocalDate } from "../utils/dateHelpers";

// ─── 複数の日付を押して選ぶ月のカレンダー ──────────────────────────
// 休講日の一括登録 (飛び飛びの 7 日を 1 回で) と、不定期のコマの実施日
// (SlotForm) で使う。押すたびにその日を選ぶ / 外す (onToggle)。
//
// - allowedWeekday ("月" など) を渡すとその曜日だけ押せる (不定期のコマは
//   そのコマの曜日にしか実施しないため)
// - 選択中の日付の並べ替え・重複除去は呼び出し側 (選択の持ち主) の役目

function monthOf(dateStr) {
  return dateStr && /^\d{4}-\d{2}/.test(dateStr) ? dateStr.slice(0, 7) : null;
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function monthCells(ym) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(fmtDate(new Date(y, m - 1, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * @param {{
 *   selected: string[],
 *   onToggle: (date: string) => void,
 *   allowedWeekday?: string,
 *   initialMonth?: string,
 *   label?: string,
 * }} props
 */
export function MultiDateCalendar({ selected, onToggle, allowedWeekday, initialMonth, label }) {
  const [ym, setYm] = useState(
    () => monthOf(initialMonth) || monthOf((selected || [])[0]) || fmtDate(new Date()).slice(0, 7)
  );
  const sel = new Set(selected || []);
  const [y, m] = ym.split("-").map(Number);
  const inMonth = (selected || []).filter((d) => d.startsWith(ym)).length;
  return (
    <div
      role="group"
      aria-label={label || "日付を選ぶカレンダー"}
      style={{
        display: "inline-block",
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 8,
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <button
          type="button"
          onClick={() => setYm(shiftMonth(ym, -1))}
          aria-label="前の月"
          style={navBtn}
        >
          ‹
        </button>
        <span style={{ fontWeight: 700, minWidth: 90, textAlign: "center" }}>
          {y}年{m}月
          {inMonth > 0 && (
            <span style={{ fontSize: 10, color: "#a03030", marginLeft: 4 }}>({inMonth})</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setYm(shiftMonth(ym, 1))}
          aria-label="次の月"
          style={navBtn}
        >
          ›
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 30px)", gap: 2 }}>
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            aria-hidden="true"
            style={{
              textAlign: "center",
              fontSize: 10,
              fontWeight: 700,
              color: i === 0 ? "#c03030" : i === 6 ? "#2a5a9a" : "#888",
            }}
          >
            {w}
          </div>
        ))}
        {monthCells(ym).map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const dow = WEEKDAYS[parseLocalDate(d).getDay()];
          const allowed = !allowedWeekday || dow === allowedWeekday;
          const on = sel.has(d);
          return (
            <button
              key={d}
              type="button"
              disabled={!allowed && !on}
              onClick={() => onToggle(d)}
              aria-pressed={on}
              aria-label={fmtDateWeekday(d)}
              style={{
                width: 30,
                height: 26,
                padding: 0,
                fontSize: 11,
                borderRadius: 5,
                cursor: allowed || on ? "pointer" : "default",
                border: `1px solid ${on ? "#a03030" : "#e4e4e4"}`,
                background: on ? "#fde4e4" : allowed ? "#fff" : "#f6f6f6",
                color: on ? "#a03030" : allowed ? "#333" : "#ccc",
                fontWeight: on ? 800 : 400,
              }}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const navBtn = {
  border: "1px solid #ddd",
  background: "#f8f8f8",
  borderRadius: 4,
  width: 24,
  height: 22,
  cursor: "pointer",
  padding: 0,
  fontSize: 14,
  lineHeight: "18px",
};
