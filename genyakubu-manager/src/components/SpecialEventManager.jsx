import { Fragment, useMemo, useRef, useState } from "react";
import {
  ALL_GRADES,
  DEPT_COLOR,
  HIGH_GRADES,
  MIDDLE_GRADES,
  gradeToDept,
  isValidDateStr,
} from "../data";
import { nextNumericId } from "../utils/schema";
import { useToasts } from "../hooks/useToasts";
import { useRemoveManyWithUndo, useRemoveWithUndo } from "../hooks/useCrudResource";
import {
  scrollFormIntoView,
  useEditTarget,
  useNewEntryTarget,
} from "../hooks/useEditTarget";
import { ListPeriodFilter } from "./ListPeriodFilter";
import { useListPeriod } from "../hooks/useListPeriod";
import { formatDateRange } from "../utils/dateHelpers";
import { specialEventsToTsv } from "../utils/specialEventImport";
import { SpecialEventDisplaySettings } from "./SpecialEventDisplaySettings";
import { SpecialEventBulkImportDialog } from "./SpecialEventBulkImportDialog";
import { S, VISUALLY_HIDDEN } from "../styles/common";
import { colors } from "../styles/tokens";
import { TAG_META } from "../constants/eventKinds";
import {
  DEFAULT_SPECIAL_EVENT_TYPE,
  SPECIAL_EVENT_TYPES,
  specialEventTypeMeta,
} from "../constants/specialEvents";

