import { useMemo, useState } from "react";
import { DAY_COLOR as DC, dateToDay, gradeColor as GC } from "../../../data";
import { S } from "../../../styles/common";
import { sortJa } from "../../../utils/sortJa";
import { getSlotTeachers } from "../../../utils/biweekly";

// 合同授業一覧タブ: adjustments の type==="combine" を月 / 講師でフィルタ表示。
// 1 行 = 1 件の合同 (host slot に複数の被吸収 slot を表示)。
// 削除は removeWithUndo (6 秒間 Undo 可能なトースト)。
export function JointClassListTab({ adjustments, slots, isAdmin, onDel }) {
  const now = new Date();
  const [fMonth, setFMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [fTeacher, setFTeacher] = useState("");

  const slotMap = useMemo(() => {
    const m = {};
    slots.forEach((s) => {
      m[s.id] = s;
    });
    return m;
  }, [slots]);

  const allTeachers = useMemo(() => {
    const set = new Set();
    slots.forEach((s) => {
      for (const t of getSlotTeachers(s)) set.add(t);
    });
    return sortJa([...set]);
  }, [slots]);

  const combines = useMemo(
    () => (adjustments || []).filter((a) => a.type === "combine"),
    [adjustments]
  );

  const filtered = useMemo(() => {
    let r = [...combines];
    if (fMonth) r = r.filter((a) => a.date?.startsWith(fMonth));
    if (fTeacher) {
      r = r.filter((a) => {
        const ids = [a.slotId, ...(a.combineSlotIds || [])];
        return ids.some((id) => {
          const slot = slotMap[id];
          return slot && getSlotTeachers(slot).includes(fTeacher);
        });
      });
    }
    return r.sort((a, b) => {
      const c = (a.date || "").localeCompare(b.date || "");
      if (c !== 0) return c;
      return (a.id || 0) - (b.id || 0);
    });
  }, [combines, fMonth, fTeacher, slotMap]);

  const SlotChip = ({ slot, fallback }) => {
    if (!slot) {
      return (
        <span style={{ color: "#bbb", fontSize: 11 }}>{fallback || "(削除済)"}</span>
      );
    }
    const gc = GC(slot.grade);
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 6px",
          borderRadius: 4,
          background: "#f0f4f8",
          fontSize: 11,
          fontWeight: 600,
          marginRight: 4,
          marginBottom: 2,
        }}
      >
        <span
          style={{
            background: gc.b,
            color: gc.f,
            borderRadius: 3,
            padding: "0 4px",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {slot.grade}
          {slot.cls && slot.cls !== "-" ? slot.cls : ""}
        </span>
        <span>{slot.subj}</span>
        <span style={{ color: "#666", fontWeight: 400 }}>{slot.teacher}</span>
      </span>
    );
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
          background: "#fff",
          padding: 12,
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          alignItems: "flex-end",
        }}
      >
        <div>
          <label
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            月
          </label>
          <input
            type="month"
            value={fMonth}
            onChange={(e) => setFMonth(e.target.value)}
            style={{ ...S.input, width: "auto" }}
          />
        </div>
        <div>
          <label
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            講師
          </label>
          <select
            value={fTeacher}
            onChange={(e) => setFTeacher(e.target.value)}
            style={{ ...S.input, width: "auto", minWidth: 110 }}
          >
            <option value="">すべて</option>
            {allTeachers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            setFMonth("");
            setFTeacher("");
          }}
          style={{ ...S.btn(false), fontSize: 11 }}
        >
          クリア
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
        {filtered.length} / {combines.length} 件表示
      </div>
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          overflow: "auto",
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{ textAlign: "center", color: "#bbb", padding: 40, fontSize: 13 }}
          >
            該当する合同授業はありません
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              minWidth: 760,
            }}
          >
            <thead>
              <tr style={{ background: "#1a1a2e", color: "#fff" }}>
                <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  日付
                </th>
                <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  時間
                </th>
                <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  受け側 (host)
                </th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>合同コマ</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>メモ</th>
                {isAdmin && (
                  <th style={{ padding: "8px 10px", textAlign: "center", width: 60 }}>
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((adj, i) => {
                const hostSlot = slotMap[adj.slotId];
                const dow = dateToDay(adj.date);
                const absorbedIds = adj.combineSlotIds || [];
                return (
                  <tr
                    key={adj.id}
                    style={{
                      background: i % 2 ? "#f8f9fa" : "#fff",
                      borderTop: "1px solid #eee",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        whiteSpace: "nowrap",
                        fontWeight: 700,
                      }}
                    >
                      {adj.date}
                      {dow && (
                        <span
                          style={{
                            marginLeft: 4,
                            fontSize: 10,
                            color: DC[dow],
                            fontWeight: 700,
                          }}
                        >
                          ({dow})
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {hostSlot?.time || "-"}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <SlotChip slot={hostSlot} fallback="(host削除済)" />
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {absorbedIds.length === 0 ? (
                        <span style={{ color: "#bbb" }}>-</span>
                      ) : (
                        absorbedIds.map((id) => (
                          <SlotChip key={id} slot={slotMap[id]} />
                        ))
                      )}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontSize: 11,
                        color: "#666",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={adj.memo}
                    >
                      {adj.memo}
                    </td>
                    {isAdmin && (
                      <td
                        style={{
                          padding: "8px 10px",
                          textAlign: "center",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onDel(adj.id)}
                          aria-label={`${adj.date} の合同授業を削除`}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 13,
                            padding: 2,
                          }}
                        >
                          🗑
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
