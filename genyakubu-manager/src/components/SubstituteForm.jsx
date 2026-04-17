import { useState } from "react";
import { dateToDay, fmtDate } from "../data";
import { S } from "../styles/common";
import { SingleSubForm } from "./substitute/SingleSubForm";
import { DayBulkSubForm } from "./substitute/DayBulkSubForm";

// ─── 代行登録フォーム ─────────────────────────────────────────────
// モード切替と日付管理のみを扱う薄いラッパー。
// 単一コマ入力 → SingleSubForm / 1日分まとめ入力 → DayBulkSubForm。
// 編集時 (sub prop あり) は常に単一モード固定。
//
// 日付入力は親で保持し、両サブフォームへ prop として流す。
// 日付の必須 validation も親で行い、空なら onSave 呼び出しを止める。
export function SubstituteForm({
  sub,
  slots,
  subs = [],
  partTimeStaff,
  subjects = [],
  onSave,
  onCancel,
}) {
  const isEdit = Boolean(sub);
  const today = fmtDate(new Date());
  const [mode, setMode] = useState("single");
  const [date, setDate] = useState(sub?.date || today);
  const [dateError, setDateError] = useState(null);

  const activeMode = isEdit ? "single" : mode;
  const dayOfDate = dateToDay(date);

  const handleDateChange = (e) => {
    setDate(e.target.value);
    setDateError(null);
  };

  // サブフォームからの onSave をラップし、日付空なら表示を赤くして中断する。
  const handleSave = (payload) => {
    if (!date) {
      setDateError("日付を入力してください");
      return;
    }
    onSave(payload);
  };

  const modeBtn = (key, label) => {
    const active = activeMode === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setMode(key)}
        style={{
          padding: "6px 14px",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          background: active ? "#1a1a2e" : "#f5f5f5",
          color: active ? "#fff" : "#888",
          border: `2px solid ${active ? "#1a1a2e" : "#e0e0e0"}`,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!isEdit && (
        <div style={{ display: "flex", gap: 6 }}>
          {modeBtn("single", "単一コマ")}
          {modeBtn("full-day", "1日分まとめて")}
        </div>
      )}

      <div>
        <label
          style={{
            fontSize: 12,
            fontWeight: 700,
            display: "block",
            marginBottom: 3,
          }}
        >
          日付 <span style={{ color: "#c44" }}>*</span>
        </label>
        <input
          type="date"
          value={date}
          onChange={handleDateChange}
          style={{ ...S.input, borderColor: dateError ? "#c44" : "#ccc" }}
        />
        {dayOfDate && (
          <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>
            ({dayOfDate}曜日)
          </span>
        )}
        {dateError && (
          <div style={{ fontSize: 10, color: "#c44", marginTop: 2 }}>
            {dateError}
          </div>
        )}
      </div>

      {activeMode === "single" ? (
        <SingleSubForm
          sub={sub}
          date={date}
          dayOfDate={dayOfDate}
          slots={slots}
          subs={subs}
          partTimeStaff={partTimeStaff}
          subjects={subjects}
          onSave={handleSave}
          onCancel={onCancel}
        />
      ) : (
        <DayBulkSubForm
          date={date}
          dayOfDate={dayOfDate}
          slots={slots}
          subs={subs}
          partTimeStaff={partTimeStaff}
          subjects={subjects}
          onSave={handleSave}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
