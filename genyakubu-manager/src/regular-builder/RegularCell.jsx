import { memo, useRef, useState } from "react";
import { splitTeacherField } from "../utils/biweekly";
import {
  getSubjectColor,
  CONFLICT_CELL_BG,
} from "../timetable-builder/utils/constants";

// ─── セル (講習ビルダーの ScheduleCell 相当) ────────────────────────
// 科目カラー背景 + 科目/講師のプルダウン入力。教室・備考は何か値がある
// セルにだけ下段に小さく出す。講師は教科なしでも入力できる (下書き用途 —
// 反映時は教科なしセルとしてスキップされ件数報告される)。衝突セルは
// 赤背景 + ⚠️バッジ、講師ハイライトは一致セルにリング・非一致セルを減光。
//
// 講師プルダウンには busyTeachers (同曜日・同時間帯に他セルで割当済みの
// 講師) に載っている候補へ「(重複)」を予告する。選択は妨げない
// (意図した重なりは承認フローで消せるため)。
//
// 教科・講師とも「✎ 直接入力」でテキスト入力に切り替えられる (マスタ外の
// 単発科目や「·」区切りの複数講師用)。Enter/フォーカスアウトで確定、
// Escape で取消。講師は確定時に splitTeacherField で正規化する
// (CLAUDE.md の複数講師区切り規約)。

const FREE_EDIT = "__free__";

// 直接入力用の小さなテキスト入力。Enter = 確定 / Escape = 取消 (blur は
// どちらでも発火するため、フラグで確定・取消を振り分ける)。
function FreeTextInput({
  id,
  ariaLabel,
  value,
  list,
  placeholder,
  className,
  onChange,
  onCommit,
  onCancel,
}) {
  const cancelRef = useRef(false);
  return (
    <input
      id={id}
      type="text"
      autoFocus
      aria-label={ariaLabel}
      value={value}
      list={list}
      placeholder={placeholder}
      className={className}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        if (cancelRef.current) {
          cancelRef.current = false;
          onCancel();
        } else {
          onCommit(e.target.value);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.target.blur();
        else if (e.key === "Escape") {
          cancelRef.current = true;
          e.target.blur();
        }
      }}
    />
  );
}

