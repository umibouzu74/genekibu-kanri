import { useId, useState } from "react";
import { dateToDay, fmtDate } from "../data";
import { S } from "../styles/common";
import { colors } from "../styles/tokens";
import { FieldError } from "./FieldError";
import { SingleSubForm } from "./substitute/SingleSubForm";
import { DayBulkSubForm } from "./substitute/DayBulkSubForm";

// ─── 代行登録フォーム ─────────────────────────────────────────────
// モード切替と共有 state を扱う薄いラッパー。
// 単一コマ入力 → SingleSubForm / 1日分まとめ入力 → DayBulkSubForm。
// 編集時 (sub prop あり) は常に単一モード固定。
//
// 共有 state (date / singleF / rowState / showAllCandidates) は親で
// 保持することで、モード切替時に入力が消失しないようにしている。
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
  const formId = useId();
  const dateInputId = `${formId}-date`;
  const dateErrorId = `${dateInputId}-err`;
  const [mode, setMode] = useState("single");
  const [date, setDate] = useState(sub?.date || today);
  const [dateError, setDateError] = useState(null);

  // 子フォーム間で共有する state (モード切替で消えないよう親で保持)
  const [singleF, setSingleF] = useState(
    sub || {
      slotId: "",
      originalTeacher: "",
      substitute: "",
      status: "requested",
      memo: "",
    }
  );
  const [rowState, setRowState] = useState({});
  const [showAllCandidates, setShowAllCandidates] = useState(false);

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
        <label htmlFor={dateInputId} style={S.formLabel}>
          日付 <span style={{ color: colors.danger }} aria-label="必須">*</span>
        </label>
        <input
          id={dateInputId}
          type="date"
          value={date}
          onChange={handleDateChange}
          aria-invalid={dateError ? "true" : undefined}
          aria-describedby={dateError ? dateErrorId : undefined}
          style={{ ...S.input, borderColor: dateError ? colors.danger : "#ccc" }}
        />
        {dayOfDate && (
          <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>
            ({dayOfDate}曜日)
          </span>
        )}
        <FieldError id={dateErrorId}>{dateError}</FieldError>
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
          f={singleF}
          setF={setSingleF}
          showAllCandidates={showAllCandidates}
          setShowAllCandidates={setShowAllCandidates}
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
          rowState={rowState}
          setRowState={setRowState}
          showAllCandidates={showAllCandidates}
          setShowAllCandidates={setShowAllCandidates}
          onSave={handleSave}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
