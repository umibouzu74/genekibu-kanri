import { useMemo, useState } from "react";
import { DAY_COLOR as DC, dateToDay, gradeColor as GC } from "../../../data";
import { S } from "../../../styles/common";
import { sortJa } from "../../../utils/sortJa";
import { getSlotTeachers } from "../../../utils/biweekly";
import { fmtIsoLocal } from "../../../utils/dateHelpers";

// 時間割調整一覧タブ: adjustments (合同 / 移動 / 振替) を月 / 講師 / 種別で
// フィルタ表示。1 行 = 1 件の調整。削除は removeWithUndo。
// 「📅」ボタンで該当日の欠勤振替画面に遷移する。

const TYPE_META = {
  combine: { label: "合同授業", bg: "#e6f4ea", fg: "#1e6f3a" },
  move: { label: "コマ移動", bg: "#e8eef9", fg: "#2a4a8a" },
  reschedule: { label: "別日振替", bg: "#fdecea", fg: "#a52a2a" },
};

function SlotChip({ slot, fallback }) {
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
}

function detailFor(adj, slotMap) {
  if (adj.type === "combine") {
    const ids = adj.combineSlotIds || [];
    if (ids.length === 0) return <span style={{ color: "#bbb" }}>-</span>;
    return (
      <div>
        <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>合同コマ:</div>
        {ids.map((id) => (
          <SlotChip key={id} slot={slotMap[id]} />
        ))}
      </div>
    );
  }
  if (adj.type === "move") {
    return (
      <span>
        <span style={{ color: "#666", fontSize: 11 }}>移動先: </span>
        <span style={{ fontWeight: 700 }}>{adj.targetTime || "-"}</span>
      </span>
    );
  }
  if (adj.type === "reschedule") {
    const dow = adj.targetDate ? dateToDay(adj.targetDate) : null;
    return (
      <span>
        <span style={{ color: "#666", fontSize: 11 }}>振替先: </span>
        <span style={{ fontWeight: 700 }}>{adj.targetDate || "-"}</span>
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
        {adj.targetTime && (
          <span style={{ marginLeft: 6, color: "#666", fontSize: 11 }}>
            {adj.targetTime}
          </span>
        )}
        {adj.targetTeacher && (
          <span style={{ marginLeft: 6, color: "#2a7a4a", fontSize: 11 }}>
            → {adj.targetTeacher}
          </span>
        )}
      </span>
    );
  }
  return null;
}