export const RegularCell = memo(function RegularCell({
  cellKey,
  cell,
  subjects,
  teachers,
  conflictText,
  /** "·" 区切りの講師名リスト: この曜日・時間帯に他セルで割当済み (予告用) */
  busyTeachers = "",
  highlighted,
  dimmed,
  roomPlaceholder,
  ariaBase,
  isCompact,
  onCellChange,
  onClearCell,
  onNavigate,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  isDragOver,
  isDragSource,
}) {
  const c = cell || {};
  const [teacherFreeEdit, setTeacherFreeEdit] = useState(false);
  const [subjFreeEdit, setSubjFreeEdit] = useState(false);
  // 直接入力の取消 (Escape) 用: 編集開始時の値
  const teacherOriginalRef = useRef("");
  const subjOriginalRef = useRef("");

  const hasContent = !!(c.subj || c.teacher || c.room || c.note);
  const bgColor = conflictText ? CONFLICT_CELL_BG : getSubjectColor(c.subj);
  const innerBorder = conflictText
    ? "border-2 border-builder-red"
    : "border border-builder-border";

  const teacherKnown =
    !c.teacher || teachers.some((t) => t.name === c.teacher);
  const subjKnown = !c.subj || subjects.includes(c.subj);
  const busySet = new Set(splitTeacherField(busyTeachers));

  return (
    <td
      className={`group border-r border-builder-border last:border-r-0 align-top ${isCompact ? "p-px" : "p-1.5"} ${c.subj ? "cursor-move" : ""} ${isDragOver ? "ring-2 ring-builder-blue ring-inset bg-builder-info-soft" : ""} ${isDragSource ? "opacity-50" : ""} ${!isDragOver && highlighted ? "ring-2 ring-builder-blue ring-inset" : ""} ${dimmed ? "opacity-40" : ""}`}
      title={conflictText || undefined}
      draggable={!!c.subj}
      onDragStart={(e) => onDragStart(e, cellKey, c)}
      onDragOver={(e) => onDragOver(e, cellKey)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, cellKey)}
      onDragEnd={onDragEnd}
    >
      <div
        className={`flex flex-col rounded h-full ${innerBorder} ${isCompact ? "gap-0 p-0.5" : "gap-1 p-1"} ${!bgColor && !hasContent ? "bg-builder-surface-alt/50" : ""}`}
        style={bgColor ? { backgroundColor: bgColor } : undefined}
      >
        <div className={`flex items-center min-w-0 ${isCompact ? "gap-0.5" : "gap-1"}`}>
          {/* ドラッグハンドル: セルの大半は select が mousedown を奪うため、
              確実に掴める非 select 領域を常設する (講習ビルダー N2c と同じ) */}
          {!!c.subj && (
            <span
              aria-hidden="true"
              title="ドラッグで別のセルと入れ替え"
              className={`no-print shrink-0 select-none cursor-move text-builder-ink-ghost leading-none ${isCompact ? "text-[9px]" : "text-xs"}`}
            >
              ⠿
            </span>
          )}
          {subjFreeEdit ? (
            <FreeTextInput
              id={`regb-${cellKey}-subj`}
              ariaLabel={`${ariaBase} の教科 (直接入力)`}
              value={c.subj || ""}
              list="regb-subjects"
              placeholder="教科"
              className={`flex-1 min-w-0 rounded border-0 bg-white/70 font-bold text-builder-ink focus:outline-none ${isCompact ? "text-[11px] leading-tight py-0" : "text-[13px]"}`}
              onChange={(v) => onCellChange(cellKey, "subj", v)}
              onCommit={(v) => {
                const trimmed = v.trim();
                if (trimmed !== (c.subj || "")) onCellChange(cellKey, "subj", trimmed);
                setSubjFreeEdit(false);
              }}
              onCancel={() => {
                if ((c.subj || "") !== subjOriginalRef.current)
                  onCellChange(cellKey, "subj", subjOriginalRef.current);
                setSubjFreeEdit(false);
              }}
            />
          ) : (
            <select
              id={`regb-${cellKey}-subj`}
              aria-label={`${ariaBase} の教科`}
              className={`flex-1 min-w-0 bg-transparent font-bold cursor-pointer text-builder-ink focus:outline-none ${isCompact ? "text-[11px] leading-tight py-0" : "text-[13px]"}`}
              value={c.subj || ""}
              onChange={(e) => {
                if (e.target.value === FREE_EDIT) {
                  subjOriginalRef.current = c.subj || "";
                  setSubjFreeEdit(true);
                } else onCellChange(cellKey, "subj", e.target.value);
              }}
              onKeyDown={(e) => onNavigate(e, cellKey, "subj")}
            >
              <option value="">-</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {!subjKnown && <option value={c.subj}>{c.subj}</option>}
              <option value={FREE_EDIT}>✎ 直接入力…</option>
            </select>
          )}
          {conflictText && (
            <span
              className={`bg-builder-red text-white rounded shrink-0 animate-pulse ${isCompact ? "text-[8px] px-0.5" : "text-[10px] px-1"}`}
            >
              ⚠️重複
            </span>
          )}
          {hasContent && (
            <button
              type="button"
              onClick={() => onClearCell(cellKey)}
              aria-label={`${ariaBase} をクリア`}
              title="このセルをクリア (Ctrl+Z で戻せます)"
              className={`no-print shrink-0 border-0 bg-transparent cursor-pointer p-0 leading-none text-builder-ink-ghost hover:text-builder-red opacity-0 group-hover:opacity-100 focus:opacity-100 group-focus-within:opacity-100 ${isCompact ? "text-[9px]" : "text-xs"}`}
            >
              ✕
            </button>
          )}
        </div>

        {teacherFreeEdit ? (
          <FreeTextInput
            id={`regb-${cellKey}-teacher`}
            ariaLabel={`${ariaBase} の講師 (直接入力)`}
            value={c.teacher || ""}
            list="regb-teachers"
            placeholder="講師 (·区切りで複数)"
            className={`w-full rounded border-0 bg-white/70 text-builder-blue focus:outline-none ${isCompact ? "text-[10px] py-0 px-0.5" : "text-xs py-0.5 px-1"}`}
            onChange={(v) => onCellChange(cellKey, "teacher", v)}
            onCommit={(v) => {
              const normalized = splitTeacherField(v).join("·");
              if (normalized !== (c.teacher || ""))
                onCellChange(cellKey, "teacher", normalized);
              setTeacherFreeEdit(false);
            }}
            onCancel={() => {
              if ((c.teacher || "") !== teacherOriginalRef.current)
                onCellChange(cellKey, "teacher", teacherOriginalRef.current);
              setTeacherFreeEdit(false);
            }}
          />
        ) : (
          <select
            id={`regb-${cellKey}-teacher`}
            aria-label={`${ariaBase} の講師`}
            className={`w-full rounded cursor-pointer ${conflictText ? "text-builder-red font-extrabold" : "text-builder-blue"} ${isCompact ? "text-[10px] py-0 leading-tight" : "text-xs py-0.5"} ${!c.subj && !c.teacher ? "opacity-50" : "bg-white/50 hover:bg-builder-surface"}`}
            value={c.teacher || ""}
            onChange={(e) => {
              if (e.target.value === FREE_EDIT) {
                teacherOriginalRef.current = c.teacher || "";
                setTeacherFreeEdit(true);
              } else onCellChange(cellKey, "teacher", e.target.value);
            }}
            onKeyDown={(e) => onNavigate(e, cellKey, "teacher")}
          >
            <option value="">-</option>
            {teachers.map((t) => {
              const busy = busySet.has(t.name);
              return (
                <option
                  key={t.name}
                  value={t.name}
                  className={busy ? "bg-builder-warning-soft" : ""}
                >
                  {t.name}
                  {busy ? " (重複)" : ""}
                </option>
              );
            })}
            {!teacherKnown && <option value={c.teacher}>{c.teacher}</option>}
            <option value={FREE_EDIT}>✎ 直接入力…</option>
          </select>
        )}

        {isCompact
          ? (c.room || c.note) && (
              <div className="text-[9px] text-builder-ink-muted truncate leading-tight">
                {[c.room, c.note].filter(Boolean).join(" ")}
              </div>
            )
          : hasContent && (
              <div className="flex gap-1">
                <input
                  type="text"
                  aria-label={`${ariaBase} の教室`}
                  value={c.room || ""}
                  onChange={(e) => onCellChange(cellKey, "room", e.target.value)}
                  placeholder={roomPlaceholder || "教室"}
                  className="w-14 rounded border-0 bg-white/40 px-1 text-[10px] text-builder-ink-muted focus:outline-none placeholder:text-builder-ink-ghost"
                />
                <input
                  type="text"
                  aria-label={`${ariaBase} の備考`}
                  value={c.note || ""}
                  onChange={(e) => onCellChange(cellKey, "note", e.target.value)}
                  placeholder="備考"
                  className="flex-1 min-w-0 rounded border-0 bg-white/40 px-1 text-[10px] text-builder-ink-muted focus:outline-none placeholder:text-builder-ink-ghost"
                />
              </div>
            )}
      </div>
    </td>
  );
});
