import { useMemo } from "react";
import {
  ADJ_COLOR,
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
import { buildAdjustmentIndex } from "../../../utils/adjustmentDisplay";
import { colors } from "../../../styles/tokens";

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
  // この日の合同・移動情報を索引化 (共通ヘルパを使用)
  const { combineAbsorbedBySlot, combineHostBySlot, moveBySlot } = useMemo(
    () => buildAdjustmentIndex(adjustments, date),
    [adjustments, date]
  );

  // 移動が適用された後の「実効時間」で slot をグループ化。
  // moveBySlot に載っている slot は targetTime で、他は template の s.time で集計。
  const { timeGroups, teachers } = useMemo(() => {
    const byTime = {};
    sl.forEach((s) => {
      const effTime = moveBySlot.get(s.id) || s.time;
      if (!byTime[effTime]) byTime[effTime] = [];
      byTime[effTime].push(s);
    });
    return {
      timeGroups: Object.entries(byTime).sort(
        ([a], [b]) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
      ),
      teachers: [...new Set(sl.map((s) => s.teacher))],
    };
  }, [sl, moveBySlot]);

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
            {timeGroups.map(([time, tSlots]) => {
              // この時間グループに「移動で流入した」コマがあれば時間ヘッダに補足。
              // 元時刻のリストを集約してツールチップに出す。
              const movedIn = tSlots.filter((s) => moveBySlot.get(s.id));
              const movedInOrigTimes = [
                ...new Set(movedIn.map((s) => s.time).filter(Boolean)),
              ];
              return (
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
                  {movedIn.length > 0 && (
                    <span
                      title={`移動で流入: ${movedInOrigTimes.join(" / ")} から`}
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: "#fff",
                        background: ADJ_COLOR.move.color,
                        padding: "1px 6px",
                        borderRadius: 8,
                      }}
                    >
                      ← 移入 {movedIn.length}
                    </span>
                  )}
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
                    const hostIdForAbsorbed = combineAbsorbedBySlot.get(s.id);
                    const absorbed = hostIdForAbsorbed != null;
                    const hostSlot = absorbed ? slotById.get(hostIdForAbsorbed) : null;
                    const hostedIds = combineHostBySlot.get(s.id);
                    const isHost = !!hostedIds;
                    const moveTarget = moveBySlot.get(s.id);
                    const newGradeRow =
                      i > 0 &&
                      s.grade !== tSlots[i - 1].grade &&
                      !s.grade.includes("附中") &&
                      !tSlots[i - 1].grade.includes("附中");
                    const badgeStyle = (bg) => ({
                      background: bg,
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: 800,
                      padding: "1px 4px",
                      borderRadius: 3,
                    });
                    return (
                      <div
                        key={s.id}
                        style={{
                          background: absorbed ? ADJ_COLOR.combine.bg : sub ? st.bg : "#fff",
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
                        {(sub || absorbed || isHost || moveTarget) && (
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
                                style={badgeStyle(ADJ_COLOR.combine.color)}
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
                                style={badgeStyle(ADJ_COLOR.combine.color)}
                                title={`合同ホスト\n+ ${hostedIds
                                  .map((id) => {
                                    const a = slotById.get(id);
                                    return a ? `${a.grade}${a.cls && a.cls !== "-" ? a.cls : ""} ${a.subj}` : `#${id}`;
                                  })
                                  .join(" / ")}`}
                              >
                                合+
                              </span>
                            )}
                            {moveTarget && (
                              <span
                                style={badgeStyle(ADJ_COLOR.move.color)}
                                title={`時間変更\n${s.time} → ${moveTarget}`}
                              >
                                移
                              </span>
                            )}
                            {sub && (
                              <span
                                style={badgeStyle(st.color)}
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
                              <span style={{ margin: "0 2px", color: ADJ_COLOR.combine.color }}>→</span>
                              <span style={{ color: ADJ_COLOR.combine.color }}>
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
                            <span style={{ color: colors.danger, fontSize: 14, fontStyle: "italic" }}>
                              未割当
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
