import { useMemo } from "react";
import { DAY_BG as DB, DAY_COLOR as DC, DAYS } from "../../data";
import { formatCount, weightedSlotCount, isSlotForTeacher, getSlotTeachers } from "../../utils/biweekly";

export function AllView({ slots, onSelectTeacher }) {
  const teachers = useMemo(() => {
    const tSet = new Set();
    for (const s of slots) for (const t of getSlotTeachers(s)) tSet.add(t);
    return [...tSet]
      .map((t) => {
        const sl = slots.filter((s) => isSlotForTeacher(s, t));
        const byDay = {};
        const byDayTip = {};
        DAYS.forEach((d) => {
          const ds = sl.filter((s) => s.day === d);
          byDay[d] = weightedSlotCount(ds);
          byDayTip[d] = ds.map((s) => `${s.time} ${s.grade} ${s.subj}`).join("\n");
        });
        return { name: t, byDay, byDayTip, total: weightedSlotCount(sl) };
      })
      .sort((a, b) => b.total - a.total);
  }, [slots]);

  return (
    <div
      className="mobile-scroll-x"
      style={{ marginTop: 12, overflowX: "auto", WebkitOverflowScrolling: "touch" }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th
              className="allview-name-col"
              style={{
                textAlign: "left",
                padding: "10px 14px",
                background: "#1a1a2e",
                color: "#fff",
                borderRadius: "8px 0 0 0",
                fontSize: 14,
                position: "sticky",
                left: 0,
                zIndex: 2,
              }}
            >
              講師名
            </th>
            {DAYS.map((d) => (
              <th
                key={d}
                style={{
                  padding: "10px 12px",
                  background: DC[d],
                  color: "#fff",
                  textAlign: "center",
                  minWidth: 56,
                  fontSize: 14,
                }}
              >
                {d}
              </th>
            ))}
            <th
              style={{
                padding: "10px 12px",
                background: "#1a1a2e",
                color: "#fff",
                textAlign: "center",
                borderRadius: "0 8px 0 0",
                fontSize: 14,
              }}
            >
              計
            </th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((t, i) => {
            const rowBg = i % 2 ? "#f8f9fa" : "#fff";
            return (
            <tr key={t.name} style={{ background: rowBg }}>
              <td
                className="allview-name-col"
                onClick={() => onSelectTeacher && onSelectTeacher(t.name)}
                style={{
                  padding: "8px 14px",
                  fontWeight: 800,
                  fontSize: 15,
                  borderBottom: "1px solid #eee",
                  cursor: onSelectTeacher ? "pointer" : "default",
                  color: onSelectTeacher ? "#2e6a9e" : "inherit",
                  position: "sticky",
                  left: 0,
                  background: rowBg,
                  zIndex: 1,
                }}
                onMouseEnter={(e) => {
                  if (onSelectTeacher) e.currentTarget.style.textDecoration = "underline";
                }}
                onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
              >
                {t.name}
              </td>
              {DAYS.map((d) => (
                <td
                  key={d}
                  title={t.byDayTip[d]}
                  style={{
                    textAlign: "center",
                    padding: "8px 10px",
                    borderBottom: "1px solid #eee",
                    background: t.byDay[d] ? DB[d] : "transparent",
                    fontWeight: t.byDay[d] > 3 ? 800 : t.byDay[d] ? 600 : 400,
                    fontSize: t.byDay[d] ? 18 : 13,
                    color: t.byDay[d] > 3 ? DC[d] : t.byDay[d] ? "#1a1a2e" : "#ccc",
                    cursor: "default",
                  }}
                >
                  {t.byDay[d] ? formatCount(t.byDay[d]) : "—"}
                </td>
              ))}
              <td
                style={{
                  textAlign: "center",
                  padding: "8px 10px",
                  fontWeight: 800,
                  fontSize: 18,
                  borderBottom: "1px solid #eee",
                  color: t.total > 10 ? "#c44" : "#1a1a2e",
                }}
              >
                {formatCount(t.total)}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
