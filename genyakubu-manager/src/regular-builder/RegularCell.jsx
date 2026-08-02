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
// 講師は基本プルダウン (マスタから選択)。「·」区切りの複数講師や
// マスタ外の名前は「✎ 直接入力」で従来のテキスト入力に切り替えて
// 編集できる。確定 (blur) 時に splitTeacherField で正規化する
// (CLAUDE.md の複数講師区切り規約)。

const FREE_EDIT = "__free__";

export const RegularCell = memo(function RegularCell({
  cellKey,
  cell,
  subjects,
  teachers,
  conflictText,
  highlighted,
  dimmed,
  roomPlaceholder,
  ariaBase,
  isCompact,
  onCellChange,
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
  // 直接入力の取消 (Escape) 用: 編集開始時の値と取消フラグ。blur は
  // Escape 経由でも発火するため、フラグで確定/取消を振り分ける。
  const freeOriginalRef = useRef("");
  const freeCancelRef = useRef(false);

  const hasContent = !!(c.subj || c.teacher || c.room || c.note);
  const bgColor = conflictText ? CONFLICT_CELL_BG : getSubjectColor(c.subj);
  const innerBorder = conflictText
    ? "border-2 border-builder-red"
    : "border border-builder-border";

  const commitTeacherFree = (value) => {
    if (freeCancelRef.current) {
      freeCancelRef.current = false;
      if ((c.teacher || "") !== freeOriginalRef.current)
        onCellChange(cellKey, "teacher", freeOriginalRef.current);
    } else {
      const normalized = splitTeacherField(value).join("·");
      if (normalized !== (c.teacher || "")) onCellChange(cellKey, "teacher", normalized);
    }
    setTeacherFreeEdit(false);
  };

  const teacherKnown =
    !c.teacher || teachers.some((t) => t.name === c.teacher);
  const subjKnown = !c.subj || subjects.includes(c.subj);

  return (
    <td
      className={`border-r border-builder-border last:border-r-0 align-top ${isCompact ? "p-px" : "p-1.5"} ${c.subj ? "cursor-move" : ""} ${isDragOver ? "ring-2 ring-builder-blue ring-inset bg-builder-info-soft" : ""} ${isDragSource ? "opacity-50" : ""} ${!isDragOver && highlighted ? "ring-2 ring-builder-blue ring-inset" : ""} ${dimmed ? "opacity-40" : ""}`}
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
              className={`shrink-0 select-none cursor-move text-builder-ink-ghost leading-none ${isCompact ? "text-[9px]" : "text-xs"}`}
            >
              ⠿
            </span>
          )}
          <select
            id={`regb-${cellKey}-subj`}
            aria-label={`${ariaBase} の教科`}
            className={`flex-1 min-w-0 bg-transparent font-bold cursor-pointer text-builder-ink focus:outline-none ${isCompact ? "text-[11px] leading-tight py-0" : "text-[13px]"}`}
            value={c.subj || ""}
            onChange={(e) => onCellChange(cellKey, "subj", e.target.value)}
            onKeyDown={(e) => onNavigate(e, cellKey, "subj")}
          >
            <option value="">-</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {!subjKnown && <option value={c.subj}>{c.subj}</option>}
          </select>
          {conflictText && (
            <span
              className={`bg-builder-red text-white rounded shrink-0 animate-pulse ${isCompact ? "text-[8px] px-0.5" : "text-[10px] px-1"}`}
            >
              ⚠️重複
            </span>
          )}
        </div>

        {teacherFreeEdit ? (
          <input
            id={`regb-${cellKey}-teacher`}
            type="text"
            autoFocus
            aria-label={`${ariaBase} の講師 (直接入力)`}
            value={c.teacher || ""}
            list="regb-teachers"
            placeholder="講師 (·区切りで複数)"
            className={`w-full rounded border-0 bg-white/70 text-builder-blue focus:outline-none ${isCompact ? "text-[10px] py-0 px-0.5" : "text-xs py-0.5 px-1"}`}
            onChange={(e) => onCellChange(cellKey, "teacher", e.target.value)}
            onBlur={(e) => commitTeacherFree(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.target.blur();
              else if (e.key === "Escape") {
                freeCancelRef.current = true; // blur 側で編集開始時の値に戻す
                e.target.blur();
              }
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
                freeOriginalRef.current = c.teacher || "";
                setTeacherFreeEdit(true);
              } else onCellChange(cellKey, "teacher", e.target.value);
            }}
            onKeyDown={(e) => onNavigate(e, cellKey, "teacher")}
          >
            <option value="">-</option>
            {teachers.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
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
