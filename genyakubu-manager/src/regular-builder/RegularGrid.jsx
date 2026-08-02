import { memo } from "react";
import { makeCellKey, tabPeriods } from "./model";
import { splitTeacherField } from "../utils/biweekly";

// ─── スケジュール表 (曜日 × 時限 × クラス) ──────────────────────────
// 講習ビルダーのスケジュール表に相当。曜日ごとにテーブルを分け、行 = 時限、
// 列 = クラス。セルは 教科 / 講師 / 教室 / 備考 の 4 入力。
// 衝突セルは赤枠 + ⚠ (理由は title)、講師フィルタ一致セルは黄色背景。

const cellInput = {
  width: "100%",
  border: "none",
  borderBottom: "1px solid #e8e8e8",
  fontSize: 11,
  padding: "2px 4px",
  background: "transparent",
  outline: "none",
  boxSizing: "border-box",
};

const CellEditor = memo(function CellEditor({
  cellKey,
  cell,
  conflictText,
  highlighted,
  roomPlaceholder,
  onCellChange,
}) {
  const c = cell || {};
  const border = conflictText ? "2px solid #c03030" : "1px solid #e0e0e0";
  return (
    <td
      style={{
        border,
        padding: 3,
        minWidth: 150,
        verticalAlign: "top",
        background: highlighted ? "#fff3c4" : c.subj ? "#fdfefe" : "#fafafa",
      }}
      title={conflictText || undefined}
    >
      {conflictText && (
        <div style={{ fontSize: 10, color: "#c03030", fontWeight: 700 }}>⚠ 重複</div>
      )}
      <input
        type="text"
        value={c.subj || ""}
        onChange={(e) => onCellChange(cellKey, "subj", e.target.value)}
        placeholder="教科"
        list="regb-subjects"
        style={{ ...cellInput, fontWeight: 700 }}
      />
      <input
        type="text"
        value={c.teacher || ""}
        onChange={(e) => onCellChange(cellKey, "teacher", e.target.value)}
        placeholder="講師"
        list="regb-teachers"
        style={cellInput}
      />
      <div style={{ display: "flex", gap: 2 }}>
        <input
          type="text"
          value={c.room || ""}
          onChange={(e) => onCellChange(cellKey, "room", e.target.value)}
          placeholder={roomPlaceholder || "教室"}
          style={{ ...cellInput, width: 54, color: "#666" }}
        />
        <input
          type="text"
          value={c.note || ""}
          onChange={(e) => onCellChange(cellKey, "note", e.target.value)}
          placeholder="備考"
          style={{ ...cellInput, flex: 1, color: "#666" }}
        />
      </div>
    </td>
  );
});

export function RegularGrid({ project, tab, onCellChange, conflictsByRef, highlightTeacher }) {
  const periods = tabPeriods(project, tab);
  const days = tab.days || [];

  if (days.length === 0 || periods.length === 0 || tab.classes.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "#888", padding: "18px 6px" }}>
        「⚙ タブ設定」で曜日・使う時限・クラスを設定するとマス目が表示されます。
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {days.map((day) => (
        <div key={day} style={{ overflowX: "auto" }}>
          <div style={{ fontWeight: 800, fontSize: 13, margin: "2px 0 4px" }}>{day}曜日</div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th
                  style={{
                    border: "1px solid #e0e0e0",
                    background: "#f4f6fa",
                    fontSize: 11,
                    padding: 4,
                    width: 110,
                  }}
                >
                  時限
                </th>
                {tab.classes.map((cls) => (
                  <th
                    key={cls.id}
                    style={{
                      border: "1px solid #e0e0e0",
                      background: "#f4f6fa",
                      fontSize: 11,
                      padding: 4,
                      minWidth: 150,
                    }}
                  >
                    {cls.label || "(クラス名未設定)"}
                    {cls.room && (
                      <span style={{ fontWeight: 400, color: "#888", marginLeft: 4 }}>
                        {cls.room}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((per) => (
                <tr key={per.id}>
                  <th
                    style={{
                      border: "1px solid #e0e0e0",
                      background: "#fafafa",
                      fontSize: 11,
                      padding: 4,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {/* ラベル未設定 (取込直後など) は時刻だけを見出しにする */}
                    {per.label ? (
                      <>
                        {per.label}
                        <div style={{ fontWeight: 400, color: "#888", fontSize: 10 }}>
                          {per.time}
                        </div>
                      </>
                    ) : (
                      per.time
                    )}
                  </th>
                  {tab.classes.map((cls) => {
                    const key = makeCellKey(day, per.id, cls.id);
                    const cell = tab.schedule[key];
                    const reasons = conflictsByRef.get(`${tab.id}:${key}`);
                    const highlighted =
                      !!highlightTeacher &&
                      splitTeacherField(cell?.teacher).includes(highlightTeacher);
                    return (
                      <CellEditor
                        key={key}
                        cellKey={key}
                        cell={cell}
                        conflictText={reasons ? reasons.join("\n") : ""}
                        highlighted={highlighted}
                        roomPlaceholder={cls.room}
                        onCellChange={onCellChange}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
