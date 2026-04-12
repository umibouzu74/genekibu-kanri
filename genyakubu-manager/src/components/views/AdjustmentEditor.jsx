import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DAY_COLOR as DC,
  dateToDay,
  fmtDate,
  gradeColor as GC,
  timeToMin,
} from "../../data";
import { S } from "../../styles/common";
import { formatBiweeklyTeacher } from "../../utils/biweekly";

// ─── Context Menu ────────────────────────────────────────────────
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: 6,
        boxShadow: "0 4px 16px rgba(0,0,0,.18)",
        zIndex: 2000,
        minWidth: 160,
        padding: "4px 0",
        fontSize: 13,
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            item.onClick();
            onClose();
          }}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "8px 14px",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: 13,
            color: item.danger ? "#c44" : "#333",
          }}
          onMouseEnter={(e) => (e.target.style.background = "#f0f0f0")}
          onMouseLeave={(e) => (e.target.style.background = "none")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ─── Slot Card (draggable) ───────────────────────────────────────
function SlotCard({ slot, isAdjusted, adjustLabel, onContextMenu, isAdmin }) {
  const gc = GC(slot.grade);

  const handleDragStart = (e) => {
    if (!isAdmin) return;
    e.dataTransfer.setData("text/plain", String(slot.id));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable={isAdmin}
      onDragStart={handleDragStart}
      onContextMenu={onContextMenu}
      style={{
        background: isAdjusted ? "#fff8e0" : "#fff",
        border: isAdjusted ? "2px solid #e0a020" : "1px solid #ddd",
        borderRadius: 6,
        padding: "6px 8px",
        cursor: isAdmin ? "grab" : "default",
        minWidth: 140,
        position: "relative",
      }}
    >
      {adjustLabel && (
        <div
          style={{
            position: "absolute",
            top: -8,
            right: 4,
            background: "#e0a020",
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 3,
          }}
        >
          {adjustLabel}
        </div>
      )}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            background: gc.b,
            color: gc.f,
            borderRadius: 3,
            padding: "1px 4px",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {slot.grade}
          {slot.cls && slot.cls !== "-" ? slot.cls : ""}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{slot.subj}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2, color: "#1a1a2e" }}>
        {formatBiweeklyTeacher(slot.teacher, slot.note)}
      </div>
      {slot.room && (
        <div style={{ fontSize: 11, color: "#888" }}>{slot.room}</div>
      )}
    </div>
  );
}

// ─── Time Row (drop target) ─────────────────────────────────────
function TimeRow({ time, slots, children, onDrop, isAdmin }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const slotId = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (!isNaN(slotId)) onDrop(slotId, time);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        padding: "8px 0",
        borderBottom: "1px solid #eee",
        background: dragOver ? "#e8f4ff" : "transparent",
        borderRadius: dragOver ? 6 : 0,
        transition: "background .15s",
        minHeight: 50,
      }}
    >
      <div
        style={{
          width: 90,
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 700,
          color: "#555",
          paddingTop: 6,
        }}
      >
        {time}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          minHeight: 36,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Main Editor ─────────────────────────────────────────────────
