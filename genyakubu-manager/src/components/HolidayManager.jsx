import { useMemo, useState } from "react";
import { ALL_GRADES, DEPARTMENTS, DEPT_COLOR, gradeToDept } from "../data";
import { nextNumericId } from "../utils/schema";
import { useConfirm } from "../hooks/useConfirm";
import { useToasts } from "../hooks/useToasts";
import { S } from "../styles/common";

const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

const MIDDLE_GRADES = ALL_GRADES.filter((g) => gradeToDept(g) === "中学部");
const HIGH_GRADES = ALL_GRADES.filter((g) => gradeToDept(g) === "高校部");

const GRADE_COLOR = {
  中学部: { b: "#d4e8d4", f: "#2a5a2a", accent: "#4a9a4a" },
  高校部: { b: "#f0e0c8", f: "#7a5a1a", accent: "#c08a2a" },
};

// Extract unique class groups (school/course names) from configured slots.
// For high school, the class group is either:
//   - the first token for space-separated subjects ("高松西 数学" → "高松西")
//   - a common prefix for concatenated subjects ("共テ英語(St)" → "共テ")
function extractClassGroups(slots, grades) {
  const groups = new Set();
  const singleTokenSubjs = new Set();
  const gradeSet = new Set(grades);
  for (const s of slots) {
    if (gradeSet.size > 0 && !gradeSet.has(s.grade)) continue;
    if (gradeToDept(s.grade) !== "高校部") continue;
    const parts = s.subj.split(/\s+/);
    if (parts.length >= 2) {
      groups.add(parts[0]);
    } else {
      singleTokenSubjs.add(s.subj);
    }
  }
  // Find shortest common prefix (≥2 chars) among 3+ single-token subjects
  if (singleTokenSubjs.size >= 2) {
    const subjs = [...singleTokenSubjs];
    for (let len = 2; len <= 8; len++) {
      const counts = {};
      for (const s of subjs) {
        if (s.length >= len) {
          const p = s.slice(0, len);
          counts[p] = (counts[p] || 0) + 1;
        }
      }
      for (const [prefix, count] of Object.entries(counts)) {
        if (count < 3) continue;
        // Skip if a shorter prefix already covers this group
        let dominated = false;
        for (const g of groups) {
          if (prefix.startsWith(g)) { dominated = true; break; }
        }
        if (!dominated) groups.add(prefix);
      }
    }
  }
  return [...groups].sort();
}

