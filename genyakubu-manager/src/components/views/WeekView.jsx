import { useMemo } from "react";
import {
  DAY_BG as DB,
  DAY_COLOR as DC,
  DAYS,
  fmtDateWeekday,
  sortSlots as sortS,
  SUB_STATUS,
} from "../../data";
import { SlotCard } from "../SlotCard";
import { StatusBadge } from "../StatusBadge";
import { exportTeacherIcs } from "../../utils/ics";
import { S } from "../../styles/common";

export function WeekView({ teacher, slots, subs, onEdit, onDel, isAdmin }) {
  const ts = useMemo(
    () => sortS(slots.filter((s) => s.teacher === teacher || s.note?.includes(teacher))),
    [teacher, slots]
  );
  const byDay = useMemo(() => {
    const m = {};
    DAYS.forEach((d) => {
      m[d] = [];
    });
    ts.forEach((s) => m[s.day]?.push(s));
    return m;
  }, [ts]);

  // 各スロットに対する直近14日間の代行予定をマップ化し、SlotCard にインライン表示する
  const slotSubMap = useMemo(() => {
    if (!subs?.length) return new Map();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 14);
    const m = new Map();
    for (const sub of subs) {
      if (sub.originalTeacher !== teacher && sub.substitute !== teacher) continue;
      const [y, mo, d] = sub.date.split("-").map(Number);
      const dt = new Date(y, mo - 1, d);
      if (dt < today || dt > end) continue;
      if (!m.has(sub.slotId)) m.set(sub.slotId, []);
      m.get(sub.slotId).push(sub);
    }
    return m;
  }, [subs, teacher]);

  // 今日から+14日間の代行予定 (この teacher が元講師 or 代行者)
  const upcomingSubs = useMemo(() => {
    if (!subs?.length) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 14);
    return subs
      .filter((sub) => {
        if (sub.originalTeacher !== teacher && sub.substitute !== teacher) return false;
        const [y, m, d] = sub.date.split("-").map(Number);
        const dt = new Date(y, m - 1, d);
        return dt >= today && dt <= end;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [subs, teacher]);

  return (
    <div style={{ marginTop: 12 }}>
      <div
        className="no-print"
        style={{ display: "flex", gap: 6, marginBottom: 8, justifyContent: "flex-end" }}
      >
        <button
          type="button"
          onClick={() => exportTeacherIcs(teacher, slots)}
          style={{ ...S.btn(false), fontSize: 11 }}
          title="Google Calendar に取り込み可能な iCal ファイルをダウンロード"
        >
          📅 iCalエクスポート
        </button>
      </div>
      {upcomingSubs.length > 0 && (
        <div
          style={{
            background: "#fffbe6",
            border: "1px solid #f0d878",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: "#8a6a1a" }}>
            🔄 直近2週間の代行予定 ({upcomingSubs.length}件)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcomingSubs.map((sub) => {
              const slot = slots.find((s) => s.id === sub.slotId);
              const isOriginal = sub.originalTeacher === teacher;
              return (
                <div
                  key={sub.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "#fff",
                    padding: "6px 10px",
                    borderRadius: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, minWidth: 110 }}>
                    {fmtDateWeekday(sub.date)}
                  </span>
                  <span style={{ fontSize: 11, color: "#666", minWidth: 90 }}>
                    {slot?.time || "-"}
                  </span>
                  <span style={{ fontSize: 11 }}>
                    {slot
                      ? `${slot.grade}${slot.cls && slot.cls !== "-" ? slot.cls : ""} ${slot.subj}`
                      : "(削除済)"}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, marginLeft: "auto" }}>
                    <span style={{ color: isOriginal ? "#c03030" : "#888" }}>
                      {sub.originalTeacher}
                    </span>
                    <span style={{ margin: "0 4px", color: "#888" }}>→</span>
                    <span style={{ color: !isOriginal ? "#2a7a4a" : "#888" }}>
                      {sub.substitute || "未定"}
                    </span>
                  </span>
                  <StatusBadge status={sub.status} />
                  {isOriginal ? (
                    <span
                      style={{
                        fontSize: 9,
                        background: "#fde4e4",
                        color: "#c03030",
                        padding: "1px 6px",
                        borderRadius: 10,
                        fontWeight: 700,
                      }}
                    >
                      お願いする側
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 9,
                        background: "#e0f2e4",
                        color: "#2a7a4a",
                        padding: "1px 6px",
                        borderRadius: 10,
                        fontWeight: 700,
                      }}
                    >
                      代行する側
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6,1fr)",
            gap: 8,
            minWidth: 600,
          }}
        >
          {DAYS.map((d) => (
            <div key={d}>
              <div
                style={{
                  background: DC[d],
                  color: "#fff",
                  textAlign: "center",
                  padding: "7px 0",
                  borderRadius: "8px 8px 0 0",
                  fontWeight: 800,
                  fontSize: 14,
                  letterSpacing: 2,
                }}
              >
                {d}
              </div>
              <div
                style={{
                  background: DB[d],
                  borderRadius: "0 0 8px 8px",
                  padding: 6,
                  minHeight: 80,
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {byDay[d].length === 0 ? (
                  <div style={{ color: "#ccc", textAlign: "center", padding: 16, fontSize: 11 }}>
                    —
                  </div>
                ) : (
                  byDay[d].map((s) => {
                    const slotSubs = slotSubMap.get(s.id);
                    return (
                      <div key={s.id} style={{ position: "relative" }}>
                        <SlotCard slot={s} compact onEdit={isAdmin ? onEdit : undefined} onDel={isAdmin ? onDel : undefined} />
                        {slotSubs && slotSubs.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              marginTop: 2,
                            }}
                          >
                            {slotSubs.map((sub) => {
                              const st = SUB_STATUS[sub.status] || SUB_STATUS.requested;
                              const isOriginal = sub.originalTeacher === teacher;
                              return (
                                <div
                                  key={sub.id}
                                  style={{
                                    fontSize: 9,
                                    lineHeight: 1.3,
                                    padding: "2px 4px",
                                    borderRadius: 4,
                                    background: st.bg,
                                    borderLeft: `2px solid ${st.color}`,
                                    display: "flex",
                                    gap: 4,
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                  }}
                                  title={`${sub.date} ${isOriginal ? "代行依頼中" : "代行予定"}\n${sub.originalTeacher} → ${sub.substitute || "未定"}${sub.memo ? "\n" + sub.memo : ""}`}
                                >
                                  <span style={{ fontWeight: 700 }}>
                                    {sub.date.slice(5)}
                                  </span>
                                  <span style={{ color: st.color, fontWeight: 700 }}>
                                    {st.label}
                                  </span>
                                  <span style={{ color: "#666" }}>
                                    {isOriginal ? `→${sub.substitute || "?"}` : `←${sub.originalTeacher}`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
