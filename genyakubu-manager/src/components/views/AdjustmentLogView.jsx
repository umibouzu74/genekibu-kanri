import { useMemo, useState } from "react";
import { ADJ_COLOR, dateToDay, DAY_COLOR as DC, SUB_STATUS, fmtDate } from "../../data";
import { S } from "../../styles/common";

// ─── 調整履歴 (代行 / 合同授業 / コマ移動) 日付別タイムライン ────────
// 代行(subs) と 合同・移動(adjustments) を日付でまとめて時系列に表示する。
// 月切替と種別フィルタで絞り込める。

const TYPE_META = {
  sub: { label: "代行", icon: "🔄", color: "#2a6a9e" },
  combine: { label: "合同", icon: "🔗", color: ADJ_COLOR.combine.color },
  move: { label: "移動", icon: "↔", color: ADJ_COLOR.move.color },
};

function yearMonthOf(ds) {
  return ds.slice(0, 7); // "YYYY-MM"
}

function slotDescribe(slot) {
  if (!slot) return "(不明コマ)";
  const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
  return `${slot.grade}${cls} ${slot.subj}${slot.room ? ` @${slot.room}` : ""}`;
}

export function AdjustmentLogView({ slots, subs, adjustments }) {
  const slotById = useMemo(() => {
    const m = new Map();
    for (const s of slots || []) m.set(s.id, s);
    return m;
  }, [slots]);

  // 利用可能な YYYY-MM 一覧
  const months = useMemo(() => {
    const set = new Set();
    for (const r of subs || []) if (r.date) set.add(yearMonthOf(r.date));
    for (const r of adjustments || []) if (r.date) set.add(yearMonthOf(r.date));
    const arr = [...set].sort();
    arr.reverse();
    return arr;
  }, [subs, adjustments]);

  const currentMonth = fmtDate(new Date()).slice(0, 7);
  const [monthFilter, setMonthFilter] = useState(() =>
    months.includes(currentMonth) ? currentMonth : months[0] || currentMonth
  );
  const [showSub, setShowSub] = useState(true);
  const [showCombine, setShowCombine] = useState(true);
  const [showMove, setShowMove] = useState(true);

  // 各イベントを { date, kind, payload, time } に正規化
  const events = useMemo(() => {
    const out = [];
    if (showSub) {
      for (const sub of subs || []) {
        if (!sub?.date) continue;
        if (monthFilter && yearMonthOf(sub.date) !== monthFilter) continue;
        const slot = slotById.get(sub.slotId);
        out.push({
          kind: "sub",
          date: sub.date,
          time: slot?.time || "",
          id: `sub-${sub.id}`,
          sub,
          slot,
        });
      }
    }
    for (const adj of adjustments || []) {
      if (!adj?.date) continue;
      if (monthFilter && yearMonthOf(adj.date) !== monthFilter) continue;
      if (adj.type === "combine" && !showCombine) continue;
      if (adj.type === "move" && !showMove) continue;
      const slot = slotById.get(adj.slotId);
      out.push({
        kind: adj.type,
        date: adj.date,
        time: slot?.time || "",
        id: `adj-${adj.id}`,
        adj,
        slot,
      });
    }
    return out;
  }, [subs, adjustments, slotById, monthFilter, showSub, showCombine, showMove]);

  // 日付別グルーピング (新しい日付が上)
  const groups = useMemo(() => {
    const byDate = new Map();
    for (const ev of events) {
      const arr = byDate.get(ev.date) || [];
      arr.push(ev);
      byDate.set(ev.date, arr);
    }
    const dates = [...byDate.keys()].sort().reverse();
    return dates.map((date) => {
      const list = byDate.get(date);
      list.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      return { date, events: list };
    });
  }, [events]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* フィルタ UI */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          background: "#fff",
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
        }}
      >
        <label style={{ fontSize: 12, fontWeight: 700 }}>月:</label>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          style={{ ...S.input, width: "auto", padding: "6px 10px" }}
        >
          {months.length === 0 && (
            <option value={currentMonth}>{currentMonth}</option>
          )}
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "#666", marginLeft: 8 }}>種別:</span>
        {[
          { key: "sub", state: showSub, set: setShowSub },
          { key: "combine", state: showCombine, set: setShowCombine },
          { key: "move", state: showMove, set: setShowMove },
        ].map(({ key, state, set }) => {
          const meta = TYPE_META[key];
          return (
            <label
              key={key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 14,
                border: `1px solid ${state ? meta.color : "#ccc"}`,
                background: state ? `${meta.color}15` : "#f5f5f5",
                color: state ? meta.color : "#888",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              <input
                type="checkbox"
                checked={state}
                onChange={(e) => set(e.target.checked)}
                style={{ margin: 0 }}
              />
              {meta.icon} {meta.label}
            </label>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>
          {events.length} 件
        </span>
      </div>

      {/* タイムライン */}
      {groups.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "#888",
            padding: 30,
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
            fontSize: 13,
          }}
        >
          調整履歴はありません
        </div>
      ) : (
        groups.map((g) => {
          const dow = dateToDay(g.date);
          return (
            <div
              key={g.date}
              style={{
                background: "#fff",
                borderRadius: 8,
                border: "1px solid #e0e0e0",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 14px",
                  background: "#f5f5f8",
                  borderBottom: "1px solid #e0e0e0",
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 14 }}>{g.date}</span>
                {dow && (
                  <span
                    style={{
                      background: DC[dow] || "#666",
                      color: "#fff",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontWeight: 800,
                      fontSize: 11,
                    }}
                  >
                    {dow}
                  </span>
                )}
                <span style={{ fontSize: 11, color: "#888" }}>
                  {g.events.length} 件
                </span>
              </div>
              <div style={{ padding: "6px 0" }}>
                {g.events.map((ev) => (
                  <EventRow key={ev.id} ev={ev} slotById={slotById} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function EventRow({ ev, slotById }) {
  const meta = TYPE_META[ev.kind];
  const slotLabel = slotDescribe(ev.slot);

  let body = null;
  if (ev.kind === "sub") {
    const st = SUB_STATUS[ev.sub.status] || SUB_STATUS.requested;
    body = (
      <>
        <span style={{ color: "#333" }}>
          {ev.sub.originalTeacher || "?"} → {ev.sub.substitute || "未定"}
        </span>
        <span
          style={{
            background: st.color,
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 3,
            marginLeft: 6,
          }}
        >
          {st.label}
        </span>
        {ev.sub.memo && (
          <span style={{ marginLeft: 8, color: "#888", fontSize: 12 }}>
            {ev.sub.memo}
          </span>
        )}
      </>
    );
  } else if (ev.kind === "combine") {
    const absorbed = (ev.adj.combineSlotIds || []).map((id) =>
      slotDescribe(slotById.get(id))
    );
    body = (
      <>
        <span style={{ color: "#333" }}>
          <strong>{slotLabel}</strong>
          {absorbed.length > 0 && (
            <span style={{ color: "#888" }}> + {absorbed.join(" / ")}</span>
          )}
        </span>
        {ev.adj.memo && (
          <span style={{ marginLeft: 8, color: "#888", fontSize: 12 }}>
            {ev.adj.memo}
          </span>
        )}
      </>
    );
  } else if (ev.kind === "move") {
    body = (
      <>
        <span style={{ color: "#333" }}>
          <strong>{slotLabel}</strong>
        </span>
        <span style={{ marginLeft: 6, color: "#666" }}>
          {ev.slot?.time || "?"} → <strong>{ev.adj.targetTime}</strong>
        </span>
      </>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 14px",
        fontSize: 13,
        borderLeft: `3px solid ${meta.color}`,
        marginLeft: 8,
      }}
    >
      <span
        style={{
          background: `${meta.color}18`,
          color: meta.color,
          padding: "2px 8px",
          borderRadius: 3,
          fontWeight: 700,
          fontSize: 11,
          minWidth: 52,
          textAlign: "center",
        }}
      >
        {meta.icon} {meta.label}
      </span>
      {ev.slot?.time && (
        <span style={{ color: "#666", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
          {ev.slot.time}
        </span>
      )}
      <span style={{ flex: 1 }}>
        {ev.kind !== "sub" ? null : (
          <span style={{ color: "#888", marginRight: 6 }}>{slotLabel}</span>
        )}
        {body}
      </span>
    </div>
  );
}