export function HolidayManager({ holidays, slots = [], onSave, isAdmin }) {
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState(["全部"]);
  const [targetGrades, setTargetGrades] = useState([]);
  const [allGrades, setAllGrades] = useState(true);
  const [subjKeywords, setSubjKeywords] = useState([]);
  const [filter, setFilter] = useState("");
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");
  const toasts = useToasts();
  const confirm = useConfirm();

  // Derive available class groups from configured slots
  const availableClasses = useMemo(
    () => extractClassGroups(slots, allGrades ? [] : targetGrades),
    [slots, targetGrades, allGrades]
  );

  const toggleScope = (dept) => {
    if (dept === "全部") {
      setScope(["全部"]);
      // Reset grade/keyword when switching to 全部
      setTargetGrades([]);
      setAllGrades(true);
      setSubjKeywords([]);
      return;
    }
    let next = scope.filter((s) => s !== "全部");
    next = next.includes(dept) ? next.filter((s) => s !== dept) : [...next, dept];
    if (next.length === 0) {
      setScope(["全部"]);
      setTargetGrades([]);
      setAllGrades(true);
      setSubjKeywords([]);
    } else {
      setScope(next);
      // Filter out grades that no longer belong to selected departments
      if (!allGrades) {
        const validGrades = targetGrades.filter((g) => next.includes(gradeToDept(g)));
        if (validGrades.length === 0) {
          setAllGrades(true);
          setTargetGrades([]);
          setSubjKeywords([]);
        } else {
          setTargetGrades(validGrades);
          setSubjKeywords([]);
        }
      }
    }
  };

  // ─── Grade selection (same pattern as ExamPeriodManager) ───
  const toggleGrade = (g) => {
    setSubjKeywords([]); // Clear class selection when grades change
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

  const selectAllGrades = () => {
    setAllGrades(true);
    setTargetGrades([]);
    setSubjKeywords([]);
  };

  const selectMiddle = () => {
    setAllGrades(false);
    setTargetGrades(MIDDLE_GRADES);
    setSubjKeywords([]);
  };

  const selectHigh = () => {
    setAllGrades(false);
    setTargetGrades(HIGH_GRADES);
    setSubjKeywords([]);
  };

  const isGradeSelected = (g) => allGrades || targetGrades.includes(g);

  // ─── Subject keyword selection ───
  const toggleKeyword = (kw) => {
    setSubjKeywords((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw]
    );
  };

  // ─── Form actions ───
  const resetForm = () => {
    setDate("");
    setLabel("");
    setScope(["全部"]);
    setTargetGrades([]);
    setAllGrades(true);
    setSubjKeywords([]);
    setEditId(null);
    setError("");
  };

  const handleAdd = () => {
    setError("");
    if (!date) {
      setError("日付を入力してください");
      return;
    }
    if (!isValidDate(date)) {
      setError("日付の形式が正しくありません");
      return;
    }

    const grades = allGrades ? [] : [...targetGrades];
    // Clear subjKeywords when scope is 全部 or all grades selected
    const keywords = scope.includes("全部") || allGrades ? [] : [...subjKeywords];
    const entry = {
      id: editId != null ? editId : nextNumericId(holidays),
      date,
      label: label || "休講",
      scope: [...scope],
      targetGrades: grades,
      subjKeywords: keywords,
    };

    if (editId != null) {
      onSave(holidays.map((h) => (h.id === editId ? entry : h)));
      toasts.success("休講日を更新しました");
    } else {
      onSave([...holidays, entry]);
      toasts.success("休講日を追加しました");
    }
    resetForm();
  };

  const handleEdit = (h) => {
    setDate(h.date);
    setLabel(h.label);
    setScope(h.scope || ["全部"]);
    if ((h.targetGrades || []).length === 0) {
      setAllGrades(true);
      setTargetGrades([]);
    } else {
      setAllGrades(false);
      setTargetGrades([...h.targetGrades]);
    }
    setSubjKeywords([...(h.subjKeywords || [])]);
    setEditId(h.id);
    setError("");
  };

  const handleDel = async (h) => {
    const ok = await confirm({
      title: "休講日の削除",
      message: `${h.date}${h.label ? `（${h.label}）` : ""} の休講日を削除しますか？`,
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    onSave(holidays.filter((x) => x.id !== h.id));
    toasts.success("休講日を削除しました");
  };

  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const filtered = filter
    ? sorted.filter((h) => {
        const s = h.scope || ["全部"];
        return s.includes("全部") || s.includes(filter);
      })
    : sorted;

  // Show grade/keyword selection only when scope is NOT 全部
  const showGradeSelection = !scope.includes("全部");

  return (
    <div style={{ marginTop: 12 }}>
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
          {editId != null ? "休講日を編集" : "休講日を追加"}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (error) setError("");
            }}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "holiday-date-err" : undefined}
            style={{ ...S.input, width: "auto", borderColor: error ? "#c44" : "#ccc" }}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="名称（任意）"
            style={{ ...S.input, width: 160 }}
          />
        </div>
        {error && (
          <div
            id="holiday-date-err"
            role="alert"
            style={{ fontSize: 11, color: "#c44", marginBottom: 8 }}
          >
            {error}
          </div>
        )}

        {/* 対象部門 */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700 }}>対象:</span>
          {["全部", ...DEPARTMENTS].map((d) => (
            <label
              key={d}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
                background: scope.includes(d)
                  ? d === "全部"
                    ? "#1a1a2e"
                    : DEPT_COLOR[d]?.b || "#eee"
                  : "#f5f5f5",
                color: scope.includes(d)
                  ? d === "全部"
                    ? "#fff"
                    : DEPT_COLOR[d]?.f || "#444"
                  : "#aaa",
                border: `1px solid ${
                  scope.includes(d)
                    ? d === "全部"
                      ? "#1a1a2e"
                      : DEPT_COLOR[d]?.accent || "#ccc"
                    : "#ddd"
                }`,
                fontWeight: scope.includes(d) ? 700 : 400,
                transition: "all .15s",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={scope.includes(d)}
                onChange={() => toggleScope(d)}
                style={{ display: "none" }}
              />
              {d}
            </label>
          ))}
        </div>

        {/* 対象学年 (部門が全部でない場合のみ表示) */}
        {showGradeSelection && (
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
                onClick={selectAllGrades}
                style={{
                  ...S.btn(allGrades),
                  fontSize: 11,
                  padding: "4px 10px",
                }}
              >
                全学年
              </button>
              {scope.includes("中学部") && (
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
              )}
              {scope.includes("高校部") && (
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
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {ALL_GRADES.filter((g) => {
                const dept = gradeToDept(g);
                return scope.includes(dept);
              }).map((g) => {
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
        )}

        {/* 対象クラス (学年が個別選択かつ高校部を含む場合のみ表示) */}
        {showGradeSelection && !allGrades && targetGrades.some((g) => gradeToDept(g) === "高校部") && availableClasses.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700 }}>対象クラス:</span>
              <span style={{ fontSize: 10, color: "#888" }}>（未選択＝全クラス対象）</span>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {availableClasses.map((cls) => {
                const sel = subjKeywords.includes(cls);
                return (
                  <label
                    key={cls}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 5,
                      cursor: "pointer",
                      background: sel ? "#e0ecf8" : "#f5f5f5",
                      color: sel ? "#1a4a7a" : "#999",
                      border: `1px solid ${sel ? "#6aa0d0" : "#ddd"}`,
                      fontWeight: sel ? 700 : 400,
                      transition: "all .15s",
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggleKeyword(cls)}
                      style={{ display: "none" }}
                    />
                    {cls}
                  </label>
                );
              })}
            </div>
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

      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700 }}>フィルター:</span>
        {["", ...DEPARTMENTS].map((d) => (
          <button
            key={d}
            onClick={() => setFilter(d)}
            style={{ ...S.btn(filter === d), fontSize: 11, padding: "4px 10px" }}
          >
            {d || "すべて"}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
        {filtered.length} / {holidays.length} 件表示
      </div>
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          overflow: "hidden",
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#bbb",
              padding: 30,
              fontSize: 13,
            }}
          >
            登録された休講日はありません
          </div>
        ) : (
          filtered.map((h, i) => {
            const sc = h.scope || ["全部"];
            const tg = h.targetGrades || [];
            const sk = h.subjKeywords || [];
            return (
              <div
                key={h.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 14px",
                  borderBottom: i < filtered.length - 1 ? "1px solid #eee" : "none",
                  background: editId === h.id ? "#fffbe6" : i % 2 ? "#f8f9fa" : "#fff",
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
                  <strong style={{ fontSize: 12, minWidth: 90 }}>{h.date}</strong>
                  <span style={{ fontSize: 12 }}>{h.label}</span>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {sc.map((d) => (
                      <span
                        key={d}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: d === "全部" ? "#1a1a2e" : DEPT_COLOR[d]?.b || "#eee",
                          color: d === "全部" ? "#fff" : DEPT_COLOR[d]?.f || "#444",
                        }}
                      >
                        {d}
                      </span>
                    ))}
                    {tg.map((g) => {
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
                    })}
                    {sk.map((kw) => (
                      <span
                        key={kw}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "#e0ecf8",
                          color: "#1a4a7a",
                        }}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleEdit(h)}
                      aria-label={`${h.date} の休講日を編集`}
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
                      onClick={() => handleDel(h)}
                      aria-label={`${h.date} の休講日を削除`}
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
        ※「全部」＝全部門休講。部門を個別に選択すると、学年やクラスで対象を絞り込めます。
      </div>
    </div>
  );
}