export function AdjustmentListTab({
  adjustments,
  slots,
  isAdmin,
  onDel,
  onJumpToDate,
}) {
  const now = new Date();
  const [fMonth, setFMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [fTeacher, setFTeacher] = useState("");
  const [fType, setFType] = useState("");
  // sortBy: "date" (源泉日昇順) / "createdAt-desc" (作成日時 新→古)
  const [sortBy, setSortBy] = useState("date");

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

  const filtered = useMemo(() => {
    let r = (adjustments || []).filter((a) => TYPE_META[a.type]);
    if (fType) r = r.filter((a) => a.type === fType);
    if (fMonth) {
      r = r.filter((a) => {
        if (a.date?.startsWith(fMonth)) return true;
        if (a.type === "reschedule" && a.targetDate?.startsWith(fMonth)) return true;
        return false;
      });
    }
    if (fTeacher) {
      r = r.filter((a) => {
        const ids = [a.slotId, ...(a.combineSlotIds || [])];
        const hit = ids.some((id) => {
          const slot = slotMap[id];
          return slot && getSlotTeachers(slot).includes(fTeacher);
        });
        if (hit) return true;
        if (a.type === "reschedule" && a.targetTeacher === fTeacher) return true;
        return false;
      });
    }
    return r.sort((a, b) => {
      if (sortBy === "createdAt-desc") {
        // createdAt 新→古。同値時は id 降順 (新しいレコードを上)。
        const ac = a.createdAt || "";
        const bc = b.createdAt || "";
        const c = bc.localeCompare(ac);
        if (c !== 0) return c;
        return (b.id || 0) - (a.id || 0);
      }
      const c = (a.date || "").localeCompare(b.date || "");
      if (c !== 0) return c;
      return (a.id || 0) - (b.id || 0);
    });
  }, [adjustments, fMonth, fTeacher, fType, slotMap, sortBy]);

  const totalCount = useMemo(
    () => (adjustments || []).filter((a) => TYPE_META[a.type]).length,
    [adjustments]
  );

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
            htmlFor="adj-list-filter-month"
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            月
          </label>
          <input
            id="adj-list-filter-month"
            type="month"
            value={fMonth}
            onChange={(e) => setFMonth(e.target.value)}
            style={{ ...S.input, width: "auto" }}
          />
        </div>
        <div>
          <label
            htmlFor="adj-list-filter-teacher"
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            講師
          </label>
          <select
            id="adj-list-filter-teacher"
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
        <div>
          <label
            htmlFor="adj-list-filter-type"
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            種別
          </label>
          <select
            id="adj-list-filter-type"
            value={fType}
            onChange={(e) => setFType(e.target.value)}
            style={{ ...S.input, width: "auto", minWidth: 100 }}
          >
            <option value="">すべて</option>
            <option value="combine">合同授業</option>
            <option value="move">コマ移動</option>
            <option value="reschedule">別日振替</option>
          </select>
        </div>
        <button
          onClick={() => {
            setFMonth("");
            setFTeacher("");
            setFType("");
          }}
          style={{ ...S.btn(false), fontSize: 11 }}
        >
          クリア
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
        {filtered.length} / {totalCount} 件表示
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
            該当する時間割調整はありません
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              minWidth: 880,
            }}
          >
            <thead>
              <tr style={{ background: "#1a1a2e", color: "#fff" }}>
                <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  日付
                </th>
                <th style={{ padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                  種別
                </th>
                <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  対象コマ
                </th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>詳細</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>メモ</th>
                <th
                  style={{
                    padding: "8px 10px",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                  onClick={() =>
                    setSortBy((s) =>
                      s === "createdAt-desc" ? "date" : "createdAt-desc"
                    )
                  }
                  title="クリックで作成日時の新しい順 / 源泉日昇順 を切り替え"
                >
                  作成日時{" "}
                  <span className="no-print" aria-hidden="true">
                    {sortBy === "createdAt-desc" ? "↓" : "↕"}
                  </span>
                </th>
                {isAdmin && (
                  <th
                    className="no-print"
                    style={{ padding: "8px 10px", textAlign: "center", width: 80 }}
                  >
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((adj, i) => {
                const slot = slotMap[adj.slotId];
                const dow = dateToDay(adj.date);
                const meta = TYPE_META[adj.type];
                // 月フィルタが reschedule の targetDate 側でヒットした場合、
                // 「源泉日: YYYY-MM-DD だけど振替先が表示月」と一目で分かるよう
                // targetDate にも小さな "★" バッジを付ける。
                const matchedViaTargetDate =
                  Boolean(fMonth) &&
                  adj.type === "reschedule" &&
                  !adj.date?.startsWith(fMonth) &&
                  Boolean(adj.targetDate?.startsWith(fMonth));
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
                      {matchedViaTargetDate && (
                        <span
                          title="月フィルタは振替先の日付でヒットしています"
                          style={{
                            marginLeft: 4,
                            fontSize: 9,
                            color: "#a65a00",
                            background: "#fff3e0",
                            padding: "1px 4px",
                            borderRadius: 3,
                            fontWeight: 700,
                            verticalAlign: "middle",
                          }}
                        >
                          振替先一致
                        </span>
                      )}
                      {slot?.time && (
                        <div style={{ fontSize: 10, color: "#888", fontWeight: 400 }}>
                          {slot.time}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <span
                        style={{
                          background: meta.bg,
                          color: meta.fg,
                          borderRadius: 4,
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <SlotChip slot={slot} />
                    </td>
                    <td style={{ padding: "8px 10px" }}>{detailFor(adj, slotMap)}</td>
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
                      {adj.memo || <span style={{ color: "#ccc" }}>-</span>}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontSize: 10,
                        color: "#999",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtIsoLocal(adj.createdAt)}
                    </td>
                    {isAdmin && (
                      <td
                        className="no-print"
                        style={{
                          padding: "8px 10px",
                          textAlign: "center",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {onJumpToDate && adj.date && (
                          <button
                            type="button"
                            onClick={() => onJumpToDate(adj.date)}
                            aria-label={`${adj.date} の欠勤振替画面を開く`}
                            title="この日の欠勤振替画面を開く"
                            style={{ ...S.iconBtn, marginRight: 2 }}
                          >
                            📅
                          </button>
                        )}
                        {onJumpToDate &&
                          adj.type === "reschedule" &&
                          adj.targetDate && (
                            <button
                              type="button"
                              onClick={() => onJumpToDate(adj.targetDate)}
                              aria-label={`振替先 ${adj.targetDate} の欠勤振替画面を開く`}
                              title="振替先の欠勤振替画面を開く"
                              style={{ ...S.iconBtn, fontSize: 12, marginRight: 2 }}
                            >
                              📅→
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => onDel(adj.id)}
                          aria-label={`${adj.date} の${meta.label}を削除`}
                          style={S.iconBtn}
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
