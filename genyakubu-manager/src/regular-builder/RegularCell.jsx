import { memo, useEffect, useRef, useState } from "react";
import { formatBiweeklyTeacher, splitTeacherField } from "../utils/biweekly";
import {
  getSubjectColor,
  CONFLICT_CELL_BG,
} from "../timetable-builder/utils/constants";
import { useLongPress } from "../timetable-builder/hooks/useLongPress";

// ─── セル (ダッシュボードの時間割ビュー風 display-first) ─────────────
// 普段はダッシュボードと同じ「テキスト中心」の表示 (科目 + 講師 + 教室/
// 備考)。クリック (または Enter/Space) したセルだけがその場で入力
// (教科/講師のプルダウン + 教室/備考の小入力) に切り替わり、セルの外へ
// フォーカスが移る / Enter / Escape で表示に戻る。
//
// - 表示セルはフォーム部品が無いのでセル全体を掴んでドラッグ入替できる
// - 科目カラー背景・衝突の赤背景 + ⚠️バッジ・講師ハイライトは両モード共通
// - 講師プルダウンには busyTeachers (同曜日・同時間帯に他セルで割当済みの
//   講師) へ「(重複)」を予告する。選択は妨げない (承認フローで消せるため)
// - 教科・講師とも「✎ 直接入力」でテキスト入力に切り替え可能 (マスタ外の
//   単発教科や「·」区切りの複数講師用)。講師は確定時に splitTeacherField
//   で正規化する (CLAUDE.md の複数講師区切り規約)

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
        // Escape がセルの編集終了 (td 側) まで波及しないように
        e.stopPropagation();
      }}
    />
  );
}

