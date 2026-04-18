import { useMemo, useState } from "react";
import { timeToMin } from "../../../data";
import { formatCount, weightedSlotCount } from "../../../utils/biweekly";

// 欠勤組み換え用の部署カラム。
// SectionColumn (Dashboard 用) の fork。
// 各時間行はドロップターゲットで、ドロップ時に onTimeDrop(slotId, time) を発火。
// 個々のカード描画は親の renderCard(slot) に委譲する (draft 状態は親に集約)。
//
// props:
//   label, color, sl          - ヘッダ/見た目/対象スロット (effective _time 付き想定)
//   renderCard(slot)          - スロットカードを描画する関数
//   onTimeDrop(slotId, time)  - 時間行にドロップされたとき呼ばれる
export function AbsenceSectionColumn({
  label,
  color,
  sl,
  renderCard,
  onTimeDrop,
}) {
  const timeGroups = useMemo(() => {
    const byTime = {};
    sl.forEach((s) => {
      const t = s._time || s.time;
      if (!byTime[t]) byTime[t] = [];
      byTime[t].push(s);
    });
    return Object.entries(byTime).sort(
      ([a], [b]) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
    );
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
        {sl.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>
            {formatCount(weightedSlotCount(sl))}コマ
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
        {sl.length === 0 ? (
          <div
            style={{ textAlign: "center", color: "#bbb", padding: 20, fontSize: 13 }}
          >
            授業なし
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {timeGroups.map(([time, tSlots]) => (
              <TimeDropRow
                key={time}
                time={time}
                accentColor={color.accent}
                labelColor={color.f}
                onDrop={(slotId) => onTimeDrop(slotId, time)}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
                    gap: 6,
                  }}
                >
                  {tSlots.map((s) => renderCard(s))}
                </div>
              </TimeDropRow>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TimeDropRow({ time, accentColor, labelColor, children, onDrop }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const slotId = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (!Number.isNaN(slotId)) onDrop(slotId);
      }}
      style={{
        background: dragOver ? "#e8f4ff" : "transparent",
        borderRadius: 6,
        padding: dragOver ? 4 : 0,
        transition: "background .15s, padding .15s",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: labelColor,
          marginBottom: 4,
          paddingBottom: 3,
          borderBottom: `2px solid ${accentColor}`,
        }}
      >
        {time}
      </div>
      {children}
    </div>
  );
}
