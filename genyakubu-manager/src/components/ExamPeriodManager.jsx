import { useState } from "react";
import { ALL_GRADES, gradeToDept } from "../data";
import { nextNumericId } from "../utils/schema";
import { useConfirm } from "../hooks/useConfirm";
import { useToasts } from "../hooks/useToasts";
import { S } from "../styles/common";

const isValidDate = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

const MIDDLE_GRADES = ALL_GRADES.filter((g) => gradeToDept(g) === "中学部");
const HIGH_GRADES = ALL_GRADES.filter((g) => gradeToDept(g) === "高校部");

const GRADE_COLOR = {
  中学部: { b: "#d4e8d4", f: "#2a5a2a", accent: "#4a9a4a" },
  高校部: { b: "#f0e0c8", f: "#7a5a1a", accent: "#c08a2a" },
};

export function ExamPeriodManager({ examPeriods, onSave, isAdmin }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetGrades, setTargetGrades] = useState([]);
  const [allGrades, setAllGrades] = useState(true);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");
  const toasts = useToasts();
  const confirm = useConfirm();

  const toggleGrade = (g) => {
    if (allGrades) {
      // Switch from "all" to specific selection with this grade toggled off
      setAllGrades(false);
      setTargetGrades(ALL_GRADES.filter((gr) => gr !== g));
      return;
    }
    setTargetGrades((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
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
    if (!endDate || !isValidDate(endDate)) {
      setError("終了日を正しく入力してください");
      return;
    }
    if (endDate < startDate) {
      setError("終了日は開始日以降にしてください");
      return;
    }

    const grades = allGrades ? [] : [...targetGrades];
    if (editId != null) {
      const updated = examPeriods.map((ep) =>
        ep.id === editId
          ? { ...ep, name: name.trim(), startDate, endDate, targetGrades: grades }
          : ep
      );
      onSave(updated);
      toasts.success("テスト期間を更新しました");
    } else {
      const entry = {
        id: nextNumericId(examPeriods),
        name: name.trim(),
        startDate,
        endDate,
        targetGrades: grades,
      };
      onSave([...examPeriods, entry]);
      toasts.success("テスト期間を追加しました");
    }
    resetForm();
  };

  const handleEdit = (ep) => {
    setName(ep.name);
    setStartDate(ep.startDate);
    setEndDate(ep.endDate);
    if (ep.targetGrades.length === 0) {
      setAllGrades(true);
      setTargetGrades([]);
    } else {
      setAllGrades(false);
      setTargetGrades([...ep.targetGrades]);
    }
    setEditId(ep.id);
    setError("");
  };

  const resetForm = () => {
    setName("");
    setStartDate("");
    setEndDate("");
    setTargetGrades([]);
    setAllGrades(true);
    setEditId(null);
    setError("");
  };

  const handleDel = async (ep) => {
    const ok = await confirm({
      title: "テスト期間の削除",
      message: `「${ep.name}」（${ep.startDate} 〜 ${ep.endDate}）を削除しますか？`,
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    onSave(examPeriods.filter((e) => e.id !== ep.id));
    toasts.success("テスト期間を削除しました");
  };

  const sorted = [...examPeriods].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 15,
          fontWeight: 800,
          marginBottom: 10,
          color: "#1a1a2e",
          borderBottom: "2px solid #e0a030",
          paddingBottom: 6,
        }}
      >
        テスト期間管理
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
            {editId != null ? "テスト期間を編集" : "テスト期間を追加"}
          </div>

          {/* 名称 */}
          <div style={{ marginBottom: 10 }}>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="名称（例: 1学期中間テスト期間）"
              style={{ ...S.input, width: "100%", maxWidth: 340 }}
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
                  background:
                    !allGrades &&
                    MIDDLE_GRADES.every((g) => targetGrades.includes(g)) &&
                    !HIGH_GRADES.some((g) => targetGrades.includes(g))
                      ? GRADE_COLOR["中学部"].accent
                      : undefined,
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
                  background:
                    !allGrades &&
                    HIGH_GRADES.every((g) => targetGrades.includes(g)) &&
                    !MIDDLE_GRADES.some((g) => targetGrades.includes(g))
                      ? GRADE_COLOR["高校部"].accent
                      : undefined,
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
              role="alert"
              style={{ fontSize: 11, color: "#c44", marginBottom: 8 }}
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
              color: "#bbb",
              padding: 30,
              fontSize: 13,
            }}
          >
            登録されたテスト期間はありません
          </div>
        ) : (
          sorted.map((ep, i) => (
            <div
              key={ep.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                borderBottom:
                  i < sorted.length - 1 ? "1px solid #eee" : "none",
                background:
                  editId === ep.id
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
                <strong style={{ fontSize: 13 }}>{ep.name}</strong>
                <span style={{ fontSize: 11, color: "#666" }}>
                  {ep.startDate} 〜 {ep.endDate}
                </span>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {ep.targetGrades.length === 0 ? (
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
                    ep.targetGrades.map((g) => {
                      const dept = gradeToDept(g);
                      const col = GRADE_COLOR[dept] || { b: "#eee", f: "#444" };
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
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => handleEdit(ep)}
                    aria-label={`${ep.name} を編集`}
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
                    onClick={() => handleDel(ep)}
                    aria-label={`${ep.name} を削除`}
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
          ))
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: "#888" }}>
        ※テスト期間中は対象学年の通常授業が休止扱いになります。「全学年」＝全学年対象。
      </div>
    </div>
  );
}
