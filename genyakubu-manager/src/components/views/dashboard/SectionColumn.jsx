import { useMemo } from "react";
import {
  getSubForSlot,
  gradeColor as GC,
  SUB_STATUS,
  timeToMin,
} from "../../../data";
import {
  formatBiweeklyNote,
  formatCount,
  weightedSlotCount,
} from "../../../utils/biweekly";
import { formatSessionNumber } from "../../../utils/sessionCount";

// Single department / time-grouped slot column rendered inside DashDayRow.
export function SectionColumn({
  label,
  color,
  sl,
  deptOff,
  subs,
  date,
  sessionCountMap,
}) {
  const { timeGroups, teachers } = useMemo(() => {
    const byTime = {};
    sl.forEach((s) => {
      if (!byTime[s.time]) byTime[s.time] = [];
      byTime[s.time].push(s);
    });
    return {
      timeGroups: Object.entries(byTime).sort(
        ([a], [b]) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
      ),
      teachers: [...new Set(sl.map((s) => s.teacher))],
    };
  }, [sl]);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          background: color.b,
          color: color.f,
          padding: "8px 12px",
          borderRadius: "8px 8px 0 0",
          fontWeight: 800,
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{label}</span>
        {!deptOff && sl.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>
            {formatCount(weightedSlotCount(sl))}コマ / {teachers.length}名
          </span>
        )}
      </div>
      <div
        style={{
          background: "#fff",
          borderRadius: "0 0 8px 8px",
          border: "1px solid #e0e0e0",
          borderTop: "none",
          padding: 10,
          minHeight: 80,
        }}
      >
        {deptOff ? (
          <div style={{ textAlign: "center", color: "#bbb", padding: 20, fontSize: 13 }}>
            休講日
          </div>
        ) : sl.length === 0 ? (
          <div style={{ textAlign: "center", color: "#bbb", padding: 20, fontSize: 13 }}>
            授業なし
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {timeGroups.map(([time, tSlots]) => (
              <div key={time}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: color.f,
                    marginBottom: 4,
                    paddingBottom: 3,
                    borderBottom: `2px solid ${color.accent}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{time}</span>
                  <span style={{ fontSize: 10, fontWeight: 400, color: "#888" }}>
                    {formatCount(weightedSlotCount(tSlots))}コマ
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))",
                    background: "#555",
                    gap: 2,
                    border: "2px solid #555",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  {tSlots.map((s, i) => {
                    const gc = GC(s.grade);
                    const sub = date ? getSubForSlot(subs, s.id, date) : null;
                    const st = sub ? SUB_STATUS[sub.status] || SUB_STATUS.requested : null;
                    const sessionNum = sessionCountMap ? sessionCountMap.get(s.id) || 0 : 0;
                    const newGradeRow =
                      i > 0 &&
                      s.grade !== tSlots[i - 1].grade &&
                      !s.grade.includes("附中") &&
                      !tSlots[i - 1].grade.includes("附中");
                    return (
                      <div
                        key={s.id}
                        style={{
                          background: sub ? st.bg : "#fff",
                          padding: "8px 6px",
                          textAlign: "left",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          minHeight: 96,
                          position: "relative",
                          ...(newGradeRow ? { gridColumnStart: 1 } : null),
                        }}
                      >
                        {sub && (
                          <div
                            style={{
                              position: "absolute",
                              top: 2,
                              right: 2,
                              background: st.color,
                              color: "#fff",
                              fontSize: 8,
                              fontWeight: 800,
                              padding: "1px 4px",
                              borderRadius: 3,
                            }}
                            title={`${sub.originalTeacher} → ${sub.substitute || "未定"}\n${st.label}${sub.memo ? "\n" + sub.memo : ""}`}
                          >
                            代
                          </div>
                        )}
                        <div style={{ lineHeight: 1.4 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-start",
                              gap: 4,
                              flexWrap: "wrap",
                            }}
                          >
                            {sessionNum > 0 && (
                              <span
                                title={`第${sessionNum}回`}
                                aria-label={`第${sessionNum}回`}
                                style={{
                                  background: "#3a6ea5",
                                  color: "#fff",
                                  borderRadius: 4,
                                  padding: "0 5px",
                                  fontSize: 13,
                                  fontWeight: 800,
                                  lineHeight: "18px",
                                  minWidth: 20,
                                  textAlign: "center",
                                  boxShadow: "0 1px 2px rgba(0,0,0,.12)",
                                  flexShrink: 0,
                                }}
                              >
                                {formatSessionNumber(sessionNum)}
                              </span>
                            )}
                            <span
                              style={{
                                background: gc.b,
                                color: gc.f,
                                borderRadius: 3,
                                padding: "1px 4px",
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {s.grade}
                              {s.cls && s.cls !== "-" ? s.cls : ""}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#444" }}>
                              {s.subj}
                            </span>
                          </div>
                          {(s.room || s.note) && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 6,
                                marginTop: 2,
                                flexWrap: "wrap",
                              }}
                            >
                              {s.room && (
                                <span style={{ fontSize: 18, fontWeight: 700, color: "#555" }}>
                                  {s.room}
                                </span>
                              )}
                              {s.note && (
                                <span style={{ fontSize: 13, fontWeight: 600, color: "#a0331a" }}>
                                  ({formatBiweeklyNote(s.teacher, s.note)})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: sub ? 16 : 22,
                            fontWeight: 800,
                            color: "#1a1a2e",
                            lineHeight: 1.1,
                            marginTop: 6,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {sub ? (
                            <span>
                              <span
                                style={{
                                  textDecoration: "line-through",
                                  color: "#999",
                                  fontSize: 12,
                                }}
                              >
                                {sub.originalTeacher}
                              </span>
                              <span style={{ margin: "0 2px", color: st.color }}>→</span>
                              <span style={{ color: st.color }}>{sub.substitute || "?"}</span>
                            </span>
                          ) : s.teacher ? (
                            s.teacher
                          ) : (
                            <span style={{ color: "#c44", fontSize: 14, fontStyle: "italic" }}>
                              未割当
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