export const RegularCell = memo(function RegularCell({
  cellRef,
  cell,
  /** 科目名 → 背景色。教科マスタで正規化された解決関数 (subjectColor.js)。
      未指定なら素の getSubjectColor (文字列そのもの) にフォールバック */
  subjectColor = null,
  subjects,
  teachers,
  conflictText,
  /** 衝突バッジの文言 ("重複" | "NG")。conflictText がある時のみ使う */
  conflictBadge = "重複",
  /** "·" 区切りの講師名リスト: この曜日・時間帯に他セルで割当済み (予告用) */
  busyTeachers = "",
  /** "·" 区切りの講師名リスト: この曜日・時間帯が NG (不在) の講師 (予告用) */
  ngTeachers = "",
  highlighted,
  dimmed,
  roomPlaceholder,
  /** 合同 (結合) セル用: セル既定教室を表示モードでも出す (列見出しが無いため) */
  displayRoomFallback = "",
  ariaBase,
  /** td へ追加するクラス (学年グループ境界の罫線など) */
  tdExtra = "",
  /** 合同 (結合) セルの横断幅。1 = 通常セル */
  colSpan = 1,
  /** この列から始まる未入力の合同枠: "ref\tラベル" を改行区切りで。⊞ で編集開始 */
  mergeStarters = "",
  isCompact,
  isEditing,
  /** 重複ジャンプ・Undo フィードバックの一時ハイライト */
  isFlashing = false,
  onStartEdit,
  onEndEdit,
  onCellChange,
  onClearCell,
  onNavigate,
  /** 右クリック / 長押しでコンテキストメニューを開く (pos, cellRef) */
  onOpenMenu,
  /** Ctrl+C / Ctrl+V (表示セルにフォーカスがある時のキーボード操作) */
  onCopyCell,
  onPasteCell,
  /** 複数選択: 選択中フラグと Ctrl/Shift+クリックのハンドラ (e, cellRef) */
  isSelected = false,
  onSelectCell,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  isDragOver,
  isDragSource,
}) {
  const c = cell || {};
  // タッチの長押しでもコンテキストメニューを開く (講習 E1f と同じ hook)
  const longPress = useLongPress(
    onOpenMenu ? (pos) => onOpenMenu(pos, cellRef) : null
  );
  const [teacherFreeEdit, setTeacherFreeEdit] = useState(false);
  const [subjFreeEdit, setSubjFreeEdit] = useState(false);
  // 直接入力の取消 (Escape) 用: 編集開始時の値
  const teacherOriginalRef = useRef("");
  const subjOriginalRef = useRef("");

  // 編集を離れたら直接入力モードは持ち越さない
  useEffect(() => {
    if (!isEditing) {
      setTeacherFreeEdit(false);
      setSubjFreeEdit(false);
    }
  }, [isEditing]);

  const hasContent = !!(c.subj || c.teacher || c.room || c.note);
  // 🔒 ロック中: 編集・クリア・ドラッグを受け付けない (解除は右クリック
  // メニュー / 選択バー)。コピー (Ctrl+C) と選択は許可する
  const locked = !!c.locked;
  const bgColor = conflictText
    ? CONFLICT_CELL_BG
    : (subjectColor || getSubjectColor)(c.subj);
  const innerBorder = conflictText
    ? "border-2 border-builder-red"
    : "border border-builder-border";

  const teacherKnown =
    !c.teacher || teachers.some((t) => t.name === c.teacher);
  const subjKnown = !c.subj || subjects.includes(c.subj);
  const busySet = new Set(splitTeacherField(busyTeachers));
  const ngSet = new Set(splitTeacherField(ngTeachers));

  // regb-selected は印刷スタイル (printStyle.js) が紙面から選択装飾を
  // 除くためのマーカー
  const tdBase = `group border-r border-builder-border last:border-r-0 align-top ${tdExtra} ${isCompact ? "p-px" : "p-1.5"} ${isDragOver ? "ring-2 ring-builder-blue ring-inset bg-builder-info-soft" : ""} ${isDragSource ? "opacity-50" : ""} ${!isDragOver && highlighted ? "ring-2 ring-builder-blue ring-inset" : ""} ${dimmed ? "opacity-40" : ""} ${isSelected ? "regb-selected ring-2 ring-builder-green ring-inset bg-builder-success-soft" : ""} ${isFlashing ? "animate-pulse ring-4 ring-builder-blue ring-inset" : ""}`;

  const starters = mergeStarters
    ? mergeStarters.split("\n").map((s) => {
        const i = s.indexOf("\t");
        return { ref: s.slice(0, i), label: s.slice(i + 1) };
      })
    : [];

  // ── 表示モード (ダッシュボード風テキスト) ────────────────────────
  if (!isEditing) {
    return (
      <td
        id={`regb-${cellRef}-cell`}
        colSpan={colSpan > 1 ? colSpan : undefined}
        tabIndex={0}
        role="button"
        aria-label={locked ? `${ariaBase}（ロック中）` : `${ariaBase} を編集`}
        title={
          locked
            ? (conflictText ? `${conflictText}\n` : "") +
              "🔒 ロック中: 右クリック（長押し）→ 🔓 ロック解除で編集できます"
            : conflictText ||
              "クリックで編集 / ドラッグで入替 (Ctrl+ドラッグでコピー) / Ctrl+クリックで複数選択 / Ctrl+C・Ctrl+V・Delete"
        }
        className={`${tdBase} ${locked ? "" : "cursor-pointer hover:bg-builder-info-soft"}`}
        draggable={!!c.subj && !locked}
        onDragStart={(e) => onDragStart(e, cellRef, c)}
        onDragOver={(e) => onDragOver(e, cellRef)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, cellRef)}
        onDragEnd={onDragEnd}
        {...longPress}
        onContextMenu={
          onOpenMenu
            ? (e) => {
                e.preventDefault();
                onOpenMenu({ clientX: e.clientX, clientY: e.clientY }, cellRef);
              }
            : undefined
        }
        onMouseDown={(e) => {
          // Shift+クリックの範囲選択でテキスト選択が走らないように
          if (e.shiftKey && onSelectCell) e.preventDefault();
        }}
        onClick={(e) => {
          if (onSelectCell && (e.ctrlKey || e.metaKey || e.shiftKey)) {
            e.preventDefault();
            onSelectCell(e, cellRef);
          } else if (!locked) {
            onStartEdit(cellRef, "subj");
          }
        }}
        onKeyDown={(e) => {
          const k = e.key.toLowerCase();
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!locked) onStartEdit(cellRef, "subj");
          } else if ((e.ctrlKey || e.metaKey) && k === "c" && onCopyCell) {
            e.preventDefault();
            onCopyCell(cellRef);
          } else if ((e.ctrlKey || e.metaKey) && k === "v" && onPasteCell) {
            // ロック中は App 側が toast で理由を出す
            e.preventDefault();
            onPasteCell(cellRef);
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            if (hasContent && !locked) onClearCell(cellRef);
          } else {
            onNavigate(e, cellRef, "cell");
          }
        }}
      >
        <div
          className={`flex flex-col rounded h-full ${innerBorder} ${isCompact ? "gap-0 p-0.5 min-h-[1.6rem]" : "gap-0.5 p-1 min-h-[2.9rem]"} ${!bgColor && !hasContent ? "bg-builder-surface-alt/50" : ""}`}
          style={bgColor ? { backgroundColor: bgColor } : undefined}
        >
          {/* regb-cell-head: 印刷スタイル (printStyle.js) が flex を解除する
              目印。紙面は truncate を外して折り返すが、⚠バッジが同じ行を
              占めたままだと狭い列で科目名が 1 文字ずつ縦に折り返るため、
              紙面ではブロック整形にしてバッジを科目名の後ろへ流す */}
          <div
            className={`regb-cell-head flex items-center min-w-0 ${isCompact ? "gap-0.5" : "gap-1"}`}
          >
            <span
              className={`regb-cell-subj flex-1 min-w-0 truncate font-bold text-builder-ink ${isCompact ? "text-[11px] leading-tight" : "text-[13px]"}`}
            >
              {c.subj || ""}
            </span>
            {conflictText && (
              <span
                className={`bg-builder-red text-white rounded shrink-0 animate-pulse ${isCompact ? "text-[8px] px-0.5" : "text-[10px] px-1"}`}
              >
                ⚠️{conflictBadge}
              </span>
            )}
            {/* 🔒: ロック中の常時マーカー (紙面には載せない) */}
            {locked && (
              <span
                className={`no-print shrink-0 leading-none opacity-70 ${isCompact ? "text-[9px]" : "text-xs"}`}
                aria-label="ロック中"
              >
                🔒
              </span>
            )}
            {/* ⊞: この列から始まる合同枠 (S〜B 等) に新しくコマを入れる */}
            {starters.map((st) => (
              <button
                key={st.ref}
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEdit(st.ref, "subj");
                }}
                aria-label={`合同コマ「${st.label}」を追加`}
                title={`合同コマ「${st.label}」をこの行に追加 (${st.label} の幅に結合表示されます)`}
                className={`no-print shrink-0 border-0 bg-transparent cursor-pointer p-0 leading-none text-builder-ink-ghost hover:text-builder-blue opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${isCompact ? "text-[9px]" : "text-xs"}`}
              >
                ⊞
              </button>
            ))}
            {hasContent && !locked && (
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onClearCell(cellRef);
                }}
                aria-label={`${ariaBase} をクリア`}
                title="このセルをクリア (Ctrl+Z で戻せます)"
                className={`no-print shrink-0 border-0 bg-transparent cursor-pointer p-0 leading-none text-builder-ink-ghost hover:text-builder-red opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${isCompact ? "text-[9px]" : "text-xs"}`}
              >
                ✕
              </button>
            )}
          </div>
          {c.teacher && (
            <div
              className={`regb-cell-teacher truncate ${conflictText ? "text-builder-red font-extrabold" : "text-builder-blue"} ${isCompact ? "text-[10px] leading-tight" : "text-xs"}`}
            >
              {/* 隔週コマは note のパートナーも「主担当 / パートナー」で見せる
                  (ダッシュボードの表示と同じ) */}
              {formatBiweeklyTeacher(c.teacher, c.note)}
            </div>
          )}
          {(c.room || displayRoomFallback || c.note) && (
            <div
              className={`regb-cell-sub text-builder-ink-muted truncate leading-tight ${isCompact ? "text-[9px]" : "text-[10px]"}`}
            >
              {/* 合同セルは列見出しが無いので既定教室もここに出す */}
              {[c.room || displayRoomFallback, c.note].filter(Boolean).join(" ")}
            </div>
          )}
        </div>
      </td>
    );
  }

  // ── 編集モード (プルダウン入力) ──────────────────────────────────
  const closeEdit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onEndEdit(cellRef, true); // Enter/Escape はセルへフォーカスを戻す
  };
  const editorKeys = (field) => (e) => {
    if (e.key === "Escape" || e.key === "Enter") closeEdit(e);
    else onNavigate(e, cellRef, field);
  };

  return (
    <td
      className={tdBase}
      colSpan={colSpan > 1 ? colSpan : undefined}
      title={conflictText || undefined}
      // フォーカスがセルの外へ出たら表示モードへ戻る
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onEndEdit(cellRef, false);
      }}
    >
      <div
        className={`flex flex-col rounded h-full ${innerBorder} ${isCompact ? "gap-0 p-0.5" : "gap-1 p-1"} ${!bgColor && !hasContent ? "bg-builder-surface-alt/50" : ""}`}
        style={bgColor ? { backgroundColor: bgColor } : undefined}
      >
        <div className={`flex items-center min-w-0 ${isCompact ? "gap-0.5" : "gap-1"}`}>
          {subjFreeEdit ? (
            <FreeTextInput
              id={`regb-${cellRef}-subj`}
              ariaLabel={`${ariaBase} の教科 (直接入力)`}
              value={c.subj || ""}
              list="regb-subjects"
              placeholder="教科"
              className={`flex-1 min-w-0 rounded border-0 bg-white/70 font-bold text-builder-ink focus:outline-none ${isCompact ? "text-[11px] leading-tight py-0" : "text-[13px]"}`}
              onChange={(v) => onCellChange(cellRef, "subj", v)}
              onCommit={(v) => {
                const trimmed = v.trim();
                if (trimmed !== (c.subj || "")) onCellChange(cellRef, "subj", trimmed);
                setSubjFreeEdit(false);
              }}
              onCancel={() => {
                if ((c.subj || "") !== subjOriginalRef.current)
                  onCellChange(cellRef, "subj", subjOriginalRef.current);
                setSubjFreeEdit(false);
              }}
            />
          ) : (
            <select
              id={`regb-${cellRef}-subj`}
              aria-label={`${ariaBase} の教科`}
              className={`flex-1 min-w-0 bg-transparent font-bold cursor-pointer text-builder-ink focus:outline-none ${isCompact ? "text-[11px] leading-tight py-0" : "text-[13px]"}`}
              value={c.subj || ""}
              onChange={(e) => {
                if (e.target.value === FREE_EDIT) {
                  subjOriginalRef.current = c.subj || "";
                  setSubjFreeEdit(true);
                } else onCellChange(cellRef, "subj", e.target.value);
              }}
              onKeyDown={editorKeys("subj")}
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
              ⚠️{conflictBadge}
            </span>
          )}
          {/* 編集中は ✕ を常設 (表示モードの ✕ はホバー表示のため、
              タッチ端末ではこちらが唯一のクリア導線になる)。クリア後は
              ボタンごと消えてフォーカスが宙に浮くため、明示的に編集を
              終了して表示セルへフォーカスを戻す */}
          {hasContent && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                onClearCell(cellRef);
                onEndEdit(cellRef, true);
              }}
              aria-label={`${ariaBase} をクリア`}
              title="このセルをクリア (Ctrl+Z で戻せます)"
              className={`no-print shrink-0 border-0 bg-transparent cursor-pointer p-0 leading-none text-builder-ink-ghost hover:text-builder-red ${isCompact ? "text-[9px]" : "text-xs"}`}
            >
              ✕
            </button>
          )}
        </div>

        {teacherFreeEdit ? (
          <FreeTextInput
            id={`regb-${cellRef}-teacher`}
            ariaLabel={`${ariaBase} の講師 (直接入力)`}
            value={c.teacher || ""}
            list="regb-teachers"
            placeholder="講師 (·区切りで複数)"
            className={`w-full rounded border-0 bg-white/70 text-builder-blue focus:outline-none ${isCompact ? "text-[10px] py-0 px-0.5" : "text-xs py-0.5 px-1"}`}
            onChange={(v) => onCellChange(cellRef, "teacher", v)}
            onCommit={(v) => {
              const normalized = splitTeacherField(v).join("·");
              if (normalized !== (c.teacher || ""))
                onCellChange(cellRef, "teacher", normalized);
              setTeacherFreeEdit(false);
            }}
            onCancel={() => {
              if ((c.teacher || "") !== teacherOriginalRef.current)
                onCellChange(cellRef, "teacher", teacherOriginalRef.current);
              setTeacherFreeEdit(false);
            }}
          />
        ) : (
          <select
            id={`regb-${cellRef}-teacher`}
            aria-label={`${ariaBase} の講師`}
            className={`w-full rounded cursor-pointer ${conflictText ? "text-builder-red font-extrabold" : "text-builder-blue"} ${isCompact ? "text-[10px] py-0 leading-tight" : "text-xs py-0.5"} ${!c.subj && !c.teacher ? "opacity-50" : "bg-white/50 hover:bg-builder-surface"}`}
            value={c.teacher || ""}
            onChange={(e) => {
              if (e.target.value === FREE_EDIT) {
                teacherOriginalRef.current = c.teacher || "";
                setTeacherFreeEdit(true);
              } else onCellChange(cellRef, "teacher", e.target.value);
            }}
            onKeyDown={editorKeys("teacher")}
          >
            <option value="">-</option>
            {teachers.map((t) => {
              const busy = busySet.has(t.name);
              const ng = ngSet.has(t.name);
              return (
                <option
                  key={t.name}
                  value={t.name}
                  className={
                    ng
                      ? "bg-builder-danger-soft"
                      : busy
                        ? "bg-builder-warning-soft"
                        : ""
                  }
                >
                  {t.name}
                  {ng ? " (NG)" : ""}
                  {busy ? " (重複)" : ""}
                </option>
              );
            })}
            {!teacherKnown && <option value={c.teacher}>{c.teacher}</option>}
            <option value={FREE_EDIT}>✎ 直接入力…</option>
          </select>
        )}

        <div className="flex gap-1">
          <input
            type="text"
            aria-label={`${ariaBase} の教室`}
            value={c.room || ""}
            list="regb-rooms"
            onChange={(e) => onCellChange(cellRef, "room", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" || e.key === "Enter") closeEdit(e);
            }}
            placeholder={roomPlaceholder || "教室"}
            className="w-14 rounded border-0 bg-white/40 px-1 text-[10px] text-builder-ink-muted focus:outline-none placeholder:text-builder-ink-ghost"
          />
          <input
            type="text"
            aria-label={`${ariaBase} の備考`}
            value={c.note || ""}
            onChange={(e) => onCellChange(cellRef, "note", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" || e.key === "Enter") closeEdit(e);
            }}
            placeholder="備考"
            className="flex-1 min-w-0 rounded border-0 bg-white/40 px-1 text-[10px] text-builder-ink-muted focus:outline-none placeholder:text-builder-ink-ghost"
          />
        </div>
      </div>
    </td>
  );
});
