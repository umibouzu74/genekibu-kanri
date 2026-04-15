import { useMemo, useState } from "react";
import { ALL_GRADES, DAYS, DEPT_COLOR, gradeToDept } from "../data";
import { nextNumericId } from "../utils/schema";
import { S } from "../styles/common";
import { useConfirm } from "../hooks/useConfirm";
import { useToasts } from "../hooks/useToasts";

// ─── 授業セット管理 ───────────────────────────────────────────────
// 複数のスロットを「同一コース」として束ね、ダッシュボードで共通の
// 授業回数カウンタ (第①回, 第②回…) を振るためのマネージャ。
//
// ユーザーは "クラスユニット" = (学年, 曜日) 単位で選択する。
// 例: 「火曜日 中3」をクリック → その学年 × 曜日 の全コマ (cohort 横断、
// 合同コマ含む) を一括選択。
// 複数ユニットを選んで「セットとして登録」すると、それらのコマが 1 つの
// 進度カウンタを共有する。
// 進度は内部で (教科, cohort=cls) 別に独立カウントされるため、同セット内
// で並行する別 cohort の同教科は混ざらない。

// クラスユニットのキー: (学年, 曜日)
function unitKeyOf(slot) {
  return `${slot.grade}|${slot.day}`;
}

// slots → ClassUnit[]
function buildClassUnits(slots) {
  const units = new Map();
  for (const s of slots) {
    const key = unitKeyOf(s);
    if (!units.has(key)) {
      units.set(key, {
        key,
        grade: s.grade,
        day: s.day,
        slots: [],
      });
    }
    units.get(key).slots.push(s);
  }
  for (const u of units.values()) {
    u.slots.sort((a, b) => a.time.localeCompare(b.time));
  }
  return [...units.values()];
}

// ユニット表示ラベル: "火 中3"
function unitLabel(unit) {
  return `${unit.day} ${unit.grade}`;
}

// 指定されたユニット群から自動ラベルを生成。
// 例: {grade:"中3", days:["火","木"]} → "中3 (火・木)"
function autoLabelFromUnits(units) {
  if (units.length === 0) return "";
  const grades = [...new Set(units.map((u) => u.grade))];
  const days = [...new Set(units.map((u) => u.day))].sort(
    (a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)
  );
  const gPart = grades.join("/");
  const dPart = days.join("・");
  return `${gPart} (${dPart})`.trim();
}

