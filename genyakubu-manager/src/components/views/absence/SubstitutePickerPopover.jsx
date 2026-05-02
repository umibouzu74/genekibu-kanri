import { useEffect, useMemo, useRef, useState } from "react";
import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";
import { sortJa } from "../../../utils/sortJa";
import { pickSubjectId } from "../../../utils/subjectMatch";

// ─── 代行ピッカーポップオーバー ───────────────────────────────
// 欠勤組み換え UI 用の簡易ピッカー。
// 指定コマの教科に担当可能な先生を優先表示し、"全員表示" で常勤含め全員から選べる。

function computePosition(anchorRect) {
  const popoverWidth = Math.min(280, window.innerWidth - 16);
  const popoverMaxHeight = Math.min(360, window.innerHeight - 24);
  const top = anchorRect.bottom + 4;
  const left = Math.max(
    8,
    Math.min(anchorRect.left, window.innerWidth - popoverWidth - 8)
  );
  const maxTop = window.innerHeight - popoverMaxHeight - 8;
  return {
    top: top > maxTop ? Math.max(8, anchorRect.top - popoverMaxHeight - 4) : top,
    left,
  };
}

export function SubstitutePickerPopover({
  anchorRect,
  slot,
  partTimeStaff,
  subjects,
  daySlots,
  currentSubstitute,
  currentStatus,
  onAssign,
  onClear,
  onClose,
}) {
  const ref = useRef(null);
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState(currentStatus || "confirmed");
  // 矢印キーで選択中の候補のインデックス。-1 はリスト未フォーカス。
  // 開いた直後は何もハイライトせず、↓ を押した時点で先頭に移る挙動。
  const [focusIdx, setFocusIdx] = useState(-1);
  const listboxId = "sub-picker-listbox";
  const optionId = (i) => `sub-picker-opt-${i}`;

  const pos = anchorRect
    ? computePosition(anchorRect)
    : { top: 100, left: 100 };

  // Primary 候補: そのコマの教科を担当できるバイト講師。
  //   subjId が解決できた場合   → subjectIds に該当 id を持つ講師
  //   subjId が解決できない場合 → 教科フィルタを適用できないので全員
  const subjId = pickSubjectId(slot.subj, subjects);
  const allStaff = useMemo(() => partTimeStaff || [], [partTimeStaff]);
  const staffSubjectMatch = useMemo(
    () =>
      subjId != null
        ? allStaff.filter(
            (p) => Array.isArray(p.subjectIds) && p.subjectIds.includes(subjId)
          )
        : allStaff,
    [subjId, allStaff]
  );

  // 同日の他のコマで担当している先生 (常勤含む) を secondary 候補に加える
  const dayTeachers = useMemo(() => {
    const set = new Set();
    for (const s of daySlots || []) {
      if (s.teacher) {
        for (const t of s.teacher.split("·")) set.add(t.trim());
      }
    }
    set.delete(slot.teacher);
    return set;
  }, [daySlots, slot.teacher]);

  const primary = useMemo(
    () => sortJa(staffSubjectMatch.map((s) => s.name)),
    [staffSubjectMatch]
  );
  const list = useMemo(() => {
    if (!showAll) return primary;
    const rest = sortJa(
      [
        ...new Set([...allStaff.map((s) => s.name), ...dayTeachers]),
      ].filter((n) => !primary.includes(n) && n !== slot.teacher)
    );
    return [...primary, ...rest];
  }, [showAll, primary, allStaff, dayTeachers, slot.teacher]);

  // showAll 切替などで候補が変わったらフォーカスをリセット (範囲外参照防止)。
  useEffect(() => {
    setFocusIdx((idx) => (idx >= list.length ? -1 : idx));
  }, [list.length]);

  // 矢印キーでリスト内を移動し、Enter で確定する。
  // ピッカー上で focus が当たっていない時 (開いた直後) でもキー操作で
  // 選べるよう、document レベルで ↑↓ Enter を捕捉する。
  // input / select にフォーカスがある時は標準動作 (オプション選択など) を
  // 優先させるため握り潰さない。
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target?.tagName;
      const isField = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
      if (e.key === "ArrowDown") {
        if (list.length === 0) return;
        e.preventDefault();
        setFocusIdx((idx) => Math.min(list.length - 1, idx < 0 ? 0 : idx + 1));
      } else if (e.key === "ArrowUp") {
        if (list.length === 0) return;
        e.preventDefault();
        setFocusIdx((idx) => Math.max(0, idx < 0 ? 0 : idx - 1));
      } else if (e.key === "Enter") {
        // input/select 上での Enter は通常動作 (フォーム送信 / 選択確定) に
        // 任せる。リスト選択中 (focusIdx >= 0) の Enter のみ確定に使う。
        if (isField) return;
        if (focusIdx >= 0 && focusIdx < list.length) {
          e.preventDefault();
          onAssign(list[focusIdx], status);
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [list, focusIdx, status, onAssign, onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: Math.min(280, window.innerWidth - 16),
        maxHeight: Math.min(360, window.innerHeight - 24),
        overflowY: "auto",
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,.2)",
        zIndex: 2100,
        fontSize: 12,
      }}
    >
      <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid #eee" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          代行を割り当て
        </div>
        <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>
          {slot.grade}
          {slot.cls && slot.cls !== "-" ? slot.cls : ""} {slot.subj} ({slot.teacher})
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <label style={{ color: "#555" }}>ステータス:</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ ...S.input, padding: "2px 6px", fontSize: 11 }}
        >
          <option value="confirmed">確定</option>
          <option value="requested">依頼中</option>
        </select>
        <label
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            gap: 4,
            alignItems: "center",
            color: "#555",
          }}
        >
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          全員表示
        </label>
      </div>

      <div
        id={listboxId}
        role="listbox"
        aria-label="代行候補"
        aria-activedescendant={
          focusIdx >= 0 && focusIdx < list.length ? optionId(focusIdx) : undefined
        }
        style={{ padding: "4px 0" }}
      >
        {list.length === 0 ? (
          <div style={{ padding: "8px 10px", color: "#888" }}>
            候補が見つかりません
          </div>
        ) : (
          list.map((name, i) => {
            const isCurrent = name === currentSubstitute;
            const isPrimary = primary.includes(name);
            const isFocused = i === focusIdx;
            const bg = isFocused
              ? "#dcebff"
              : isCurrent
                ? "#e8f4ff"
                : "transparent";
            return (
              <button
                key={name}
                id={optionId(i)}
                role="option"
                aria-selected={isFocused}
                type="button"
                onClick={() => {
                  onAssign(name, status);
                  onClose();
                }}
                onMouseEnter={() => setFocusIdx(i)}
                style={{
                  display: "flex",
                  width: "100%",
                  padding: "6px 10px",
                  border: "none",
                  background: bg,
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: 12,
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontWeight: isPrimary ? 700 : 400 }}>{name}</span>
                {isPrimary && (
                  <span style={{ color: "#2a6a9e", fontSize: 10 }}>担当可</span>
                )}
              </button>
            );
          })
        )}
      </div>

      {currentSubstitute && onClear && (
        <div
          style={{
            padding: "6px 10px",
            borderTop: "1px solid #eee",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            style={{
              ...S.btn(false),
              fontSize: 11,
              padding: "4px 10px",
              color: colors.danger,
            }}
          >
            代行を解除
          </button>
        </div>
      )}
    </div>
  );
}
