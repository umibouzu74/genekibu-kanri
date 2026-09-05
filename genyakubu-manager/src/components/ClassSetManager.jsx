import { useMemo, useState } from "react";
import { ALL_GRADES, DAYS, DEPT_COLOR, gradeToDept } from "../data";
import { nextNumericId } from "../utils/schema";
import { S } from "../styles/common";
import { useConfirm } from "../hooks/useConfirm";
import { useToasts } from "../hooks/useToasts";
import { useRemoveWithUndo } from "../hooks/useCrudResource";
import {
  autoLabelFromUnits,
  buildClassUnits,
  buildDaySplitSuggestions,
  buildSuggestions,
  unitLabel,
} from "../utils/classSetSuggestions";
import {
  expandClassSetSlotIds,
  isLegacySet,
  unitKey,
  unitsFromSlotIds,
} from "../utils/classSets";
import { ClassSetList } from "./classSet/ClassSetList";
import { ClassSetSuggestions } from "./classSet/ClassSetSuggestions";

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
//
// セットは (学年, 曜日) の組 (units) として保存する。コマ id を参照しないので
// 期切替 (前期→後期) でコマを作り直しても紐付けが切れない。旧形式
// (slotIds 直参照) のセットも読めるが、一覧に「旧形式」バッジを出し
// 「曜日ベースに変換」で移行できるようにしてある。
//
// 純粋ロジック (ユニット構築・自動提案・曜日分割の候補) は
// ../utils/classSetSuggestions.js / ../utils/classSets.js へ分離。
// ここでは UI 状態遷移に集中。

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
  const removeClassSetWithUndo = useRemoveWithUndo({
    list: classSets,
    save: onSave,
  });

  // 全ユニット (フィルタ前)
  const allUnits = useMemo(() => buildClassUnits(slots), [slots]);

  // slotId → ClassSet lookup
  const slotToSet = useMemo(() => {
    const m = new Map();
    for (const cs of classSets) {
      // units 形式は (学年, 曜日) → 現存コマへ毎回展開する
      for (const id of expandClassSetSlotIds(cs, slots)) {
        if (!m.has(id)) m.set(id, cs);
      }
    }
    return m;
  }, [classSets, slots]);

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

  // 週 4 日ある学年を「火木 / 水金」のように 2 コースへ分ける候補。
  // 分かれているのに 1 コース扱いのままだと、水曜の第1回が火曜の続きの
  // 第2回として数えられてしまう。
  const splitSuggestions = useMemo(
    () => buildDaySplitSuggestions(allUnits, classSets, slots),
    [allUnits, classSets, slots]
  );

  // 旧形式 (コマ id 直参照) のセット。期切替で紐付けが切れる。
  const legacySets = useMemo(() => classSets.filter(isLegacySet), [classSets]);

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

  // 選択中のユニットを他セットから剥がす (各コマは 0 or 1 セット)。
  // units 形式は (学年, 曜日) 単位、旧 slotIds 形式はコマ id 単位で外す。
  const detachUnits = (sets, unitKeys, keepId) => {
    const dropIds = new Set(
      allUnits
        .filter((u) => unitKeys.includes(u.key))
        .flatMap((u) => u.slots.map((s) => s.id))
    );
    return sets
      .map((cs) => {
        if (cs.id === keepId) return cs;
        if (isLegacySet(cs)) {
          return { ...cs, slotIds: cs.slotIds.filter((id) => !dropIds.has(id)) };
        }
        return {
          ...cs,
          units: (cs.units || []).filter(
            (u) => !unitKeys.includes(unitKey(u.grade, u.day))
          ),
        };
      })
      .filter(
        (cs) =>
          cs.id === keepId ||
          (isLegacySet(cs) ? cs.slotIds.length > 0 : (cs.units || []).length > 0)
      );
  };

  const handleSaveSet = () => {
    if (selectedUnits.length < 1) {
      toasts.error("クラスユニットを選択してください");
      return;
    }
    const finalLabel = label.trim() || autoLabelFromUnits(selectedUnits);
    const units = selectedUnits.map((u) => ({ grade: u.grade, day: u.day }));

    if (editId != null) {
      const next = detachUnits(classSets, selectedUnitKeys, editId).map((cs) =>
        cs.id === editId
          ? { id: cs.id, label: finalLabel, units }
          : cs
      );
      onSave(next);
      toasts.success("授業セットを更新しました");
    } else {
      const next = [
        ...detachUnits(classSets, selectedUnitKeys, null),
        { id: nextNumericId(classSets), label: finalLabel, units },
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
    const slotIdSet = new Set(expandClassSetSlotIds(cs, slots));
    const ownedUnitKeys = allUnits
      .filter((u) => u.slots.some((s) => slotIdSet.has(s.id)))
      .map((u) => u.key);
    setSelectedUnitKeys(ownedUnitKeys);
    setExpandedKeys(new Set());
  };

  const handleDelete = (cs) => {
    removeClassSetWithUndo(cs.id, {
      successMsg: `授業セット「${cs.label}」を削除しました`,
    });
  };

  const handleAcceptSuggestion = (sug) => {
    const next = [
      ...classSets,
      {
        id: nextNumericId(classSets),
        label: sug.label,
        units: sug.units.map((u) => ({ grade: u.grade, day: u.day })),
      },
    ];
    onSave(next);
    toasts.success(`「${sug.label}」を登録しました`);
  };

  // 曜日分割の候補を採用 → 1 クリックで複数セット (火木 / 水金) を作る
  const handleAcceptSplit = (sug) => {
    let nextId = nextNumericId(classSets);
    const added = sug.groups.map((g) => ({
      id: nextId++,
      label: g.label,
      units: g.units.map((u) => ({ grade: u.grade, day: u.day })),
    }));
    onSave([...classSets, ...added]);
    toasts.success(
      `${added.map((cs) => `「${cs.label}」`).join(" / ")} を登録しました`
    );
  };

  // 旧形式 (コマ id 直参照) が指しているコマ数と、(学年, 曜日) へ変換した
  // あとに含まれるコマ数。旧いセットが「その曜日の一部のクラスだけ」を
  // 指している場合、変換すると同じ学年・曜日の他クラスまで入って第N回の
  // 数え方が変わるので、画面と確認ダイアログの両方で件数を出す。
  const legacyConversion = (cs) => {
    const units = unitsFromSlotIds(cs.slotIds, slots);
    const idSet = new Set(cs.slotIds);
    return {
      units,
      before: slots.filter((s) => idSet.has(s.id)).length,
      after: expandClassSetSlotIds({ units }, slots).length,
    };
  };

  const handleConvertLegacy = async (cs) => {
    const { units, before, after } = legacyConversion(cs);
    if (units.length === 0) {
      toasts.error(
        `「${cs.label}」の対象コマが見つかりません（削除済みのコマだけを指しています）`
      );
      return;
    }
    if (after > before) {
      const ok = await confirm({
        title: "曜日ベースに変換",
        message:
          `「${cs.label}」を ${units.map((u) => `${u.grade} ${u.day}`).join("・")} ` +
          `のセットにします。\n` +
          `・対象が ${before} コマ → ${after} コマに増えます` +
          `（同じ学年・曜日の他のクラスも同じセットに入ります）\n` +
          `・第N回の数え方が変わる場合があります\n\n` +
          `変換しますか？`,
        okLabel: "変換する",
      });
      if (!ok) return;
    }
    onSave(
      classSets.map((x) =>
        x.id === cs.id ? { id: x.id, label: x.label, units } : x
      )
    );
    toasts.success(`「${cs.label}」を曜日ベースに変換しました`);
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
        <div style={{ fontSize: 11, color: "#888", marginTop: 2, lineHeight: 1.7 }}>
          「同じ生徒が通う一続きの授業」を <strong>学年 × 曜日</strong> で
          まとめます (例: 中3 の 火・木)。まとめたコマには共通の授業回数カウンタ
          (第①回, 第②回…) が振られます。進度は内部で (教科, クラス) 別に
          独立カウントされるので、合同コマや並行する別クラスの同教科は
          混ざりません。曜日で書くため
          <strong>期切替 (1学期 → 2学期) をしても作り直し不要</strong>です。
          <div style={{ marginTop: 4 }}>
            未登録のコマは既定の「コース」（終講日コホートと同じ単位。高1・2 は
            学校の英数、中学は<strong>学年の平日ぜんぶで 1 コース</strong>）として
            自動集計されます。週内で火木コース / 水金コースのように分かれる学年は、
            分けて登録しないと<strong>水曜の第1回が火曜の続き (第2回) として
            数えられます</strong>。
          </div>
        </div>
      </div>

      {/* 旧形式 (コマ id 直参照) のセットが残っている場合の移行案内 */}
      {isAdmin && legacySets.length > 0 && (
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
            ⚠️ 旧形式のセットが {legacySets.length} 件あります
          </div>
          コマ id を直接指しているため、<strong>期切替 (1学期→2学期) で
          新しいコマを作ると紐付けが切れます</strong>。下の一覧の
          「曜日ベースに変換」を押すと (学年, 曜日) 指定に変わり、
          以降の期切替では作り直し不要になります。
        </div>
      )}

      {/* 登録済みセット一覧 */}
      <ClassSetList
        classSets={classSets}
        slots={slots}
        editId={editId}
        isAdmin={isAdmin}
        legacyConversion={legacyConversion}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onConvertLegacy={handleConvertLegacy}
      />

      {/* コース分けの候補 + 自動提案 */}
      <ClassSetSuggestions
        isAdmin={isAdmin}
        splitSuggestions={splitSuggestions}
        suggestions={suggestions}
        onAcceptSplit={handleAcceptSplit}
        onAcceptSuggestion={handleAcceptSuggestion}
      />

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
