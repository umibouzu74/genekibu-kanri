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
  adjustments = [],
  allSlots = [],
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

  // この日の合同情報を索引化
  //   combineHostInfo: hostSlotId -> { absorbedSlotIds[] }
  //   combineAbsorbedInfo: absorbedSlotId -> hostSlotId
  const { combineHostInfo, combineAbsorbedInfo } = useMemo(() => {
    const host = new Map();
    const absorbed = new Map();
    for (const adj of adjustments) {
      if (adj.type !== "combine" || adj.date !== date) continue;
      host.set(adj.slotId, { absorbedSlotIds: adj.combineSlotIds || [] });
      for (const id of adj.combineSlotIds || []) absorbed.set(id, adj.slotId);
    }
    return { combineHostInfo: host, combineAbsorbedInfo: absorbed };
  }, [adjustments, date]);

  const slotById = useMemo(() => {
    const m = new Map();
    for (const s of allSlots) m.set(s.id, s);
    return m;
  }, [allSlots]);

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
                    const hostIdForAbsorbed = combineAbsorbedInfo.get(s.id);
                    const absorbed = hostIdForAbsorbed != null;
                    const hostSlot = absorbed ? slotById.get(hostIdForAbsorbed) : null;
                    const hostInfo = combineHostInfo.get(s.id);
                    const isHost = !!hostInfo;
                    const newGradeRow =
                      i > 0 &&
                      s.grade !== tSlots[i - 1].grade &&
                      !s.grade.includes("附中") &&
                      !tSlots[i - 1].grade.includes("附中");
                    return (
                      <div
                        key={s.id}
                        style={{
                          background: absorbed ? "#efe6f5" : sub ? st.bg : "#fff",
                          padding: "8px 6px",
                          textAlign: "left",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          minHeight: 96,
                          position: "relative",
                          opacity: absorbed ? 0.65 : 1,
                          ...(newGradeRow ? { gridColumnStart: 1 } : null),
                        }}
                      >
                        {(sub || absorbed || isHost) && (
                          <div
                            style={{
                              position: "absolute",
                              top: 2,
                              right: 2,
                              display: "flex",
                              gap: 2,
                            }}
                          >
                            {absorbed && (
                              <span
                                style={{
                                  background: "#7a4aa0",
                                  color: "#fff",
                                  fontSize: 8,
                                  fontWeight: 800,
                                  padding: "1px 4px",
                                  borderRadius: 3,
                                }}
                                title={
                                  hostSlot
                                    ? `合同で ${hostSlot.grade}${hostSlot.cls && hostSlot.cls !== "-" ? hostSlot.cls : ""} ${hostSlot.subj} (${hostSlot.teacher}) に統合`
                                    : "合同で吸収"
                                }
                              >
                                合
                              </span>
                            )}
                            {isHost && !absorbed && (
                              <span
                                style={{
                                  background: "#7a4aa0",
                                  color: "#fff",
                                  fontSize: 8,
                                  fontWeight: 800,
                                  padding: "1px 4px",
                                  borderRadius: 3,
                                }}
                                title={`合同ホスト\n+ ${hostInfo.absorbedSlotIds
                                  .map((id) => {
                                    const a = slotById.get(id);
                                    return a ? `${a.grade}${a.cls && a.cls !== "-" ? a.cls : ""} ${a.subj}` : `#${id}`;
                                  })
                                  .join(" / ")}`}
                              >
                                合+
                              </span>
                            )}
                            {sub && (
                              <span
                                style={{
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
                              </span>
                            )}
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
                            fontSize: sub || absorbed ? 14 : 22,
                            fontWeight: 800,
                            color: "#1a1a2e",
                            lineHeight: 1.1,
                            marginTop: 6,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {absorbed ? (
                            <span>
                              <span
                                style={{
                                  textDecoration: "line-through",
                                  color: "#999",
                                  fontSize: 12,
                                }}
                              >
                                {s.teacher || "?"}
                              </span>
                              <span style={{ margin: "0 2px", color: "#7a4aa0" }}>→</span>
                              <span style={{ color: "#7a4aa0" }}>
                                {hostSlot?.teacher || "?"}
                              </span>
                            </span>
                          ) : sub ? (
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
