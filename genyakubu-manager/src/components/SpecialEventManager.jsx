import { useState } from "react";
import { ALL_GRADES, gradeToDept } from "../data";
import { nextNumericId } from "../utils/schema";
import { useToasts } from "../hooks/useToasts";
import { useRemoveWithUndo } from "../hooks/useCrudResource";
import { S } from "../styles/common";
import { colors } from "../styles/tokens";
import {
  SPECIAL_EVENT_TYPES,
  specialEventTypeMeta,
} from "../constants/specialEvents";

const isValidDate = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

const MIDDLE_GRADES = ALL_GRADES.filter((g) => gradeToDept(g) === "中学部");
const HIGH_GRADES = ALL_GRADES.filter((g) => gradeToDept(g) === "高校部");

const GRADE_COLOR = {
  中学部: { b: "#d4e8d4", f: "#2a5a2a", accent: "#4a9a4a" },
  高校部: { b: "#f0e0c8", f: "#7a5a1a", accent: "#c08a2a" },
};

export function SpecialEventManager({ specialEvents, onSave, isAdmin }) {
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState("announcement");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [memo, setMemo] = useState("");
  const [targetGrades, setTargetGrades] = useState([]);
  const [allGrades, setAllGrades] = useState(true);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");
  const toasts = useToasts();

  const removeEventWithUndo = useRemoveWithUndo({
    list: specialEvents,
    save: onSave,
  });

  const toggleGrade = (g) => {
    if (allGrades) {
      setAllGrades(false);
      setTargetGrades(ALL_GRADES.filter((gr) => gr !== g));
      return;
    }
    const next = targetGrades.includes(g)
      ? targetGrades.filter((x) => x !== g)
      : [...targetGrades, g];
    if (next.length === 0) {
      setAllGrades(true);
      setTargetGrades([]);
    } else {
      setTargetGrades(next);
    }
  };

  const selectAll = () => {
    setAllGrades(true);
    setTargetGrades([]);
  };
  const selectMiddle = () => {
    setAllGrades(false);
    setTargetGrades(MIDDLE_GRADES);
  };
  const selectHigh = () => {
    setAllGrades(false);
    setTargetGrades(HIGH_GRADES);
  };

  const isGradeSelected = (g) => allGrades || targetGrades.includes(g);

  const resetForm = () => {
    setName("");
    setEventType("announcement");
    setStartDate("");
    setEndDate("");
    setMemo("");
    setTargetGrades([]);
    setAllGrades(true);
    setEditId(null);
    setError("");
  };

  const handleAdd = () => {
    setError("");
    if (!name.trim()) {
      setError("名称を入力してください");
      return;
    }
    if (!startDate || !isValidDate(startDate)) {
      setError("開始日を正しく入力してください");
      return;
    }
    const effectiveEnd = endDate || startDate;
    if (!isValidDate(effectiveEnd)) {
      setError("終了日を正しく入力してください");
      return;
    }
    if (effectiveEnd < startDate) {
      setError("終了日は開始日以降にしてください");
      return;
    }
    if (!allGrades && targetGrades.length === 0) {
      setError("対象学年を選択してください");
      return;
    }

    const grades = allGrades ? [] : [...targetGrades];
    const base = {
      name: name.trim(),
      eventType,
      startDate,
      endDate: effectiveEnd,
      targetGrades: grades,
      memo: memo.trim(),
    };
    if (editId != null) {
      onSave(
        specialEvents.map((ev) => (ev.id === editId ? { ...ev, ...base } : ev))
      );
      toasts.success("イベントを更新しました");
    } else {
      onSave([...specialEvents, { id: nextNumericId(specialEvents), ...base }]);
      toasts.success("イベントを追加しました");
    }
    resetForm();
  };

  const handleEdit = (ev) => {
    setName(ev.name);
    setEventType(ev.eventType || "other");
    setStartDate(ev.startDate);
    setEndDate(ev.endDate);
    setMemo(ev.memo || "");
    if ((ev.targetGrades || []).length === 0) {
      setAllGrades(true);
      setTargetGrades([]);
    } else {
      setAllGrades(false);
      setTargetGrades([...ev.targetGrades]);
    }
    setEditId(ev.id);
    setError("");
  };

  const handleDel = (ev) => {
    removeEventWithUndo(ev.id, {
      successMsg: `イベントを削除しました（${ev.name}）`,
    });
  };

  const sorted = [...specialEvents].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id
  );

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 15,
          fontWeight: 800,
          marginBottom: 10,
          color: "#1a1a2e",
          borderBottom: "2px solid #8a5ec4",
          paddingBottom: 6,
        }}
      >
        特別イベント管理
      </div>

      {isAdmin && (
        <div
          style={{
            background: "#fff",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            border: "1px solid #e0e0e0",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            {editId != null ? "イベントを編集" : "イベントを追加"}
          </div>

          {/* 種別 */}
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700 }}>種別:</span>
            {SPECIAL_EVENT_TYPES.map((t) => {
              const sel = eventType === t.key;
              return (
                <label
                  key={t.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: sel ? t.bg : "#f5f5f5",
                    color: sel ? t.fg : "#888",
                    border: `1px solid ${sel ? t.accent : "#ddd"}`,
                    fontWeight: sel ? 700 : 400,
                    transition: "all .15s",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="radio"
                    name="special-event-type"
                    checked={sel}
                    onChange={() => setEventType(t.key)}
                    style={{ display: "none" }}
                  />
                  <span aria-hidden="true">{t.icon}</span> {t.label}
                </label>
              );
            })}
          </div>

          {/* 名称 */}
          <div style={{ marginBottom: 10 }}>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="名称（例: 修学旅行 / 1学期中間テスト発表）"
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "special-event-err" : undefined}
              style={{
                ...S.input,
                width: "100%",
                maxWidth: 360,
                borderColor: error ? colors.danger : "#ccc",
              }}
            />
          </div>

          {/* 期間 */}
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700 }}>期間:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (error) setError("");
              }}
              style={{ ...S.input, width: "auto" }}
            />
            <span style={{ fontSize: 12, color: "#888" }}>〜</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                if (error) setError("");
              }}
              style={{ ...S.input, width: "auto" }}
            />
            <span style={{ fontSize: 10, color: "#888" }}>
              （単日の場合は終了日空欄でOK）
            </span>
          </div>

          {/* メモ */}
          <div style={{ marginBottom: 10 }}>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="メモ（任意）"
              style={{ ...S.input, width: "100%", maxWidth: 360 }}
            />
          </div>

          {/* 対象学年 */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700 }}>対象学年:</span>
              <button
                type="button"
                onClick={selectAll}
                style={{
                  ...S.btn(allGrades),
                  fontSize: 11,
                  padding: "4px 10px",
                }}
              >
                全学年
              </button>
              <button
                type="button"
                onClick={selectMiddle}
                style={{
                  ...S.btn(
                    !allGrades &&
                      MIDDLE_GRADES.every((g) => targetGrades.includes(g)) &&
                      !HIGH_GRADES.some((g) => targetGrades.includes(g))
                  ),
                  fontSize: 11,
                  padding: "4px 10px",
                }}
              >
                中学部一括
              </button>
              <button
                type="button"
                onClick={selectHigh}
                style={{
                  ...S.btn(
                    !allGrades &&
                      HIGH_GRADES.every((g) => targetGrades.includes(g)) &&
                      !MIDDLE_GRADES.some((g) => targetGrades.includes(g))
                  ),
                  fontSize: 11,
                  padding: "4px 10px",
                }}
              >
                高校部一括
              </button>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {ALL_GRADES.map((g) => {
                const dept = gradeToDept(g);
                const col = GRADE_COLOR[dept] || { b: "#eee", f: "#444" };
                const sel = isGradeSelected(g);
                return (
                  <label
                    key={g}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: sel ? col.b : "#f5f5f5",
                      color: sel ? col.f : "#aaa",
                      border: `1px solid ${sel ? col.accent || "#ccc" : "#ddd"}`,
                      fontWeight: sel ? 700 : 400,
                      transition: "all .15s",
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggleGrade(g)}
                      style={{ display: "none" }}
                    />
                    {g}
                  </label>
                );
              })}
            </div>
          </div>

          {error && (
            <div
              id="special-event-err"
              role="alert"
              style={{ fontSize: 11, color: colors.danger, marginBottom: 8 }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleAdd} style={S.btn(true)}>
              {editId != null ? "更新" : "追加"}
            </button>
            {editId != null && (
              <button onClick={resetForm} style={S.btn(false)}>
                キャンセル
              </button>
            )}
          </div>
        </div>
      )}

      {/* 一覧 */}
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          overflow: "hidden",
        }}
      >
        {sorted.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#888",
              padding: "32px 20px",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            <div aria-hidden="true" style={{ fontSize: 28, marginBottom: 6 }}>
              📌
            </div>
            <div style={{ fontWeight: 700, color: "#555", marginBottom: 4 }}>
              登録された特別イベントはありません
            </div>
            {isAdmin && (
              <div style={{ fontSize: 12, color: "#888" }}>
                修学旅行・テスト発表・式典など、告知したい予定をここで登録します
              </div>
            )}
          </div>
        ) : (
          sorted.map((ev, i) => {
            const meta = specialEventTypeMeta(ev.eventType);
            const isSingle = ev.startDate === ev.endDate;
            return (
              <div
                key={ev.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderBottom:
                    i < sorted.length - 1 ? "1px solid #eee" : "none",
                  background:
                    editId === ev.id
                      ? "#fffbe6"
                      : i % 2
                        ? "#f8f9fa"
                        : "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: meta.bg,
                      color: meta.fg,
                      border: `1px solid ${meta.accent}`,
                    }}
                  >
                    {meta.icon} {meta.label}
                  </span>
                  <strong style={{ fontSize: 13 }}>{ev.name}</strong>
                  <span style={{ fontSize: 11, color: "#666" }}>
                    {isSingle
                      ? ev.startDate
                      : `${ev.startDate} 〜 ${ev.endDate}`}
                  </span>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {(ev.targetGrades || []).length === 0 ? (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "#1a1a2e",
                          color: "#fff",
                        }}
                      >
                        全学年
                      </span>
                    ) : (
                      (ev.targetGrades || []).map((g) => {
                        const dept = gradeToDept(g);
                        const col =
                          GRADE_COLOR[dept] || { b: "#eee", f: "#444" };
                        return (
                          <span
                            key={g}
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: col.b,
                              color: col.f,
                            }}
                          >
                            {g}
                          </span>
                        );
                      })
                    )}
                  </div>
                  {ev.memo && (
                    <span
                      style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}
                    >
                      {ev.memo}
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleEdit(ev)}
                      aria-label={`${ev.name} を編集`}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 12,
                        padding: 2,
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDel(ev)}
                      aria-label={`${ev.name} を削除`}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: "#888" }}>
        ※特別イベントは告知用の表示のみで、休講や授業数には影響しません。
        授業を休止する場合は、別途「休講日」を登録してください。
      </div>
    </div>
  );
}
