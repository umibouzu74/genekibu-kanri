import { useMemo, useRef, useState } from "react";
import { ALL_GRADES, gradeToDept, isValidDateStr } from "../data";
import { DEPT_COLOR } from "../constants/colors";
import { nextNumericId } from "../utils/schema";
import { dateToDay, fmtDateWeekday } from "../utils/dateHelpers";
import { filterSlotsForDate } from "../utils/timetable";
import {
  buildCompressTimeMap,
  buildCutFirstCancelTimes,
  collectTargetTimes,
  findNewConflicts,
  resolveSlotDaySchedule,
} from "../utils/daySchedules";
import { useToasts } from "../hooks/useToasts";
import { useRemoveWithUndo } from "../hooks/useCrudResource";
import { useEditTarget, useNewEntryTarget } from "../hooks/useEditTarget";
import { S } from "../styles/common";
import { colors } from "../styles/tokens";

// ─── 特別時程マネージャ ─────────────────────────────────────────────
// 学校行事の都合で特定日だけ時程が変わるコース (主に附属) の登録 UI。
// 日付 + 対象学年を選ぶと、その曜日に実際にあるコマの時間帯一覧が出るので
// 各時間帯の「新しい時刻」または「休講」を指定して保存する。プリセット:
//   ① 50分授業 (17:00開始): 先頭 4 コマを 17:00-17:50 / 18:00-18:50 /
//      19:00-19:50 / 20:00-20:50 に読み替え (テスト等の残りは据え置き)
//   ② 1限カット: 最初の時間帯を休講扱い (回数カウントも進めない)
// 保存前に、読み替えで新たに生じる講師・教室の重なりをプレビュー表示する
// (警告のみ、保存は妨げない)。削除は cascade 無しの単純削除なので
// removeWithUndo (6 秒間の取り消しトースト)。

const TIME_RANGE_RE = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

const PRESETS = Object.freeze([
  { key: "compress", label: "① 50分授業 (17:00開始)" },
  { key: "cutFirst", label: "② 1限カット" },
]);

