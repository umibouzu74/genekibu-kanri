import { useMemo, useState } from "react";
import { DAY_COLOR as DC, dateToDay, gradeColor as GC } from "../../../data";
import { S } from "../../../styles/common";
import { sortJa } from "../../../utils/sortJa";
import { getSlotTeachers } from "../../../utils/biweekly";
import { fmtIsoLocal } from "../../../utils/dateHelpers";

// 回数補正一覧タブ: sessionOverrides を月 / 講師 / モードでフィルタして表示。
// 削除は removeWithUndo (6 秒間 Undo 可能なトースト)。
// 「📅」ボタンで該当日の欠勤振替画面に遷移する。
export function OverrideListTab({
  sessionOverrides,
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
  const [fMode, setFMode] = useState("");
  // sortBy: "date" (補正対象日昇順) / "createdAt-desc" (作成日時 新→古)
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
    let r = [...sessionOverrides];
    if (fMonth) r = r.filter((o) => o.date?.startsWith(fMonth));
    if (fTeacher) {
      r = r.filter((o) => {
        const slot = slotMap[o.slotId];
        return slot && getSlotTeachers(slot).includes(fTeacher);
      });
    }
    if (fMode) r = r.filter((o) => o.mode === fMode);
    return r.sort((a, b) => {
      if (sortBy === "createdAt-desc") {
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
  }, [sessionOverrides, fMonth, fTeacher, fMode, slotMap, sortBy]);

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
            htmlFor="ov-list-filter-month"
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            月
          </label>
          <input
            id="ov-list-filter-month"
            type="month"
            value={fMonth}
            onChange={(e) => setFMonth(e.target.value)}
            style={{ ...S.input, width: "auto" }}
          />
        </div>
        <div>
          <label
            htmlFor="ov-list-filter-teacher"
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            講師
          </label>
          <select
            id="ov-list-filter-teacher"
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
            htmlFor="ov-list-filter-mode"
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            種別
          </label>
          <select
            id="ov-list-filter-mode"
            value={fMode}
            onChange={(e) => setFMode(e.target.value)}
            style={{ ...S.input, width: "auto", minWidth: 90 }}
          >
            <option value="">すべて</option>
            <option value="set">回数指定</option>
            <option value="skip">スキップ</option>
          </select>
        </div>
        <button
          onClick={() => {
            setFMonth("");
            setFTeacher("");
            setFMode("");
          }}
          style={{ ...S.btn(false), fontSize: 11 }}
        >
          クリア
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
        {filtered.length} / {sessionOverrides.length} 件表示
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
            該当する回数補正はありません
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
                  学年
                </th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>科目</th>
                <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  講師
                </th>
                <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  内容
                </th>
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
                  title="クリックで作成日時の新しい順 / 補正対象日昇順 を切り替え"
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
              {filtered.map((ov, i) => {
                const slot = slotMap[ov.slotId];
                const gc = slot ? GC(slot.grade) : { b: "#eee", f: "#888" };
                const dow = dateToDay(ov.date);
                return (
                  <tr
                    key={ov.id}
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
                      {ov.date}
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
                      {slot?.time || "-"}
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {slot ? (
                        <span
                          style={{
                            background: gc.b,
                            color: gc.f,
                            borderRadius: 4,
                            padding: "1px 6px",
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {slot.grade}
                          {slot.cls && slot.cls !== "-" ? slot.cls : ""}
                        </span>
                      ) : (
                        "(削除済)"
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                      {slot?.subj || "-"}
                      {slot?.room ? (
                        <span style={{ color: "#999", fontSize: 10, marginLeft: 4 }}>
                          {slot.room}
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {slot?.teacher || "-"}
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {ov.mode === "set" ? (
                        <span
                          style={{
                            background: "#e3f0ff",
                            color: "#1f4d80",
                            borderRadius: 4,
                            padding: "2px 8px",
                            fontWeight: 700,
                          }}
                        >
                          回数指定: 第{ov.value}回
                        </span>
                      ) : (
                        <span
                          style={{
                            background: "#fff3e0",
                            color: "#a65a00",
                            borderRadius: 4,
                            padding: "2px 8px",
                            fontWeight: 700,
                          }}
                        >
                          スキップ
                          {ov.displayAs ? ` (表示: 第${ov.displayAs}回)` : ""}
                        </span>
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
                      title={ov.memo}
                    >
                      {ov.memo || <span style={{ color: "#ccc" }}>-</span>}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontSize: 10,
                        color: "#999",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtIsoLocal(ov.createdAt)}
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
                        {onJumpToDate && ov.date && (
                          <button
                            type="button"
                            onClick={() => onJumpToDate(ov.date)}
                            aria-label={`${ov.date} の欠勤振替画面を開く`}
                            title="この日の欠勤振替画面を開く"
                            style={{ ...S.iconBtn, marginRight: 2 }}
                          >
                            📅
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDel(ov.id)}
                          aria-label={`${ov.date} の回数補正を削除`}
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