// 自動提案: 各学年内で「同じ曜日セット」を持つ cohort 群をひとまとめにし、
// (学年, 曜日ペア) 単位で提案する。
// 例: 中3 SS/S/A/B が火木に出現 → "中3 (火・木)" 提案
//      中3 C が水金に出現 → "中3 (水・金)" 提案
// 同学年内で複数の曜日パターンが重複曜日を含む場合、ユニット数が大きい
// (= カバレッジが広い) 提案を優先表示する。
export function buildSuggestions(allUnits, classSets, allSlots) {
  const alreadyMapped = new Set();
  for (const cs of classSets) for (const id of cs.slotIds) alreadyMapped.add(id);

  // 完全未マップのユニット (= 学年×曜日) だけ対象
  const freeUnits = allUnits.filter((u) =>
    u.slots.every((s) => !alreadyMapped.has(s.id))
  );

  // 学年ごとに cohort (cls or room) → 出現曜日セット を集計
  const gradeCohortDays = new Map(); // grade → Map<cohortId, Set<day>>
  const freeKeys = new Set(freeUnits.map((u) => u.key));
  for (const s of allSlots) {
    const k = `${s.grade}|${s.day}`;
    if (!freeKeys.has(k)) continue;
    const cohortId = (s.cls && s.cls.trim()) || s.room || "";
    if (!gradeCohortDays.has(s.grade)) gradeCohortDays.set(s.grade, new Map());
    const cohortMap = gradeCohortDays.get(s.grade);
    if (!cohortMap.has(cohortId)) cohortMap.set(cohortId, new Set());
    cohortMap.get(cohortId).add(s.day);
  }

  const suggestions = [];
  for (const [grade, cohortMap] of gradeCohortDays) {
    // 同じ曜日セット文字列ごとに cohort をグルーピング
    const dayPatternGroups = new Map(); // sortedDayKey → cohortIds[]
    for (const [cohortId, daySet] of cohortMap) {
      if (daySet.size < 2) continue; // 単日の cohort はセット化対象外
      const sortedDays = [...daySet].sort(
        (a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)
      );
      const dayKey = sortedDays.join(",");
      if (!dayPatternGroups.has(dayKey)) dayPatternGroups.set(dayKey, []);
      dayPatternGroups.get(dayKey).push(cohortId);
    }

    // 各曜日パターンごとに、その学年×その曜日群のユニット (横断) を集約して提案
    for (const dayKey of dayPatternGroups.keys()) {
      const days = dayKey.split(",");
      const units = freeUnits.filter(
        (u) => u.grade === grade && days.includes(u.day)
      );
      if (units.length === 0) continue;
      const sortedUnits = [...units].sort(
        (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
      );
      // ユニット内 slot 総数 (カバレッジ) を保持してソートに使う
      const slotCount = sortedUnits.reduce((acc, u) => acc + u.slots.length, 0);
      suggestions.push({
        key: `${grade}|${dayKey}`,
        units: sortedUnits,
        label: autoLabelFromUnits(sortedUnits),
        slotCount,
      });
    }
  }
  // カバレッジが広い (slotCount 大) ものを先に提示 → 先に登録すれば
  // 重複曜日を含む細かい提案は freeUnits から自動的に外れる。
  // 同カバレッジは label の自然順で安定ソート。
  return suggestions.sort((a, b) => {
    if (a.slotCount !== b.slotCount) return b.slotCount - a.slotCount;
    return a.label.localeCompare(b.label, "ja");
  });
}

export function ClassSetManager({ classSets, slots, onSave, isAdmin }) {
  const [selectedUnitKeys, setSelectedUnitKeys] = useState([]);
  const [label, setLabel] = useState("");
  const [editId, setEditId] = useState(null);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState("all");
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState(new Set());

  const toasts = useToasts();
  const confirm = useConfirm();

  // 全ユニット (フィルタ前)
  const allUnits = useMemo(() => buildClassUnits(slots), [slots]);

  // slotId → ClassSet lookup
  const slotToSet = useMemo(() => {
    const m = new Map();
    for (const cs of classSets) {
      for (const id of cs.slotIds) m.set(id, cs);
    }
    return m;
  }, [classSets]);

  // ユニットの登録状態: "unassigned" | "owned" | "other" | "partial"
  // (編集中のセットに全部入っているかで判定)
  const unitStatus = (unit) => {
    const inCurrent = unit.slots.every(
      (s) => slotToSet.get(s.id)?.id === editId
    );
    const anyAssigned = unit.slots.some((s) => slotToSet.has(s.id));
    const allAssigned = unit.slots.every((s) => slotToSet.has(s.id));
    if (!anyAssigned) return "unassigned";
    if (inCurrent && editId != null) return "owned";
    if (allAssigned) {
      // All assigned, but to multiple or non-current set
      const setIds = new Set(
        unit.slots.map((s) => slotToSet.get(s.id)?.id).filter(Boolean)
      );
      if (setIds.size === 1) return "other";
      return "partial";
    }
    return "partial";
  };

  const suggestions = useMemo(
    () => buildSuggestions(allUnits, classSets, slots),
    [allUnits, classSets, slots]
  );

  // フィルタ適用済みユニット
  const filteredUnits = useMemo(() => {
    let out = allUnits;
    if (gradeFilter !== "all") {
      if (gradeFilter === "中学部" || gradeFilter === "高校部") {
        out = out.filter((u) => gradeToDept(u.grade) === gradeFilter);
      } else {
        out = out.filter((u) => u.grade === gradeFilter);
      }
    }
    if (dayFilter !== "all") {
      out = out.filter((u) => u.day === dayFilter);
    }
    if (showOnlyUnassigned && editId == null) {
      out = out.filter((u) => unitStatus(u) === "unassigned");
    }
    return [...out].sort((a, b) => {
      if (a.grade !== b.grade) return a.grade.localeCompare(b.grade);
      return DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
    });
    // unitStatus depends on slotToSet + editId, already in deps via allUnits/classSets/editId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUnits, gradeFilter, dayFilter, showOnlyUnassigned, slotToSet, editId]);

  const selectedUnits = useMemo(
    () => allUnits.filter((u) => selectedUnitKeys.includes(u.key)),
    [allUnits, selectedUnitKeys]
  );
  const selectedSlotIds = useMemo(
    () => selectedUnits.flatMap((u) => u.slots.map((s) => s.id)),
    [selectedUnits]
  );

  const resetForm = () => {
    setSelectedUnitKeys([]);
    setLabel("");
    setEditId(null);
    setExpandedKeys(new Set());
  };

  const toggleUnit = (key) => {
    setSelectedUnitKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleExpand = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSaveSet = () => {
    if (selectedSlotIds.length < 1) {
      toasts.error("クラスユニットを選択してください");
      return;
    }
    const finalLabel = label.trim() || autoLabelFromUnits(selectedUnits);

    if (editId != null) {
      // 編集モード: 他セットからは selectedSlotIds を剥がし、編集対象セットは
      // 上書きする (各スロットは 0 or 1 set を守る)
      const next = classSets
        .map((cs) =>
          cs.id === editId
            ? { ...cs, label: finalLabel, slotIds: [...selectedSlotIds] }
            : { ...cs, slotIds: cs.slotIds.filter((id) => !selectedSlotIds.includes(id)) }
        )
        .filter((cs) => cs.id === editId || cs.slotIds.length > 0);
      onSave(next);
      toasts.success("授業セットを更新しました");
    } else {
      // 既存セットに含まれるスロットは剥がす (各スロットは 0 or 1 set)
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
    // 編集対象のセットに属するスロットを持つユニットを選択状態に
    const slotIdSet = new Set(cs.slotIds);
    const ownedUnitKeys = allUnits
      .filter((u) => u.slots.some((s) => slotIdSet.has(s.id)))
      .map((u) => u.key);
    setSelectedUnitKeys(ownedUnitKeys);
    setExpandedKeys(new Set());
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
    const slotIds = sug.units.flatMap((u) => u.slots.map((s) => s.id));
    const next = [
      ...classSets,
      {
        id: nextNumericId(classSets),
        label: sug.label,
        slotIds,
      },
    ];
    onSave(next);
    toasts.success(`「${sug.label}」を登録しました`);
  };

  const describeSlot = (s) =>
    `${s.time} ${s.subj}${s.teacher ? ` (${s.teacher})` : ""}${s.room ? ` / ${s.room}` : ""}`;

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
          学年 × 曜日ペア (例: 中3 の 火・木) として扱うクラスユニットを
          まとめます。ダッシュボードで共通の授業回数カウンタ (第①回, 第②回…)
          が振られます。進度は内部で (教科, クラス) 別に独立カウントされる
          ため、合同コマや並行する別クラスの同教科は混ざりません。
          未登録のスロットは単体で 1 セット扱いです。
        </div>
      </div>

      {/* 移行ガイダンス: 旧設計 (cohort 単位セット) からの移行案内 */}
      {isAdmin && classSets.length > 0 && (
        <div
          style={{
            padding: "10px 16px",
            background: "#fff8e0",
            borderBottom: "1px solid #f0e0a0",
            fontSize: 11,
            color: "#7a6020",
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 2 }}>
            ⚠️ 設計変更のお知らせ
          </div>
          授業セットの粒度が「(学年, 曜日)」に変わりました。旧形式
          (cohort ごとのセット) は引き続き動きますが、合同コマを正しく
          含めるには <strong>登録済みセットを一旦削除し、自動提案から
          再登録</strong> してください。新形式では「中3 (火・木)」の
          ように cohort 横断で 1 セットになります。
        </div>
      )}

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
            const col = dept
              ? DEPT_COLOR[dept]
              : { b: "#eee", f: "#444", accent: "#aaa" };
            // 所属ユニットを逆引き
            const setUnits = [];
            const seen = new Set();
            for (const s of setSlots) {
              const k = unitKeyOf(s);
              if (seen.has(k)) continue;
              seen.add(k);
              const u = allUnits.find((x) => x.key === k);
              if (u) setUnits.push(u);
            }
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
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
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
                      {setUnits.length} ユニット / {setSlots.length} コマ
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "#666", lineHeight: 1.6 }}>
                    {setUnits.map((u) => (
                      <span
                        key={u.key}
                        style={{
                          display: "inline-block",
                          marginRight: 8,
                          padding: "1px 6px",
                          background: "#fff",
                          border: "1px solid #e0e0e0",
                          borderRadius: 10,
                        }}
                      >
                        {unitLabel(u)}
                      </span>
                    ))}
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
          <div
            style={{ fontSize: 12, fontWeight: 700, color: "#2a4a8e", marginBottom: 6 }}
          >
            💡 自動提案 ({suggestions.length}件)
          </div>
          <div style={{ fontSize: 10, color: "#666", marginBottom: 8 }}>
            同じ (学年・クラス) が複数曜日に出現するパターンを検出しました。
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {suggestions.slice(0, 30).map((sug) => (
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
                    {sug.units.map((u) => unitLabel(u)).join(" + ")}
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
            {suggestions.length > 30 && (
              <div style={{ fontSize: 10, color: "#888", textAlign: "center" }}>
                他 {suggestions.length - 30} 件
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

          {/* フィルタ */}
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginBottom: 8,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700 }}>絞込:</span>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              style={{
                ...S.input,
                width: "auto",
                fontSize: 11,
                padding: "3px 6px",
              }}
            >
              <option value="all">全学年</option>
              <option value="中学部">中学部</option>
              <option value="高校部">高校部</option>
              {ALL_GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              style={{
                ...S.input,
                width: "auto",
                fontSize: 11,
                padding: "3px 6px",
              }}
            >
              <option value="all">全曜日</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <label
              style={{
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <input
                type="checkbox"
                checked={showOnlyUnassigned}
                onChange={(e) => setShowOnlyUnassigned(e.target.checked)}
                disabled={editId != null}
              />
              未登録のみ表示
            </label>
            <span
              style={{ fontSize: 10, color: "#888", marginLeft: "auto" }}
            >
              選択中: {selectedUnitKeys.length} ユニット / {selectedSlotIds.length} コマ
            </span>
          </div>

          {/* クラスユニット一覧 */}
          <div
            style={{
              maxHeight: 420,
              overflowY: "auto",
              border: "1px solid #e0e0e0",
              borderRadius: 4,
              background: "#fff",
              marginBottom: 8,
            }}
          >
            {filteredUnits.length === 0 ? (
              <div
                style={{
                  padding: 20,
                  textAlign: "center",
                  color: "#aaa",
                  fontSize: 11,
                }}
              >
                該当するクラスユニットがありません
              </div>
            ) : (
              filteredUnits.map((u) => {
                const selected = selectedUnitKeys.includes(u.key);
                const status = unitStatus(u);
                const occupied = status === "other" || status === "partial";
                const expanded = expandedKeys.has(u.key);
                const dept = gradeToDept(u.grade);
                const col = dept ? DEPT_COLOR[dept] : { b: "#eee", f: "#444", accent: "#aaa" };
                return (
                  <div
                    key={u.key}
                    style={{
                      borderBottom: "1px solid #f0f0f0",
                      background: selected
                        ? "#e8f4ff"
                        : occupied
                          ? "#f8f8f8"
                          : "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleUnit(u.key)}
                        aria-label={`${unitLabel(u)} を選択`}
                      />
                      <span
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: col.accent,
                          flexShrink: 0,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => toggleExpand(u.key)}
                        style={{
                          flex: 1,
                          textAlign: "left",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#333",
                          minWidth: 0,
                        }}
                      >
                        <span>{unitLabel(u)}</span>
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            color: "#888",
                            fontWeight: 400,
                          }}
                        >
                          {u.slots.length}コマ {expanded ? "▲" : "▼"}
                        </span>
                      </button>
                      {occupied && (
                        <span
                          style={{
                            fontSize: 9,
                            color: "#c84",
                            flexShrink: 0,
                          }}
                        >
                          別セットに登録済み
                        </span>
                      )}
                      {status === "owned" && (
                        <span
                          style={{
                            fontSize: 9,
                            color: "#4a8a4a",
                            flexShrink: 0,
                          }}
                        >
                          このセット
                        </span>
                      )}
                    </div>
                    {expanded && (
                      <div
                        style={{
                          padding: "4px 10px 10px 38px",
                          fontSize: 11,
                          color: "#555",
                          background: "#fafbfc",
                        }}
                      >
                        {u.slots.map((s) => (
                          <div
                            key={s.id}
                            style={{
                              padding: "2px 0",
                              borderBottom: "1px dotted #eee",
                            }}
                          >
                            {describeSlot(s)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