export function SpecialEventManager({
  specialEvents,
  onSave,
  // 講師の月間予定に出す種別 (全員共通の設定、utils/specialEventDisplay)
  display,
  onSaveDisplay,
  isAdmin,
  // 既存タグ候補は ExamPeriod とも共通空間。親 (App) から既存タグ集計を受け取る。
  knownTags = [],
  editTargetId = null,
  onConsumeEditTarget,
  newEntryToken = null,
  newEntryDate = null,
  onConsumeNewEntry,
}) {
  const formRef = useRef(null);
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState(DEFAULT_SPECIAL_EVENT_TYPE);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [memo, setMemo] = useState("");
  const [source, setSource] = useState("");
  const [targetGrades, setTargetGrades] = useState([]);
  const [allGrades, setAllGrades] = useState(true);
  const [tagsArr, setTagsArr] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  // 一覧の絞り込み (種別・出典)。null = すべて
  const [typeFilter, setTypeFilter] = useState(null);
  const [sourceFilter, setSourceFilter] = useState(null);
  const toasts = useToasts();

  // 既存タグ: 親 App から共通空間として受け取る (両ソース集約済み・五十音順)。
  const existingTagSet = knownTags;

  const addTag = (raw) => {
    const t = raw.trim();
    if (!t) return;
    if (tagsArr.includes(t)) return;
    setTagsArr([...tagsArr, t]);
    setTagInput("");
  };

  const removeTag = (t) => {
    setTagsArr(tagsArr.filter((x) => x !== t));
  };

  const removeEventWithUndo = useRemoveWithUndo({
    list: specialEvents,
    save: onSave,
  });
  const removeEventsWithUndo = useRemoveManyWithUndo({
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

  // presetDate: イベントカレンダーの日付セルから来たときの日付 (文字列のみ。
  // onClick から呼ばれると event が入るので型で弾く)
  const resetForm = (presetDate) => {
    const d = typeof presetDate === "string" ? presetDate : "";
    setName("");
    setEventType(DEFAULT_SPECIAL_EVENT_TYPE);
    setStartDate(d);
    setEndDate(d);
    setMemo("");
    setSource("");
    setTargetGrades([]);
    setAllGrades(true);
    setTagsArr([]);
    setTagInput("");
    setEditId(null);
    setError("");
  };

  const handleAdd = () => {
    setError("");
    if (!name.trim()) {
      setError("名称を入力してください");
      return;
    }
    if (!startDate || !isValidDateStr(startDate)) {
      setError("開始日を正しく入力してください");
      return;
    }
    const effectiveEnd = endDate || startDate;
    if (!isValidDateStr(effectiveEnd)) {
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
    // 入力中タグも保存対象に含める (Enter を押し忘れた場合の救済)
    const pending = tagInput.trim();
    const tags = pending && !tagsArr.includes(pending)
      ? [...tagsArr, pending]
      : [...tagsArr];
    const base = {
      name: name.trim(),
      eventType,
      startDate,
      endDate: effectiveEnd,
      targetGrades: grades,
      memo: memo.trim(),
      tags,
    };
    // 出典は空なら持たない (編集で消したときは項目ごと外す)
    const src = source.trim();
    if (editId != null) {
      onSave(
        specialEvents.map((ev) => {
          if (ev.id !== editId) return ev;
          const { source: _old, ...rest } = ev;
          return src ? { ...rest, ...base, source: src } : { ...rest, ...base };
        })
      );
      toasts.success("イベントを更新しました");
    } else {
      onSave([
        ...specialEvents,
        { id: nextNumericId(specialEvents), ...base, ...(src ? { source: src } : {}) },
      ]);
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
    setSource(ev.source || "");
    if ((ev.targetGrades || []).length === 0) {
      setAllGrades(true);
      setTargetGrades([]);
    } else {
      setAllGrades(false);
      setTargetGrades([...ev.targetGrades]);
    }
    setTagsArr([...(ev.tags || [])]);
    setTagInput("");
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
  // 一覧の期間絞り込み (既定は今月以降)。編集・削除は全件が対象
  const period = useListPeriod();
  // 出典ごとの件数 (全期間)。出典で絞っている間は期間に関係なくその出典の
  // 全件を出す (予定表の改訂版が来たら「出典ごと消して入れ直す」ため)
  const sources = useMemo(() => {
    const m = new Map();
    for (const ev of specialEvents) if (ev.source) m.set(ev.source, (m.get(ev.source) || 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "ja"));
  }, [specialEvents]);
  const activeSource = sourceFilter && sources.some(([s]) => s === sourceFilter) ? sourceFilter : null;
  const base = activeSource
    ? sorted.filter((ev) => ev.source === activeSource)
    : period.apply(sorted, (ev) => [ev.startDate, ev.endDate]);
  // 種別のチップの件数は期間 (・出典) で絞った後の数
  const typeCounts = new Map();
  for (const ev of base) typeCounts.set(ev.eventType, (typeCounts.get(ev.eventType) || 0) + 1);
  const shown = typeFilter ? base.filter((ev) => ev.eventType === typeFilter) : base;

  const copyTsv = async () => {
    try {
      await navigator.clipboard.writeText(specialEventsToTsv(shown));
      toasts.success(`${shown.length} 件を表 (TSV) としてコピーしました`);
    } catch {
      toasts.error("クリップボードにコピーできませんでした");
    }
  };

  const removeSource = (src) => {
    const ids = specialEvents.filter((ev) => ev.source === src).map((ev) => ev.id);
    removeEventsWithUndo(ids, {
      successMsg: (n) => `出典「${src}」の ${n} 件を削除しました`,
    });
    setSourceFilter(null);
  };

  useEditTarget({
    editTargetId,
    items: specialEvents,
    onEdit: handleEdit,
    onConsume: onConsumeEditTarget,
    formRef,
    isAdmin,
  });

  useNewEntryTarget({
    token: newEntryToken,
    date: newEntryDate,
    onReset: resetForm,
    onConsume: onConsumeNewEntry,
    formRef,
    isAdmin,
  });

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

      <SpecialEventDisplaySettings display={display} onSave={onSaveDisplay} isAdmin={isAdmin} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            style={{ ...S.btn(false), fontSize: 12, padding: "6px 12px" }}
          >
            📋 まとめて登録
          </button>
        )}
        <button
          type="button"
          onClick={copyTsv}
          disabled={shown.length === 0}
          title="いま一覧に出ているイベントを、表 (TSV) としてクリップボードにコピーします。Excel に貼って点検できます"
          style={{ ...S.btn(false), fontSize: 12, padding: "6px 12px" }}
        >
          📄 表として書き出す (TSV をコピー)
        </button>
      </div>
      {bulkOpen && (
        <SpecialEventBulkImportDialog
          specialEvents={specialEvents}
          onSave={onSave}
          onClose={() => setBulkOpen(false)}
        />
      )}

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
                    style={VISUALLY_HIDDEN}
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

          {/* 出典 */}
          <div style={{ marginBottom: 10 }}>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="出典（任意。例: 2026中学予定表）"
              aria-label="出典"
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
                const col = DEPT_COLOR[dept] || { b: "#eee", f: "#444" };
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
                      style={VISUALLY_HIDDEN}
                    />
                    {g}
                  </label>
                );
              })}
            </div>
          </div>

          {/* タグ */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              タグ (学校名・部など、任意。種別はタグに入れず上で選ぶ)
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              {tagsArr.map((t) => (
                <span
                  key={t}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    padding: "2px 4px 2px 8px",
                    borderRadius: 12,
                    background: TAG_META.bg,
                    color: TAG_META.fg,
                    border: `1px solid ${TAG_META.accent}`,
                    fontWeight: 700,
                  }}
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    aria-label={`タグ ${t} を外す`}
                    style={{
                      border: "none",
                      background: TAG_META.accent,
                      color: TAG_META.fg,
                      borderRadius: "50%",
                      width: 16,
                      height: 16,
                      lineHeight: "14px",
                      fontSize: 11,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="例: 桜井 (Enter で追加)"
                style={{ ...S.input, width: 160, padding: "3px 8px", fontSize: 11 }}
              />
            </div>
            {existingTagSet.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#888" }}>既存タグ:</span>
                {existingTagSet
                  .filter((t) => !tagsArr.includes(t))
                  .map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addTag(t)}
                      style={{
                        fontSize: 10,
                        padding: "1px 8px",
                        borderRadius: 10,
                        border: `1px dashed ${TAG_META.accent}`,
                        background: "#fff",
                        color: TAG_META.fg,
                        cursor: "pointer",
                      }}
                    >
                      + {t}
                    </button>
                  ))}
              </div>
            )}
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

      {activeSource ? (
        <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>
          出典「{activeSource}」の {base.length} 件を表示しています (期間に関係なく全件)
        </div>
      ) : (
        <ListPeriodFilter period={period} shown={shown.length} total={sorted.length} noun="特別イベント" />
      )}

      {/* 種別のチップ (件数付き)。押すとその種別だけ、もう一度押すと全部 */}
      <div
        role="group"
        aria-label="種別で絞り込む"
        style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}
      >
        <span style={{ fontSize: 11, color: "#888", marginRight: 2 }}>種別:</span>
        <FilterChip
          active={typeFilter == null}
          onClick={() => setTypeFilter(null)}
          label={`すべて ${base.length}`}
        />
        {SPECIAL_EVENT_TYPES.map((t) => (
          <FilterChip
            key={t.key}
            active={typeFilter === t.key}
            onClick={() => setTypeFilter(typeFilter === t.key ? null : t.key)}
            label={`${t.icon} ${t.label} ${typeCounts.get(t.key) || 0}`}
            tone={t}
            dim={!typeCounts.get(t.key)}
          />
        ))}
      </div>

      {/* 出典 (まとめて登録で付けたもの)。出典ごとに表示 / まとめて削除 */}
      {sources.length > 0 && (
        <div
          role="group"
          aria-label="出典で絞り込む"
          style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}
        >
          <span style={{ fontSize: 11, color: "#888", marginRight: 2 }}>出典:</span>
          {sources.map(([src, n]) => (
            <FilterChip
              key={src}
              active={activeSource === src}
              onClick={() => setSourceFilter(activeSource === src ? null : src)}
              label={`📄 ${src} ${n}`}
            />
          ))}
          {isAdmin && activeSource && (
            <button
              type="button"
              onClick={() => removeSource(activeSource)}
              style={{
                fontSize: 11,
                padding: "2px 10px",
                borderRadius: 10,
                border: `1px solid ${colors.danger}`,
                background: "#fff",
                color: colors.danger,
                cursor: "pointer",
                marginLeft: 6,
              }}
            >
              この出典の {base.length} 件をまとめて削除
            </button>
          )}
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
        {shown.length === 0 ? (
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
              {sorted.length > 0 ? "条件に該当する特別イベントはありません (期間・種別の絞り込みを変えてください)" : "登録された特別イベントはありません"}
            </div>
            {isAdmin && (
              <div style={{ fontSize: 12, color: "#888" }}>
                修学旅行・テスト発表・式典など、告知したい予定をここで登録します
              </div>
            )}
          </div>
        ) : (
          shown.map((ev, i) => {
            const meta = specialEventTypeMeta(ev.eventType);
            // 月ごとの見出し (開始日の月)
            const ym = ev.startDate.slice(0, 7);
            const newMonth = i === 0 || shown[i - 1].startDate.slice(0, 7) !== ym;
            return (
              <Fragment key={ev.id}>
              {newMonth && (
                <div
                  style={{
                    padding: "4px 14px",
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#5a3a8e",
                    background: "#f3eefa",
                    borderBottom: "1px solid #e4dcf2",
                  }}
                >
                  {Number(ym.slice(0, 4))}年{Number(ym.slice(5, 7))}月
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderBottom:
                    i < shown.length - 1 ? "1px solid #eee" : "none",
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
                    {formatDateRange(ev.startDate, ev.endDate, { weekday: true })}
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
                          DEPT_COLOR[dept] || { b: "#eee", f: "#444" };
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
                  {(ev.tags || []).length > 0 && (
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {ev.tags.map((t) => (
                        <span
                          key={t}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: TAG_META.bg,
                            color: TAG_META.fg,
                            border: `1px solid ${TAG_META.accent}`,
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {ev.memo && (
                    <span
                      style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}
                    >
                      {ev.memo}
                    </span>
                  )}
                  {ev.source && (
                    <span style={{ fontSize: 10, color: "#999" }} title="出典">
                      📄 {ev.source}
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => {
                        handleEdit(ev);
                        scrollFormIntoView(formRef);
                      }}
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
              </Fragment>
            );
          })
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: "#888" }}>
        ※特別イベントは告知用の表示のみで、休講や授業数には影響しません。
        授業を休止する場合は、別途「休講日」を登録してください。
        夏期講習の追加回やテスト対策など「授業として実施する単発コマ」は、
        このページ下部の「追加授業管理」で登録すると講師のスケジュールにも
        反映されます (これまで告知イベントで代用していた場合は移行を推奨)。
      </div>
    </div>
  );
}

// 一覧の絞り込みチップ (種別・出典)。tone は種別の色 (無ければ中立)
function FilterChip({ active, onClick, label, tone, dim = false }) {
  const accent = tone?.accent || "#8a5ec4";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 10,
        cursor: "pointer",
        background: active ? tone?.bg || "#f3eefa" : "#fff",
        color: active ? tone?.fg || "#5a3a8e" : dim ? "#bbb" : "#555",
        border: `1px solid ${active ? accent : "#ddd"}`,
        fontWeight: active ? 700 : 400,
      }}
    >
      {label}
    </button>
  );
}
