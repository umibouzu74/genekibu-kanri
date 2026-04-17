import { useMemo } from "react";
import { fmtDate, SUB_STATUS, WEEKDAYS } from "../../../data";

// ─── 代行サマリーカード ─────────────────────────────────────────────
// 今日・明日の代行予定と全体の依頼中件数を一目で把握できるウィジェット。
export function SubSummaryCards({ subs, slots, todayStr }) {
  const summary = useMemo(() => {
    if (!subs || subs.length === 0) return null;

    const tomorrow = new Date(todayStr + "T12:00:00");
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = fmtDate(tomorrow);
    const tomorrowDow = WEEKDAYS[tomorrow.getDay()];

    const todayDow = (() => {
      const d = new Date(todayStr + "T12:00:00");
      return WEEKDAYS[d.getDay()];
    })();

    const todaySubs = subs.filter((s) => s.date === todayStr);
    const tomorrowSubs = subs.filter((s) => s.date === tomorrowStr);
    const pendingAll = subs.filter((s) => s.status === "requested");

    // 今後 7 日の代行件数
    const weekAhead = [];
    const base = new Date(todayStr + "T12:00:00");
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      weekAhead.push(fmtDate(d));
    }
    const weekSubs = subs.filter((s) => weekAhead.includes(s.date));

    return {
      todaySubs,
      todayDow,
      tomorrowSubs,
      tomorrowDow,
      pendingAll,
      weekSubs,
    };
  }, [subs, todayStr]);

  if (!summary) return null;

  const { todaySubs, todayDow, tomorrowSubs, tomorrowDow, pendingAll, weekSubs } =
    summary;

  // 何も無ければ表示しない
  if (todaySubs.length === 0 && tomorrowSubs.length === 0 && pendingAll.length === 0) {
    return null;
  }

  const Card = ({ label, count, color, bg, detail, children }) => (
    <div
      style={{
        background: bg,
        borderRadius: 10,
        padding: "10px 14px",
        border: `1px solid ${color}30`,
        minWidth: 130,
        flex: "1 1 130px",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>
        {count}
        <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 4 }}>件</span>
      </div>
      {detail && (
        <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>{detail}</div>
      )}
      {children}
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      {/* 今日の代行 */}
      <Card
        label={`今日 (${todayDow}) の代行`}
        count={todaySubs.length}
        color={todaySubs.length > 0 ? "#2e6a9e" : "#888"}
        bg={todaySubs.length > 0 ? "#e8f0fa" : "#f8f8f8"}
        detail={
          todaySubs.length > 0
            ? `確定: ${todaySubs.filter((s) => s.status === "confirmed").length} / 依頼中: ${todaySubs.filter((s) => s.status === "requested").length}`
            : null
        }
      >
        {todaySubs.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            {todaySubs.slice(0, 3).map((s) => {
              const slot = slots.find((sl) => sl.id === s.slotId);
              const st = SUB_STATUS[s.status] || SUB_STATUS.requested;
              return (
                <div
                  key={s.id}
                  style={{
                    fontSize: 10,
                    lineHeight: 1.3,
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      background: st.color,
                      color: "#fff",
                      padding: "0 3px",
                      borderRadius: 2,
                      fontSize: 8,
                      fontWeight: 800,
                    }}
                  >
                    {st.label}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {slot?.time?.split("-")[0] || "?"} {slot?.subj || "?"}
                  </span>
                  <span style={{ color: "#888" }}>
                    {s.originalTeacher}→{s.substitute || "?"}
                  </span>
                </div>
              );
            })}
            {todaySubs.length > 3 && (
              <div style={{ fontSize: 9, color: "#888" }}>
                他 {todaySubs.length - 3} 件
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 明日の代行 */}
      <Card
        label={`明日 (${tomorrowDow}) の代行`}
        count={tomorrowSubs.length}
        color={tomorrowSubs.length > 0 ? "#6a3d8e" : "#888"}
        bg={tomorrowSubs.length > 0 ? "#f0e8f6" : "#f8f8f8"}
        detail={
          tomorrowSubs.length > 0
            ? `確定: ${tomorrowSubs.filter((s) => s.status === "confirmed").length} / 依頼中: ${tomorrowSubs.filter((s) => s.status === "requested").length}`
            : null
        }
      />

      {/* 依頼中（全体） */}
      {pendingAll.length > 0 && (
        <Card
          label="依頼中（未確定）"
          count={pendingAll.length}
          color="#c03030"
          bg="#fde8e8"
          detail={`今後7日間の代行: ${weekSubs.length}件`}
        />
      )}
    </div>
  );
}
