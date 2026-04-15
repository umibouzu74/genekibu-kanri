import { useMemo, useState } from "react";
import { ALL_GRADES, DAYS, DEPT_COLOR, gradeToDept } from "../data";
import { nextNumericId } from "../utils/schema";
import { S } from "../styles/common";
import { useConfirm } from "../hooks/useConfirm";
import { useToasts } from "../hooks/useToasts";

// ─── 授業セット管理 ───────────────────────────────────────────────
// 複数のスロットを「同一コース」として束ね、ダッシュボードで共通の
// 授業回数カウンタ (第①回, 第②回…) を振るためのマネージャ。
// 自動提案: (grade, room, subj) が一致する 2 つ以上のスロットを検出
// し、ワンクリックでセット化を提案する。

// 指定 slotIds 群から自動ラベルを生成。
// 例: {grade:"中3", room:"602", subj:"数学", days:["火","木"]}
//     → "中3 602 数学 (火・木)"
function autoLabel(slots) {
  if (slots.length === 0) return "";
  const grades = [...new Set(slots.map((s) => s.grade))];
  const rooms = [...new Set(slots.map((s) => s.room))];
  const subjs = [...new Set(slots.map((s) => s.subj))];
  const days = [...new Set(slots.map((s) => s.day))].sort(
    (a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)
  );
  const gPart = grades.join("/");
  const rPart = rooms.length === 1 ? rooms[0] : rooms.join("/");
  const sPart = subjs.length === 1 ? subjs[0] : subjs.join("/");
  const dPart = days.join("・");
  return `${gPart} ${rPart} ${sPart} (${dPart})`.trim();
}