export function DayScheduleManager({
  daySchedules,
  onSave,
  slots = [],
  timetables = [],
  isAdmin,
  editTargetId = null,
  onConsumeEditTarget,
  newEntryToken = null,
  onConsumeNewEntry,
}) {
  const formRef = useRef(null);
  const toasts = useToasts();
  const removeWithUndo = useRemoveWithUndo({ list: daySchedules, save: onSave });

  // 学年チップ: ALL_GRADES + コマに現れるその他の学年 (「附中」等の特設)。
  const gradeOptions = useMemo(() => {
    const extras = [...new Set(slots.map((s) => s.grade))].filter(
      (g) => g && !ALL_GRADES.includes(g)
    );
    extras.sort();
    return [...ALL_GRADES, ...extras];
  }, [slots]);
  const fuzokuGrades = useMemo(
    () => gradeOptions.filter((g) => g.startsWith("附")),
    [gradeOptions]
  );

  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [memo, setMemo] = useState("");
  const [targetGrades, setTargetGrades] = useState([]);
  // 時間帯ごとの編集値: { [from]: { to?: string, cancelled?: boolean } }
  const [rowEdits, setRowEdits] = useState({});
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");

  const dow = date ? dateToDay(date) : null;

  // その日に有効なコマ (時間割の適用期間で絞り、曜日一致のみ)。
  const activeSlotsForDate = useMemo(() => {
    if (!date || !dow) return [];
    return filterSlotsForDate(slots, date, timetables).filter(
      (s) => s.day === dow
    );
  }, [slots, date, dow, timetables]);

  // 対象学年のコマから時間帯一覧を導出。編集中エントリにだけ残っている
  // 時間帯 (コマ側が変わった場合) も行として保持する。
  const times = useMemo(() => {
    const base = collectTargetTimes(activeSlotsForDate, targetGrades);
    const extras = Object.keys(rowEdits).filter((t) => !base.includes(t));
    return [...base, ...extras];
  }, [activeSlotsForDate, targetGrades, rowEdits]);

  const rows = useMemo(
    () =>
      times.map((from) => ({
        from,
        to: rowEdits[from]?.to ?? "",
        cancelled: rowEdits[from]?.cancelled ?? false,
      })),
    [times, rowEdits]
  );

  // フォーム状態 → 保存形。to が空 or 元と同じ行は読み替えなし。
  const draft = useMemo(() => {
    const timeMap = [];
    const cancelTimes = [];
    for (const r of rows) {
      if (r.cancelled) {
        cancelTimes.push(r.from);
      } else if (r.to.trim() && r.to.trim() !== r.from) {
        timeMap.push({ from: r.from, to: r.to.trim() });
      }
    }
    return { timeMap, cancelTimes };
  }, [rows]);

  // 衝突プレビュー: 読み替え後に新たに生じる講師・教室の重なり。
  const conflicts = useMemo(() => {
    if (!date || draft.timeMap.length === 0) return [];
    const preview = {
      id: -1,
      date,
      label,
      targetGrades,
      timeMap: draft.timeMap,
      cancelTimes: draft.cancelTimes,
      memo: "",
    };
    return findNewConflicts(activeSlotsForDate, (s) =>
      resolveSlotDaySchedule(s, date, [preview])
    );
  }, [date, label, targetGrades, draft, activeSlotsForDate]);

  const toggleGrade = (g) => {
    setTargetGrades((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  };

  // 日付 (= 曜日) を変えたら、新しい日付のコマに無い時間帯の行編集は
  // 持ち越さない。残すと前の曜日の時間帯が extras として行に生き続け、
  // 存在しない時間帯の読み替え・休講が保存できてしまう (プリセット適用後
  // に日付を選び直すケース)。編集読込 (handleEdit) はこの経路を通らない
  // ので、コマ側が変わった既存エントリの残存時間帯はこれまで通り残る
  const handleDateChange = (value) => {
    setDate(value);
    setRowEdits((prev) => {
      const nd = value && isValidDateStr(value) ? dateToDay(value) : null;
      if (!nd) return {};
      const base = collectTargetTimes(
        filterSlotsForDate(slots, value, timetables).filter((s) => s.day === nd),
        targetGrades
      );
      const keep = {};
      for (const [from, edit] of Object.entries(prev)) {
        if (base.includes(from)) keep[from] = edit;
      }
      return keep;
    });
    if (error) setError("");
  };

  const applyPreset = (key) => {
    const grades = targetGrades.length > 0 ? targetGrades : fuzokuGrades;
    if (targetGrades.length === 0) setTargetGrades(grades);
    const base = collectTargetTimes(activeSlotsForDate, grades);
    const prefix = grades.length > 0 && grades.every((g) => g.startsWith("附")) ? "附属 " : "";
    if (key === "compress") {
      const edits = {};
      for (const m of buildCompressTimeMap(base)) {
        edits[m.from] = { to: m.to };
      }
      setRowEdits(edits);
      setLabel(`${prefix}50分授業 (17:00開始)`);
    } else if (key === "cutFirst") {
      const edits = {};
      for (const t of buildCutFirstCancelTimes(base)) {
        edits[t] = { cancelled: true };
      }
      setRowEdits(edits);
      setLabel(`${prefix}1限カット`);
    }
    setError("");
  };

  const setRowTo = (from, to) => {
    setRowEdits((prev) => ({
      ...prev,
      [from]: { ...prev[from], to, cancelled: false },
    }));
    if (error) setError("");
  };

  const toggleRowCancelled = (from) => {
    setRowEdits((prev) => {
      const cur = prev[from] || {};
      return { ...prev, [from]: cur.cancelled ? {} : { cancelled: true } };
    });
    if (error) setError("");
  };

  const resetForm = () => {
    setDate("");
    setLabel("");
    setMemo("");
    setTargetGrades([]);
    setRowEdits({});
    setEditId(null);
    setError("");
  };

  const handleAdd = () => {
    setError("");
    if (!date || !isValidDateStr(date)) {
      setError("日付を入力してください");
      return;
    }
    if (targetGrades.length === 0) {
      setError("対象学年を 1 つ以上選択してください");
      return;
    }
    if (draft.timeMap.length === 0 && draft.cancelTimes.length === 0) {
      setError("時刻の読み替えか休講を 1 つ以上指定してください");
      return;
    }
    const badTime = draft.timeMap.find((m) => !TIME_RANGE_RE.test(m.to));
    if (badTime) {
      setError(`新しい時刻「${badTime.to}」の形式が不正です (例: 17:00-17:50)`);
      return;
    }
    const entry = {
      id: editId != null ? editId : nextNumericId(daySchedules),
      date,
      label: label.trim() || "特別時程",
      targetGrades: [...targetGrades],
      timeMap: draft.timeMap,
      cancelTimes: draft.cancelTimes,
      memo: memo.trim(),
    };
    if (editId != null) {
      onSave(daySchedules.map((d) => (d.id === editId ? { ...d, ...entry } : d)));
      toasts.success("特別時程を更新しました");
    } else {
      onSave([...daySchedules, { ...entry, createdAt: new Date().toISOString() }]);
      toasts.success("特別時程を登録しました");
    }
    resetForm();
  };

  const handleEdit = (d) => {
    setDate(d.date);
    setLabel(d.label || "");
    setMemo(d.memo || "");
    setTargetGrades([...(d.targetGrades || [])]);
    const edits = {};
    for (const m of d.timeMap || []) edits[m.from] = { to: m.to };
    for (const t of d.cancelTimes || []) edits[t] = { cancelled: true };
    setRowEdits(edits);
    setEditId(d.id);
    setError("");
  };

  const handleDel = (d) => {
    removeWithUndo(d.id, {
      successMsg: `特別時程を削除しました（${d.date} ${d.label || ""}）`,
    });
  };

  useEditTarget({
    editTargetId,
    items: daySchedules,
    onEdit: handleEdit,
    onConsume: onConsumeEditTarget,
    formRef,
    isAdmin,
  });

  useNewEntryTarget({
    token: newEntryToken,
    onReset: resetForm,
    onConsume: onConsumeNewEntry,
    formRef,
    isAdmin,
  });

  const sorted = [...daySchedules].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id
  );

  const gradeChip = (g, sel, onClick) => {
    const dept = gradeToDept(g);
    const col = DEPT_COLOR[dept] || { b: "#eee", f: "#444", accent: "#ccc" };
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
          onChange={onClick}
          style={{ display: "none" }}
        />
        {g}
      </label>
    );
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>
        ⏰ 特別時程（時程変更・コマカット）
      </div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 10, lineHeight: 1.7 }}>
        学校行事などで特定日だけ時程が変わる場合に登録します（例:
        附属の 50 分授業への切替、1 限カット）。表示は各ビューで自動的に
        読み替えられ、休講にしたコマは回数（第N回）にも数えません。
      </div>
      {isAdmin && (
        <div
          ref={formRef}
          style={{
            background: "#fff",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            border: "1px solid #e0e0e0",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            {editId != null ? "特別時程を編集" : "特別時程を登録"}
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
              onChange={(e) => handleDateChange(e.target.value)}
              style={{ ...S.input, width: "auto" }}
            />
            {date && dow && (
              <span style={{ fontSize: 11, color: "#666", fontWeight: 700 }}>
                {dow}曜日
              </span>
            )}
            {date && !dow && (
              <span style={{ fontSize: 11, color: colors.danger, fontWeight: 700 }}>
                日曜日は授業日ではありません
              </span>
            )}
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="名称（例: 附属 50分授業）"
              style={{ ...S.input, width: "100%", maxWidth: 240 }}
            />
          </div>

          {/* 対象学年 */}
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700 }}>対象学年:</span>
            {fuzokuGrades.length > 0 && (
              <button
                type="button"
                onClick={() => setTargetGrades(fuzokuGrades)}
                style={{
                  ...S.btn(
                    targetGrades.length > 0 &&
                      fuzokuGrades.every((g) => targetGrades.includes(g)) &&
                      targetGrades.every((g) => fuzokuGrades.includes(g))
                  ),
                  fontSize: 11,
                  padding: "4px 10px",
                }}
              >
                附属一括
              </button>
            )}
            {gradeOptions.map((g) =>
              gradeChip(g, targetGrades.includes(g), () => toggleGrade(g))
            )}
          </div>

          {/* プリセット */}
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700 }}>プリセット:</span>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                disabled={!date || !dow}
                style={{
                  ...S.btn(false),
                  fontSize: 11,
                  padding: "4px 10px",
                  opacity: date && dow ? 1 : 0.5,
                }}
              >
                {p.label}
              </button>
            ))}
            <span style={{ fontSize: 10, color: "#888" }}>
              （学年未選択の場合は附属 {fuzokuGrades.join("・") || "-"} に適用）
            </span>
          </div>

          {/* 時間帯の読み替え表 */}
          {date && dow && targetGrades.length > 0 && (
            rows.length === 0 ? (
              <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
                この日 ({dow}曜) に対象学年のコマがありません
              </div>
            ) : (
              <div style={{ marginBottom: 10 }}>
                <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["元の時刻", "新しい時刻（空欄 = 変更なし）", "休講"].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "4px 10px",
                            borderBottom: "2px solid #ddd",
                            fontSize: 11,
                            color: "#666",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.from}>
                        <td style={{ padding: "4px 10px", fontWeight: 700 }}>
                          {r.from}
                        </td>
                        <td style={{ padding: "4px 10px" }}>
                          <input
                            value={r.to}
                            onChange={(e) => setRowTo(r.from, e.target.value)}
                            placeholder="例: 17:00-17:50"
                            disabled={r.cancelled}
                            style={{
                              ...S.input,
                              width: 130,
                              opacity: r.cancelled ? 0.4 : 1,
                            }}
                          />
                        </td>
                        <td style={{ padding: "4px 10px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={r.cancelled}
                            onChange={() => toggleRowCancelled(r.from)}
                            aria-label={`${r.from} を休講にする`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* 衝突プレビュー */}
          {conflicts.length > 0 && (
            <div
              style={{
                background: "#fdeaea",
                border: "1px solid #e0a0a0",
                borderRadius: 6,
                padding: "8px 12px",
                marginBottom: 10,
                fontSize: 11,
                lineHeight: 1.8,
              }}
            >
              <div style={{ fontWeight: 800, color: "#a02020", marginBottom: 2 }}>
                ⚠ 読み替え後に新たに生じる重なり ({conflicts.length} 件)
              </div>
              {conflicts.map((c, i) => (
                <div key={i} style={{ color: "#7a2020" }}>
                  {c.kind === "teacher" ? `講師 ${c.value}` : `教室 ${c.value}`}:{" "}
                  {c.a.grade}
                  {c.a.cls && c.a.cls !== "-" ? c.a.cls : ""} {c.a.subj} ({c.aTime})
                  <span style={{ margin: "0 4px" }}>×</span>
                  {c.b.grade}
                  {c.b.cls && c.b.cls !== "-" ? c.b.cls : ""} {c.b.subj} ({c.bTime})
                </div>
              ))}
              <div style={{ color: "#a05050", marginTop: 2 }}>
                ※ 登録は可能です。担当や教室の調整が必要か確認してください。
              </div>
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="メモ（任意。例: 体育祭前日のため）"
              style={{ ...S.input, width: "100%", maxWidth: 400 }}
            />
          </div>

          {error && (
            <div
              role="alert"
              style={{ fontSize: 11, color: colors.danger, marginBottom: 8 }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleAdd} style={S.btn(true)}>
              {editId != null ? "更新" : "登録"}
            </button>
            {editId != null && (
              <button onClick={resetForm} style={S.btn(false)}>
                キャンセル
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
        {sorted.length} 件登録
      </div>
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
            <div aria-hidden="true" style={{ fontSize: 28, marginBottom: 6 }}>⏰</div>
            <div style={{ fontWeight: 700, color: "#555", marginBottom: 4 }}>
              登録された特別時程はありません
            </div>
            {isAdmin && (
              <div style={{ fontSize: 12, color: "#888" }}>
                上のフォームで日付とプリセットを選んで登録してください
              </div>
            )}
          </div>
        ) : (
          sorted.map((d, i) => {
            const mapSummary = [
              ...(d.timeMap || []).map((m) => `${m.from}→${m.to}`),
              ...(d.cancelTimes || []).map((t) => `${t} 休講`),
            ].join(" / ");
            return (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderBottom: i < sorted.length - 1 ? "1px solid #eee" : "none",
                  background: editId === d.id ? "#fffbe6" : i % 2 ? "#f8f9fa" : "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    minWidth: 0,
                  }}
                >
                  <strong style={{ fontSize: 12, minWidth: 110 }}>
                    {fmtDateWeekday(d.date)}
                  </strong>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#4a3a8e" }}>
                    {d.label}
                  </span>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {(d.targetGrades || []).map((g) => {
                      const dept = gradeToDept(g);
                      const col = DEPT_COLOR[dept] || { b: "#eee", f: "#444" };
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
                  </div>
                  <span style={{ fontSize: 11, color: "#666" }}>{mapSummary}</span>
                  {d.memo && (
                    <span style={{ fontSize: 10, color: "#888", fontStyle: "italic" }}>
                      {d.memo}
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleEdit(d)}
                      aria-label={`${d.date} の特別時程を編集`}
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
                      onClick={() => handleDel(d)}
                      aria-label={`${d.date} の特別時程を削除`}
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
      <div style={{ marginTop: 12, fontSize: 11, color: "#888", lineHeight: 1.7 }}>
        ※ 時刻の読み替えは表示・重なりチェック用で、コマ本体は変更しません。
        個別の「コマ移動」(時間割調整) が同じコマにある場合はそちらが優先されます。
        休講にしたコマは第N回に数えません（隔週の A/B 週送りには影響しません）。
      </div>
    </div>
  );
}
