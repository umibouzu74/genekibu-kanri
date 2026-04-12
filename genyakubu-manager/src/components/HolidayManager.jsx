import { useState } from "react";
import { DEPARTMENTS, DEPT_COLOR } from "../data";
import { useConfirm } from "../hooks/useConfirm";
import { useToasts } from "../hooks/useToasts";
import { S } from "../styles/common";

const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function HolidayManager({ holidays, onSave, isAdmin }) {
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState(["全部"]);
  const [filter, setFilter] = useState("");
  const [editDate, setEditDate] = useState(null);
  const [error, setError] = useState("");
  const toasts = useToasts();
  const confirm = useConfirm();

  const toggleScope = (dept) => {
    if (dept === "全部") {
      setScope(["全部"]);
      return;
    }
    let next = scope.filter((s) => s !== "全部");
    next = next.includes(dept) ? next.filter((s) => s !== dept) : [...next, dept];
    setScope(next.length === 0 ? ["全部"] : next);
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
    const isUpdate = holidays.some((h) => h.date === date);
    if (isUpdate && !editDate) {
      // Overwriting an existing holiday without entering edit mode.
      toasts.info(`${date} の既存の休講日を上書きしました`);
    }
    const entry = { date, label: label || "休講", scope: [...scope] };
    onSave([...holidays.filter((h) => h.date !== date), entry]);
    setDate("");
    setLabel("");
    setScope(["全部"]);
    setEditDate(null);
    toasts.success(editDate ? "休講日を更新しました" : "休講日を追加しました");
  };
  const handleEdit = (h) => {
    setDate(h.date);
    setLabel(h.label);
    setScope(h.scope || ["全部"]);
    setEditDate(h.date);
    setError("");
  };
  const cancelEdit = () => {
    setDate("");
    setLabel("");
    setScope(["全部"]);
    setEditDate(null);
    setError("");
  };
  const handleDel = async (d) => {
    const ok = await confirm({
      title: "休講日の削除",
      message: `${d} の休講日を削除しますか？`,
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    onSave(holidays.filter((h) => h.date !== d));
    toasts.success("休講日を削除しました");
  };

  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  const filtered = filter
    ? sorted.filter((h) => {
        const s = h.scope || ["全部"];
        return s.includes("全部") || s.includes(filter);
      })
    : sorted;

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
          {editDate ? "休講日を編集" : "休講日を追加"}
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
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleAdd} style={S.btn(true)}>
            {editDate ? "更新" : "追加"}
          </button>
          {editDate && (
            <button onClick={cancelEdit} style={S.btn(false)}>
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
            return (
              <div
                key={h.date}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 14px",
                  borderBottom: i < filtered.length - 1 ? "1px solid #eee" : "none",
                  background: editDate === h.date ? "#fffbe6" : i % 2 ? "#f8f9fa" : "#fff",
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
                  <div style={{ display: "flex", gap: 3 }}>
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
                      onClick={() => handleDel(h.date)}
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
        ※「全部」＝全部門休講。部門を個別に選択すると、該当部門のみ休講になります。
      </div>
    </div>
  );
}