// (grade, room, subj) をキーに slot を集約し、複数日に跨がる組を
// セット化候補として返す。
function buildSuggestions(slots, classSets) {
  const alreadyMapped = new Set();
  for (const cs of classSets) for (const id of cs.slotIds) alreadyMapped.add(id);

  const groups = new Map();
  for (const s of slots) {
    if (alreadyMapped.has(s.id)) continue;
    const key = `${s.grade}|${s.room}|${s.subj}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const suggestions = [];
  for (const [key, ss] of groups) {
    // Only propose when slots span 2+ distinct days (truly a "set")
    const distinctDays = new Set(ss.map((s) => s.day));
    if (distinctDays.size < 2) continue;
    suggestions.push({
      key,
      slots: ss.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day)),
      label: autoLabel(ss),
    });
  }
  return suggestions.sort((a, b) => a.label.localeCompare(b.label, "ja"));
}

export function ClassSetManager({ classSets, slots, onSave, isAdmin }) {
  const [selectedSlotIds, setSelectedSlotIds] = useState([]);
  const [label, setLabel] = useState("");
  const [editId, setEditId] = useState(null);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(true);

  const toasts = useToasts();
  const confirm = useConfirm();

  // Slot id → ClassSet lookup
  const slotToSet = useMemo(() => {
    const m = new Map();
    for (const cs of classSets) {
      for (const id of cs.slotIds) m.set(id, cs);
    }
    return m;
  }, [classSets]);

  const suggestions = useMemo(
    () => buildSuggestions(slots, classSets),
    [slots, classSets]
  );

  // Filtered slot list for selection panel
  const filteredSlots = useMemo(() => {
    let out = slots;
    if (gradeFilter !== "all") {
      if (gradeFilter === "中学部" || gradeFilter === "高校部") {
        out = out.filter((s) => gradeToDept(s.grade) === gradeFilter);
      } else {
        out = out.filter((s) => s.grade === gradeFilter);
      }
    }
    if (showOnlyUnassigned && !editId) {
      out = out.filter((s) => !slotToSet.has(s.id));
    }
    return [...out].sort((a, b) => {
      if (a.grade !== b.grade) return a.grade.localeCompare(b.grade);
      if (a.day !== b.day) return DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
      return a.time.localeCompare(b.time);
    });
  }, [slots, gradeFilter, showOnlyUnassigned, slotToSet, editId]);

  const resetForm = () => {
    setSelectedSlotIds([]);
    setLabel("");
    setEditId(null);
  };

  const toggleSlot = (id) => {
    setSelectedSlotIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSaveSet = () => {
    if (selectedSlotIds.length < 1) {
      toasts.error("スロットを選択してください");
      return;
    }
    const finalLabel =
      label.trim() ||
      autoLabel(slots.filter((s) => selectedSlotIds.includes(s.id)));

    if (editId != null) {
      const next = classSets.map((cs) =>
        cs.id === editId
          ? { ...cs, label: finalLabel, slotIds: [...selectedSlotIds] }
          : cs
      );
      onSave(next);
      toasts.success("授業セットを更新しました");
    } else {
      // Remove any overlapping slotIds from other sets (each slot can be in 0 or 1 set)
      const cleaned = classSets.map((cs) => ({
        ...cs,
        slotIds: cs.slotIds.filter((id) => !selectedSlotIds.includes(id)),
      }));
      const next = [
        ...cleaned.filter((cs) => cs.slotIds.length > 0),
        {
          id: nextNumericId(classSets),
          label: finalLabel,
          slotIds: [...selectedSlotIds],
        },
      ];
      onSave(next);
      toasts.success("授業セットを登録しました");
    }
    resetForm();
  };

  const handleEdit = (cs) => {
    setEditId(cs.id);
    setLabel(cs.label);
    setSelectedSlotIds([...cs.slotIds]);
  };

  const handleDelete = async (cs) => {
    const ok = await confirm({
      title: "授業セットの削除",
      message: `「${cs.label}」を削除しますか？`,
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    onSave(classSets.filter((x) => x.id !== cs.id));
    toasts.success("授業セットを削除しました");
  };

  const handleAcceptSuggestion = (sug) => {
    const next = [
      ...classSets,
      {
        id: nextNumericId(classSets),
        label: sug.label,
        slotIds: sug.slots.map((s) => s.id),
      },
    ];
    onSave(next);
    toasts.success(`「${sug.label}」を登録しました`);
  };

  const describeSlot = (s) =>
    `${s.grade} ${s.day} ${s.time} ${s.room} ${s.subj}${s.teacher ? ` (${s.teacher})` : ""}`;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #e0e0e0",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e0e0e0",
          background: "#fafafa",
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 14 }}>授業セット</span>
        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
          同一コース (例: 中3 数学 火・木) として扱うスロットをまとめます。
          ダッシュボードで共通の授業回数カウンタ (第①回, 第②回…) が振られます。
          未登録のスロットは単体で 1 セット扱いです。
        </div>
      </div>

      {/* 登録済みセット一覧 */}
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#555" }}>
          登録済み ({classSets.length}件)
        </div>
        {classSets.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#bbb",
              padding: 20,
              fontSize: 12,
              background: "#f8f9fa",
              borderRadius: 6,
            }}
          >
            まだ授業セットが登録されていません
          </div>
        ) : (
          classSets.map((cs) => {
            const setSlots = cs.slotIds
              .map((id) => slots.find((s) => s.id === id))
              .filter(Boolean);
            const dept = setSlots[0] ? gradeToDept(setSlots[0].grade) : null;
            const col = dept ? DEPT_COLOR[dept] : { b: "#eee", f: "#444", accent: "#aaa" };
            return (
              <div
                key={cs.id}
                style={{
                  padding: "8px 12px",
                  background: editId === cs.id ? "#fffbe6" : "#f8f9fa",
                  border: `1px solid ${editId === cs.id ? "#e0c060" : "#e8e8e8"}`,
                  borderRadius: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: col.accent,
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{cs.label}</span>
                    <span style={{ fontSize: 10, color: "#888" }}>
                      {setSlots.length} / {cs.slotIds.length} コマ
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "#666", lineHeight: 1.5 }}>
                    {setSlots.map((s) => describeSlot(s)).join(" / ")}
                    {setSlots.length < cs.slotIds.length && (
                      <span style={{ color: "#c44" }}> ※ 一部スロット削除済み</span>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleEdit(cs)}
                      aria-label={`${cs.label} を編集`}
                      style={{ ...S.btn(false), fontSize: 10, padding: "3px 8px" }}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(cs)}
                      aria-label={`${cs.label} を削除`}
                      style={{
                        ...S.btn(false),
                        fontSize: 10,
                        padding: "3px 8px",
                        color: "#c44",
                      }}
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 自動提案 */}
      {isAdmin && suggestions.length > 0 && (
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid #e0e0e0",
            background: "#f0f7ff",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "#2a4a8e", marginBottom: 6 }}>
            💡 自動提案 ({suggestions.length}件)
          </div>
          <div style={{ fontSize: 10, color: "#666", marginBottom: 8 }}>
            同じ (学年・教室・科目) で複数曜日に跨がるスロットが見つかりました。
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {suggestions.slice(0, 20).map((sug) => (
              <div
                key={sug.key}
                style={{
                  padding: "6px 10px",
                  background: "#fff",
                  borderRadius: 4,
                  border: "1px solid #d0dff0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{sug.label}</div>
                  <div style={{ fontSize: 9, color: "#888" }}>
                    {sug.slots.map((s) => `${s.day} ${s.time}`).join(" / ")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAcceptSuggestion(sug)}
                  style={{
                    ...S.btn(true),
                    fontSize: 10,
                    padding: "3px 10px",
                    background: "#2a4a8e",
                  }}
                >
                  登録
                </button>
              </div>
            ))}
            {suggestions.length > 20 && (
              <div style={{ fontSize: 10, color: "#888", textAlign: "center" }}>
                他 {suggestions.length - 20} 件
              </div>
            )}
          </div>
        </div>
      )}

      {/* 手動登録・編集フォーム */}
      {isAdmin && (
        <div
          style={{
            padding: 16,
            borderTop: "1px solid #e0e0e0",
            background: "#fafafa",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            {editId != null ? "授業セットを編集" : "授業セットを手動登録"}
          </div>

          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ラベル (空欄で自動生成)"
            style={{ ...S.input, width: "100%", marginBottom: 8 }}
          />

          {/* Filter controls */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>絞込:</span>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              style={{ ...S.input, width: "auto", fontSize: 11, padding: "3px 6px" }}
            >
              <option value="all">全学年</option>
              <option value="中学部">中学部</option>
              <option value="高校部">高校部</option>
              {ALL_GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
              <input
                type="checkbox"
                checked={showOnlyUnassigned}
                onChange={(e) => setShowOnlyUnassigned(e.target.checked)}
              />
              未登録スロットのみ表示
            </label>
            <span style={{ fontSize: 10, color: "#888", marginLeft: "auto" }}>
              選択中: {selectedSlotIds.length} コマ
            </span>
          </div>

          {/* Slot selection list */}
          <div
            style={{
              maxHeight: 280,
              overflowY: "auto",
              border: "1px solid #e0e0e0",
              borderRadius: 4,
              background: "#fff",
              marginBottom: 8,
            }}
          >
            {filteredSlots.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "#aaa", fontSize: 11 }}>
                該当スロットなし
              </div>
            ) : (
              filteredSlots.map((s) => {
                const selected = selectedSlotIds.includes(s.id);
                const assignedSet = slotToSet.get(s.id);
                const isOwnSet = editId != null && assignedSet?.id === editId;
                const occupied = assignedSet && !isOwnSet;
                return (
                  <label
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px",
                      borderBottom: "1px solid #f0f0f0",
                      fontSize: 11,
                      cursor: "pointer",
                      background: selected ? "#e8f4ff" : occupied ? "#f8f8f8" : "#fff",
                      color: occupied ? "#888" : "#333",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSlot(s.id)}
                    />
                    <span style={{ flex: 1 }}>{describeSlot(s)}</span>
                    {occupied && (
                      <span style={{ fontSize: 9, color: "#c84" }}>
                        別セット: {assignedSet.label}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={handleSaveSet}
              disabled={selectedSlotIds.length < 1}
              style={{
                ...S.btn(true),
                opacity: selectedSlotIds.length < 1 ? 0.5 : 1,
              }}
            >
              {editId != null ? "更新" : "セットとして登録"}
            </button>
            {editId != null && (
              <button type="button" onClick={resetForm} style={S.btn(false)}>
                キャンセル
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