export function AdjustmentEditor({
  slots,
  adjustments,
  onAddAdjustment,
  onDelAdjustment,
  isAdmin,
}) {
  const [date, setDate] = useState(fmtDate(new Date()));
  const [ctxMenu, setCtxMenu] = useState(null);
  const [combineSource, setCombineSource] = useState(null);

  const dayName = useMemo(() => dateToDay(date), [date]);

  // Slots for the selected day
  const daySlots = useMemo(() => {
    if (!dayName) return [];
    return slots.filter((s) => s.day === dayName);
  }, [slots, dayName]);

  // Adjustments for the selected date
  const dateAdj = useMemo(
    () => adjustments.filter((a) => a.date === date),
    [adjustments, date]
  );

  // Build an adjusted view of slots: apply moves and combines
  const adjustedSlots = useMemo(() => {
    const moved = new Map(); // slotId -> targetTime
    const combined = new Map(); // slotId -> parent slotId
    for (const a of dateAdj) {
      if (a.type === "move" && a.targetTime) {
        moved.set(a.slotId, a.targetTime);
      }
      if (a.type === "combine" && a.combineSlotIds) {
        for (const cid of a.combineSlotIds) {
          combined.set(cid, a.slotId);
        }
      }
    }
    return daySlots.map((s) => ({
      ...s,
      time: moved.has(s.id) ? moved.get(s.id) : s.time,
      _moved: moved.has(s.id),
      _combinedInto: combined.get(s.id) ?? null,
      _isCombineParent: dateAdj.some(
        (a) => a.type === "combine" && a.slotId === s.id
      ),
    }));
  }, [daySlots, dateAdj]);

  // Group adjusted slots by time
  const timeGroups = useMemo(() => {
    const groups = {};
    for (const s of adjustedSlots) {
      if (s._combinedInto != null) continue; // hide merged children
      if (!groups[s.time]) groups[s.time] = [];
      groups[s.time].push(s);
    }
    return Object.entries(groups).sort(
      ([a], [b]) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
    );
  }, [adjustedSlots]);

  // All unique times for drop targets (including empty ones)
  const allTimes = useMemo(() => {
    const ts = new Set();
    for (const s of daySlots) ts.add(s.time);
    for (const a of dateAdj) {
      if (a.targetTime) ts.add(a.targetTime);
    }
    return [...ts].sort(
      (a, b) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
    );
  }, [daySlots, dateAdj]);

  // Handle drop: create a "move" adjustment
  const handleDrop = useCallback(
    (slotId, targetTime) => {
      const slot = daySlots.find((s) => s.id === slotId);
      if (!slot) return;
      // Don't create adjustment if dropped on same time
      if (slot.time === targetTime) return;
      // Check if there's already a move for this slot on this date
      const existing = dateAdj.find(
        (a) => a.type === "move" && a.slotId === slotId
      );
      if (existing) {
        // If moving back to original, delete the adjustment
        if (slot.time === targetTime) {
          onDelAdjustment(existing.id);
        }
        return;
      }
      onAddAdjustment({
        date,
        type: "move",
        slotId,
        targetTime,
        memo: `${slot.time} → ${targetTime}`,
      });
    },
    [date, daySlots, dateAdj, onAddAdjustment, onDelAdjustment]
  );

  // Context menu handler
  const handleSlotContext = useCallback(
    (e, slot) => {
      if (!isAdmin) return;
      e.preventDefault();
      const items = [];

      // Combine option
      if (!combineSource) {
        items.push({
          label: "合同にする（相手を選択）",
          onClick: () => setCombineSource(slot),
        });
      }

      // If this slot has adjustments, show delete option
      const adj = dateAdj.filter(
        (a) =>
          a.slotId === slot.id ||
          (a.combineSlotIds && a.combineSlotIds.includes(slot.id))
      );
      for (const a of adj) {
        items.push({
          label:
            a.type === "move"
              ? `移動を取り消す (${a.memo})`
              : `合同を取り消す`,
          danger: true,
          onClick: () => onDelAdjustment(a.id),
        });
      }

      if (items.length > 0) {
        setCtxMenu({ x: e.clientX, y: e.clientY, items });
      }
    },
    [isAdmin, combineSource, dateAdj, onDelAdjustment]
  );

  // Combine: when in combine mode, clicking a slot creates combine adjustment
  const handleSlotClick = useCallback(
    (slot) => {
      if (!combineSource || !isAdmin) return;
      if (slot.id === combineSource.id) {
        setCombineSource(null);
        return;
      }
      onAddAdjustment({
        date,
        type: "combine",
        slotId: combineSource.id,
        combineSlotIds: [slot.id],
        memo: `${combineSource.grade}${combineSource.cls} + ${slot.grade}${slot.cls}`,
      });
      setCombineSource(null);
    },
    [combineSource, isAdmin, date, onAddAdjustment]
  );

  const dayColor = dayName ? DC[dayName] || "#666" : "#ccc";

  return (
    <div>
      {/* Date picker + info */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <label style={{ fontSize: 12, fontWeight: 700 }}>対象日:</label>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setCombineSource(null);
          }}
          style={{ ...S.input, width: "auto" }}
        />
        {dayName && (
          <span
            style={{
              background: dayColor,
              color: "#fff",
              padding: "4px 12px",
              borderRadius: 6,
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            {dayName}曜日
          </span>
        )}
        {dateAdj.length > 0 && (
          <span style={{ fontSize: 12, color: "#e0a020", fontWeight: 700 }}>
            {dateAdj.length}件の調整あり
          </span>
        )}
      </div>

      {/* Combine mode banner */}
      {combineSource && (
        <div
          style={{
            background: "#fff3cd",
            border: "1px solid #ffc107",
            borderRadius: 6,
            padding: "8px 14px",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 13,
          }}
        >
          <span>
            <strong>{combineSource.grade}{combineSource.cls} {combineSource.subj}</strong>{" "}
            と合同にするコマをクリックしてください
          </span>
          <button
            type="button"
            onClick={() => setCombineSource(null)}
            style={{ ...S.btn(false), fontSize: 11 }}
          >
            キャンセル
          </button>
        </div>
      )}

      {!dayName ? (
        <div
          style={{
            textAlign: "center",
            color: "#888",
            padding: 40,
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
          }}
        >
          日曜日は授業がありません
        </div>
      ) : daySlots.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "#888",
            padding: 40,
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
          }}
        >
          この日のコマがありません
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#888",
              marginBottom: 8,
            }}
          >
            {isAdmin
              ? "コマをドラッグして時間帯を変更 / 右クリックで合同設定"
              : "時間割調整の閲覧モード"}
          </div>
          {allTimes.map((time) => {
            const groupSlots = timeGroups.find(([t]) => t === time)?.[1] || [];
            return (
              <TimeRow
                key={time}
                time={time}
                slots={groupSlots}
                onDrop={handleDrop}
                isAdmin={isAdmin}
              >
                {groupSlots.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => handleSlotClick(s)}
                    style={{
                      cursor: combineSource ? "pointer" : undefined,
                      outline:
                        combineSource && s.id !== combineSource.id
                          ? "2px dashed #ffc107"
                          : "none",
                      borderRadius: 6,
                    }}
                  >
                    <SlotCard
                      slot={s}
                      isAdjusted={s._moved || s._isCombineParent}
                      adjustLabel={
                        s._moved
                          ? "移動"
                          : s._isCombineParent
                            ? "合同"
                            : null
                      }
                      onContextMenu={(e) => handleSlotContext(e, s)}
                      isAdmin={isAdmin}
                    />
                  </div>
                ))}
              </TimeRow>
            );
          })}
        </div>
      )}

      {/* List of adjustments for this date */}
      {dateAdj.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            この日の調整一覧
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              background: "#fff",
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid #e0e0e0",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid #eee", background: "#fafafa" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>種別</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>内容</th>
                {isAdmin && (
                  <th style={{ textAlign: "center", padding: "6px 8px", width: 40 }}>
                    削除
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {dateAdj.map((a) => {
                const slot = slots.find((s) => s.id === a.slotId);
                return (
                  <tr key={a.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <span
                        style={{
                          background:
                            a.type === "move" ? "#2e6a9e" : "#9e8a2e",
                          color: "#fff",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {a.type === "move" ? "移動" : "合同"}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {slot
                        ? `${slot.grade}${slot.cls} ${slot.subj} (${slot.teacher})`
                        : `コマID: ${a.slotId}`}
                      {a.memo && (
                        <span style={{ color: "#888", marginLeft: 6 }}>
                          - {a.memo}
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => onDelAdjustment(a.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 12,
                            color: "#c05030",
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
