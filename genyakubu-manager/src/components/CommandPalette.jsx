import { useEffect, useMemo, useRef, useState } from "react";
import { SUB_STATUS } from "../data";
import { isSlotForTeacher, getSlotTeachers } from "../utils/biweekly";

// ─── Cmd+K で起動するグローバル検索パレット ─────────────────────────
// 講師名・科目・教室・メモを横断検索し、選択するとそのビューに遷移する。
export function CommandPalette({
  open,
  onClose,
  slots,
  subs,
  onSelectTeacher,
  onSelectView,
  views,
}) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      // 次フレームでフォーカス
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const hits = [];

    // 講師検索
    const teacherSet = new Set();
    for (const s of slots) {
      for (const t of getSlotTeachers(s)) {
        if (t.toLowerCase().includes(q)) teacherSet.add(t);
      }
    }
    for (const t of teacherSet) {
      const cnt = slots.filter((s) => isSlotForTeacher(s, t)).length;
      hits.push({
        type: "teacher",
        label: t,
        detail: `${cnt}コマ`,
        action: () => onSelectTeacher(t),
      });
    }

    // コマ検索 (科目・教室・備考)
    const matchedSlots = slots.filter(
      (s) =>
        !teacherSet.has(s.teacher) && // 講師ヒットは除く
        (s.subj?.toLowerCase().includes(q) ||
          s.room?.toLowerCase().includes(q) ||
          s.note?.toLowerCase().includes(q) ||
          s.grade?.toLowerCase().includes(q))
    );
    for (const s of matchedSlots.slice(0, 10)) {
      hits.push({
        type: "slot",
        label: `${s.day} ${s.time} ${s.grade} ${s.subj}`,
        detail: `${s.teacher} / ${s.room || ""}`,
        grade: s.grade,
        action: () => {
          onSelectTeacher(s.teacher);
          onClose();
        },
      });
    }

    // 代行検索 (メモ・講師名)
    const matchedSubs = (subs || []).filter(
      (s) =>
        s.memo?.toLowerCase().includes(q) ||
        s.originalTeacher?.toLowerCase().includes(q) ||
        s.substitute?.toLowerCase().includes(q)
    );
    for (const s of matchedSubs.slice(0, 5)) {
      const st = SUB_STATUS[s.status] || SUB_STATUS.requested;
      hits.push({
        type: "sub",
        label: `${s.date} ${s.originalTeacher} → ${s.substitute || "?"}`,
        detail: `${st.label}${s.memo ? " / " + s.memo : ""}`,
        action: () => {
          onSelectView(views.SUBS);
          onClose();
        },
      });
    }

    // ビュー検索
    const viewNames = [
      { key: views.DASH, label: "ダッシュボード" },
      { key: views.ALL, label: "全講師一覧" },
      { key: views.COMPARE, label: "講師比較" },
      { key: views.TIMETABLE, label: "時間割管理" },
      { key: views.HOLIDAYS, label: "休講日・テスト期間" },
      { key: views.MASTER, label: "コースマスター管理" },
      { key: views.SUBS, label: "代行管理" },
      { key: views.CONFIRMED_SUBS, label: "代行確定一覧" },
      { key: views.STAFF, label: "バイト管理" },
      { key: views.ABSENCE_FLOW, label: "欠勤組み換え" },
    ];
    for (const v of viewNames) {
      if (v.label.toLowerCase().includes(q)) {
        hits.push({
          type: "view",
          label: v.label,
          detail: "ビューに移動",
          action: () => {
            onSelectView(v.key);
            onClose();
          },
        });
      }
    }

    return hits.slice(0, 20);
  }, [query, slots, subs, onSelectTeacher, onSelectView, onClose, views]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [results.length]);

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && results[selectedIdx]) {
      e.preventDefault();
      results[selectedIdx].action();
      onClose();
    }
  };

  if (!open) return null;

  const typeIcons = { teacher: "👤", slot: "📝", sub: "🔄", view: "📋" };
  const typeLabels = { teacher: "講師", slot: "コマ", sub: "代行", view: "ビュー" };
  const listboxId = "cmdp-results";
  const optionId = (i) => `cmdp-opt-${i}`;
  const activeOptionId =
    results.length > 0 && selectedIdx < results.length
      ? optionId(selectedIdx)
      : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="コマンドパレット"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        zIndex: 10000,
        display: "flex",
        justifyContent: "center",
        paddingTop: 80,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "100%",
          maxWidth: 520,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,.25)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e0e0e0" }}>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            aria-label="検索"
            placeholder="講師名・科目・教室・メモで検索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "2px solid #1a1a2e",
              borderRadius: 8,
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </div>
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
          }}
        >
          {query
            ? results.length === 0
              ? "結果なし"
              : `${results.length}件の結果`
            : ""}
        </div>
        <div
          id={listboxId}
          role="listbox"
          aria-label="検索結果"
          style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}
        >
          {query && results.length === 0 && (
            <div
              style={{
                textAlign: "center",
                color: "#888",
                padding: 24,
                fontSize: 13,
              }}
            >
              「{query}」に一致する結果がありません
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.label}-${i}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === selectedIdx}
              type="button"
              onClick={() => {
                r.action();
                onClose();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "8px 16px",
                border: "none",
                background: i === selectedIdx ? "#f0f4ff" : "transparent",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            >
              <span
                aria-hidden="true"
                style={{ fontSize: 16, width: 24, textAlign: "center" }}
              >
                {typeIcons[r.type]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "#1a1a2e" }}>
                  {r.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#888",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.detail}
                </div>
              </div>
              <span style={{ fontSize: 10, color: "#aaa" }}>
                {typeLabels[r.type]}
              </span>
            </button>
          ))}
        </div>
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid #e0e0e0",
            fontSize: 10,
            color: "#999",
            display: "flex",
            gap: 12,
          }}
        >
          <span>↑↓ 移動</span>
          <span>Enter 選択</span>
          <span>Esc 閉じる</span>
        </div>
      </div>
    </div>
  );
}
