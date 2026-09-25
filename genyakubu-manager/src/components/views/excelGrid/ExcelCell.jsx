import { Fragment, memo } from "react";
import { ADJ_COLOR, fmtDate } from "../../../data";
import {
  formatBiweeklyTeacher,
  getSlotTeachers,
  getSlotWeekType,
  isBiweekly,
} from "../../../utils/biweekly";
import { formatSessionNumber } from "../../../utils/sessionCount";
import { subState, subStateMeta, subTargetLabel } from "../../../utils/substituteState";
import {
  describeRescheduleTarget,
  describeSlot,
} from "../../../utils/adjustmentDisplay";
import { describeTeacherConflict } from "../../../utils/teacherConflicts";
import { BiweeklyWeekBadge } from "../../BiweeklyWeekBadge";

// 状態 (pending / nosub / requested / confirmed) → 表示メタ。
const SUB_STATE_META = {
  pending: subStateMeta({ substitute: "", status: "requested" }),
  nosub: subStateMeta({ substitute: "", status: "confirmed" }),
  requested: subStateMeta({ substitute: "x", status: "requested" }),
  confirmed: subStateMeta({ substitute: "x", status: "confirmed" }),
};

// 代行 / 欠勤レコード 1 件ぶんの行の文言。多担任コマ (プレップ) では
// 「誰が」を付けないと、残りの担当者まで休むように読める。
function subLineText(x, withName) {
  if (x.substitute) return `${withName ? `${x.originalTeacher} ⇒ ` : ""}← ${x.substitute}`;
  const label = subTargetLabel(x);
  return withName ? `${x.originalTeacher} 休み（${label}）` : label;
}

const NO_NAMES = Object.freeze([]);

// セル内で並べる小さなステータスバッジ。
// 代/仮/休/欠/合/合+/移 を同じ見た目で生成する。
function mkBadge(color, label, key, title) {
  return (
    <span
      key={key}
      title={title}
      style={{
        background: color,
        color: "#fff",
        padding: "0 4px",
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

// ─── ExcelCell ──────────────────────────────────────────────────────
// Single cell in the Excel-like timetable grid. Highly memoised because
// the parent re-renders on every drag/hover state update.
export const ExcelCell = memo(function ExcelCell({
  slot,
  colSpan,
  isAdmin,
  isDragOver,
  isDragSource,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onEdit,
  biweeklyAnchors,
  holidays,
  examPeriods,
  subDate,
  isUnavailable,
  // 代行モードで欠勤に選ばれた講師のうち、このコマの担当者 (多担任コマで
  // 取消線をその人だけに絞るため)
  unavailableNames = NO_NAMES,
  isHolidayOff,
  // 代行モードの仮代行 (元講師ごとに 1 件)。多担任コマは複数件。
  pendingSubs = [],
  // このコマの代行 / 欠勤レコード (元講師ごとに 1 件)。多担任コマは複数件。
  existingSubs = [],
  isSubMode,
  isCombineTarget,
  onCellClick,
  sessionNumber,
  teacherOverride,
  dashboardMode = false,
  absorbed = false,
  absorbedHostSlot = null,
  isCombineHost = false,
  hostedSlots = null,
  moveTarget = null,
  moveOriginalTime = null,
  moveDayScheduleLabel = null,
  rescheduleOut = null, // { targetDate, targetTime?, targetTeacher? }
  // 講師の同時刻の重なり (utils/teacherConflicts)。代行を入れた結果
  // 同じ人が 2 か所に居るときに出す。警告であって禁止ではない
  teacherConflicts = null,
  // 講師名クリックでその人の月間へ (閲覧モードだけ。代行モードはセル全体が
  // クリック対象なので渡さない)
  onSelectTeacher,
}) {
  if (!slot) {
    // Empty droppable cell
    return (
      <td
        colSpan={colSpan}
        onDragOver={isAdmin ? onDragOver : undefined}
        onDragLeave={isAdmin ? onDragLeave : undefined}
        onDrop={isAdmin ? onDrop : undefined}
        style={{
          border: "1px solid #ddd",
          padding: 4,
          minWidth: 100,
          height: 60,
          verticalAlign: "top",
          background: isDragOver ? "#e8f4ff" : "#fafafa",
          transition: "background .15s",
          ...(isAdmin && {
            borderStyle: isDragOver ? "solid" : "dashed",
            borderColor: isDragOver ? "#4a90d9" : "#ddd",
          }),
        }}
      />
    );
  }

  const biweekly = isBiweekly(slot.note);
  const weekType = biweekly
    ? getSlotWeekType(subDate || fmtDate(new Date()), slot, biweeklyAnchors, holidays, examPeriods)
    : null;

  // ダッシュボード時のみ: note が "隔週(partner)" 形式の隔週スロットで、
  // A 週は slot.teacher、B 週は括弧内の partner を active とする。
  // 実データは複合教科 (例: "英/数") のペアで使われる想定で、隔週の A/B に
  // 応じて実際に担当する教員を表示する。アンカー未設定 (weekType null) や
  // note が "隔週" のみ (partner 未指定) の場合は従来通りの併記表示。
  const biweeklyPartnerMatch =
    biweekly && dashboardMode ? slot.note.match(/隔週\(([^)]+)\)/) : null;
  const activeBiweeklyTeacher =
    biweeklyPartnerMatch && weekType
      ? weekType === "A"
        ? slot.teacher
        : biweeklyPartnerMatch[1]
      : null;

  // Determine cell visual state (priority order).
  // 合同・移動バッジは他の状態と重なり得るため配列で後から追加する。
  let bg = "#fff";
  let borderLeft = undefined;
  const badges = [];
  let teacherColor = "#1a1a2e";
  let teacherDecor = "none";
  let subjColor = "#444";
  let subjDecor = "none";
  let subDisplay = null;
  // 多担任スロット (例: プレップ「香川·福江·川井」) で代行・欠勤が出た時に、
  // 取消線をその講師だけに絞るための名前リスト。
  let partialStrikeOriginals = [];
  const slotTeachers = getSlotTeachers(slot);
  const multiTeacher = slotTeachers.length > 1;

  // 休講日のセルは合同・移動より優先 (休みなら実質何も起こらない)。
  // 逆に sub/pending/unavailable と合同は同時起こり得るので併記する。
  if (isDragOver) {
    bg = "#e8f4ff";
  } else if (isHolidayOff) {
    bg = "#f5f0e0";
    borderLeft = "3px solid #b8860b";
    badges.push(mkBadge("#b8860b", "休", "holiday"));
    teacherColor = "#aaa";
  } else if (pendingSubs.length > 0) {
    bg = "#e0f5e0";
    borderLeft = "3px solid #2a7a4a";
    badges.push(mkBadge("#2a7a4a", "仮", "pending"));
    teacherColor = "#888";
    teacherDecor = "line-through";
    // 仮代行を付けた人と、保存済みの代行 / 欠勤が残っている人の両方に取消線。
    // 同じ元講師は仮代行の方が勝つ (保存すると置き換わるレコード)
    const pendingTeachers = new Set(pendingSubs.map((p) => p.originalTeacher));
    const restSubs = existingSubs.filter((x) => !pendingTeachers.has(x.originalTeacher));
    partialStrikeOriginals = [
      ...pendingSubs.map((p) => p.originalTeacher),
      ...restSubs.map((x) => x.originalTeacher),
    ].filter(Boolean);
    const multi = multiTeacher || pendingSubs.length + restSubs.length > 1;
    subDisplay = (
      <div style={{ fontSize: 12, fontWeight: 800, marginTop: 1, lineHeight: 1.3 }}>
        {pendingSubs.map((p, i) => (
          <div key={`p${i}`} style={{ color: "#2a7a4a" }}>
            {multi ? `${p.originalTeacher} ⇒ ` : ""}← {p.substitute}
          </div>
        ))}
        {restSubs.map((x, i) => (
          <div key={`e${i}`} style={{ color: SUB_STATE_META[subState(x)].color }}>
            {subLineText(x, multi)}
          </div>
        ))}
      </div>
    );
  } else if (existingSubs.length > 0) {
    // 代行者が未定のまま登録した欠勤 (substitute: "") も必ず出す。
    // ここで落とすと、代行が見つかるまで時間割上は通常授業に見えてしまう。
    // 1 コマを複数人で担当するコマ (プレップ) は**講師ごとに 1 件**なので、
    // 休む人ぶんだけ並べる。
    // 塗りは「まだ手が要るか」で決める。代行未定が残れば赤、代行者が
    // 付いていれば青。代行なしで確定だけなら片付いた欠勤なので、赤で
    // 騒がず状態の色 (茶) にする — 赤だとコマごと止まったように見える
    const anyPending = existingSubs.some((x) => subState(x) === "pending");
    const anyCovered = existingSubs.some((x) => x.substitute);
    const nosubMeta = SUB_STATE_META.nosub;
    const tone = anyPending ? "#c03030" : anyCovered ? "#3a6ea5" : nosubMeta.color;
    bg = anyPending ? "#fff0f0" : anyCovered ? "#e8f0ff" : nosubMeta.bg;
    borderLeft = `3px solid ${tone}`;
    for (const st of new Set(existingSubs.map((x) => subState(x)))) {
      const meta = SUB_STATE_META[st];
      badges.push(
        mkBadge(
          meta.color,
          st === "pending" || st === "nosub" ? "欠" : "代",
          `sub-${st}`,
          existingSubs
            .filter((x) => subState(x) === st)
            .map((x) => `${x.originalTeacher} → ${subTargetLabel(x)}`)
            .join("\n")
        )
      );
    }
    teacherColor = "#888";
    teacherDecor = "line-through";
    partialStrikeOriginals = existingSubs.map((x) => x.originalTeacher).filter(Boolean);
    subDisplay = (
      <div style={{ fontSize: 12, fontWeight: 800, marginTop: 1, lineHeight: 1.3 }}>
        {existingSubs.map((x, i) => (
          <div key={i} style={{ color: SUB_STATE_META[subState(x)].color }}>
            {subLineText(x, multiTeacher || existingSubs.length > 1)}
          </div>
        ))}
      </div>
    );
  } else if (isUnavailable) {
    bg = "#fff0f0";
    borderLeft = "3px solid #c03030";
    badges.push(mkBadge("#c03030", "欠", "unavail"));
    teacherColor = "#c03030";
    teacherDecor = "line-through";
    partialStrikeOriginals = unavailableNames;
  }

  // 合同・移動は休講日には意味がないのでそこでは表示しない (バッジもつけない)。
  if (!isHolidayOff) {
    if (absorbed) {
      // 合同で吸収された側: 既存の sub 背景がなければ紫で塗って line-through
      if (pendingSubs.length === 0 && existingSubs.length === 0) {
        bg = ADJ_COLOR.combine.bg;
        borderLeft = `3px solid ${ADJ_COLOR.combine.color}`;
        teacherColor = "#888";
        teacherDecor = "line-through";
        if (absorbedHostSlot) {
          subDisplay = (
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: ADJ_COLOR.combine.color,
                marginTop: 1,
              }}
            >
              → {absorbedHostSlot.teacher || "?"} に合同
            </div>
          );
        }
      }
      badges.push(
        mkBadge(
          ADJ_COLOR.combine.color,
          "合",
          "absorbed",
          absorbedHostSlot
            ? `合同で ${describeSlot(absorbedHostSlot)} (${absorbedHostSlot.teacher}) に統合`
            : "合同で吸収"
        )
      );
    } else if (isCombineHost) {
      badges.push(
        mkBadge(
          ADJ_COLOR.combine.color,
          "合+",
          "host",
          hostedSlots && hostedSlots.length
            ? `合同ホスト\n+ ${hostedSlots.map(describeSlot).join(" / ")}`
            : "合同ホスト"
        )
      );
    }

    if (moveTarget) {
      const origTime = moveOriginalTime || slot.time;
      badges.push(
        mkBadge(
          ADJ_COLOR.move.color,
          "移",
          "move",
          moveDayScheduleLabel
            ? `特別時程 (${moveDayScheduleLabel})\n${origTime} → ${moveTarget}`
            : `時間変更\n${origTime} → ${moveTarget}`
        )
      );
    }
  }

  // 振替で他日へ送り出されているコマ: 「振」バッジ + 担当を取消線で薄く。
  // 休講中でも「このコマは別日へ移した」という情報は重要なので、
  // isHolidayOff の外で処理する。
  if (rescheduleOut) {
    const tgtParts = [rescheduleOut.targetDate];
    if (rescheduleOut.targetTime) tgtParts.push(rescheduleOut.targetTime);
    // 担当が変わらない振替では担当を出さない (元担当がそのまま入っている
    // ことがあり、出すと担当が変わったように読める)。
    if (rescheduleOut.targetTeacher && rescheduleOut.targetTeacher !== slot.teacher) {
      tgtParts.push(`(${rescheduleOut.targetTeacher})`);
    }
    badges.push(
      mkBadge(
        ADJ_COLOR.reschedule.color,
        "振",
        "reschedule-out",
        `他日へ振替\n→ ${tgtParts.join(" ")}`
      )
    );
    // 既に substitute / unavailable で teacherDecor が付いていない場合のみ
    // 取消線にする (他状態の表示を上書きしない)
    if (teacherDecor === "none") {
      teacherColor = "#888";
      teacherDecor = "line-through";
    }
    if (!borderLeft) {
      bg = ADJ_COLOR.reschedule.bg;
      borderLeft = `3px solid ${ADJ_COLOR.reschedule.color}`;
    }
    // 「この日はやらない」と一目で分かるよう教科名にも取消線を引き、
    // 行き先をセル内に出す (バッジの tooltip だけだと気付けない)。
    subjDecor = "line-through";
    subjColor = "#8a8a8a";
    if (!subDisplay) {
      subDisplay = (
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: ADJ_COLOR.reschedule.deep,
            marginTop: 1,
          }}
        >
          →{" "}
          {describeRescheduleTarget(rescheduleOut, {
            short: true,
            originalTeacher: slot.teacher,
          })}{" "}
          へ振替
        </div>
      );
    }
  }

  // 講師の同時刻の重なり: バッジ + セル内の 1 行。tooltip だけにしない
  // (一覧を眺めているときに気付けない)。休講のコマは呼び出し側で除いてある。
  const conflictList = teacherConflicts && teacherConflicts.length > 0 ? teacherConflicts : null;
  if (conflictList) {
    badges.push(
      mkBadge(
        "#c03030",
        "⚠ 重複",
        "teacher-conflict",
        conflictList
          .map((c) => describeTeacherConflict(c, { withTime: true }))
          .join("\n")
      )
    );
  }

  // 多担任 (例: "香川·福江·川井") で休む人が一部だけなら、取消線をその人の
  // 名前だけに引く。CSS の text-decoration は子要素へ伝播して子の
  // `none` では消せないので、親の div には付けない (付けると出勤する人の
  // 名前にも線が通って全員休みに見える)。
  const struckTeachers =
    teacherOverride == null &&
    !activeBiweeklyTeacher &&
    teacherDecor === "line-through" &&
    multiTeacher
      ? new Set(partialStrikeOriginals.filter((t) => slotTeachers.includes(t)))
      : null;
  const partialStrike = !!struckTeachers && struckTeachers.size > 0;

  // In sub mode, all cells with a teacher are clickable (for chain substitutions)
  const isClickable = isSubMode && (slot.teacher || pendingSubs.length > 0 || isCombineTarget);

  const handleClick = (e) => {
    if (!isClickable || !onCellClick) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    onCellClick(slot, rect, el);
  };

  // In sub mode, cells are draggable for swap-based substitution
  const subModeDraggable = isSubMode && isAdmin && slot.teacher && !isHolidayOff;

  // キーボード操作 (2026-09-04): 代行モードのクリック・通常モードの
  // ダブルクリック (編集) はマウス専用だった。Tab で到達し Enter / Space で
  // 同じ操作を行う。読み上げ用の名前にはセルの状態も含める
  const canEdit = isAdmin && !!onEdit && !isSubMode;
  const interactive = isClickable || canEdit;
  const a11yStates = [
    isHolidayOff ? "休講" : null,
    pendingSubs.length > 0
      ? `仮代行 ${pendingSubs.map((p) => p.substitute).join("、")}`
      : null,
    // 多担任コマは誰の欠勤かまで読み上げる (「代行なし」だけだと全員に読める)
    ...(multiTeacher
      ? existingSubs.map((x) => `${x.originalTeacher} ${SUB_STATE_META[subState(x)]?.label}`)
      : [...new Set(existingSubs.map((x) => subState(x)))].map((st) => SUB_STATE_META[st]?.label)),
    absorbed ? "合同に吸収" : null,
    isCombineHost ? "合同" : null,
    moveTarget ? "移動" : null,
    rescheduleOut ? "振替中" : null,
    conflictList
      ? `講師重複 ${conflictList.map((c) => describeTeacherConflict(c)).join("、")}`
      : null,
  ].filter(Boolean);
  const ariaLabel = [
    slot.time,
    [slot.grade, slot.cls].filter(Boolean).join(" "),
    slot.subj,
    teacherOverride || slot.teacher,
    sessionNumber ? `第${sessionNumber}回` : "",
    a11yStates.length ? `（${a11yStates.join("、")}）` : "",
    canEdit ? "を編集" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const handleKeyDown = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (isClickable) handleClick(e);
    else if (canEdit) onEdit(slot);
  };

  return (
    <td
      colSpan={colSpan}
      draggable={subModeDraggable || (isAdmin && !isSubMode)}
      onDragStart={isAdmin ? onDragStart : undefined}
      onDragOver={isAdmin ? onDragOver : undefined}
      onDragLeave={isAdmin ? onDragLeave : undefined}
      onDrop={isAdmin ? onDrop : undefined}
      onDragEnd={isAdmin ? onDragEnd : undefined}
      onDoubleClick={canEdit ? () => onEdit(slot) : undefined}
      onClick={handleClick}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      style={{
        border: "1px solid #ccc",
        padding: "4px 6px",
        minWidth: 100,
        verticalAlign: "top",
        cursor: isClickable ? "pointer" : subModeDraggable ? "grab" : isAdmin && !isSubMode ? "grab" : "default",
        background: bg,
        opacity: isDragSource ? 0.4 : 1,
        transition: "background .15s, opacity .15s",
        position: "relative",
        ...(borderLeft && { borderLeft }),
        ...(isCombineTarget && {
          outline: "2px dashed #d4a020",
          outlineOffset: -2,
        }),
      }}
    >
      <div style={{ lineHeight: 1.3 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: subjColor,
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexWrap: "wrap",
          }}
        >
          {sessionNumber > 0 && (
            <span
              title={`第${sessionNumber}回`}
              aria-label={`第${sessionNumber}回`}
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#fff",
                background: "#3a6ea5",
                borderRadius: 4,
                padding: "0 5px",
                lineHeight: "18px",
                minWidth: 20,
                textAlign: "center",
                boxShadow: "0 1px 2px rgba(0,0,0,.12)",
                flexShrink: 0,
              }}
            >
              {formatSessionNumber(sessionNumber)}
            </span>
          )}
          <span style={{ textDecoration: subjDecor }}>{slot.subj}</span>
          {biweekly && <BiweeklyWeekBadge weekType={weekType} />}
          {badges}
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: partialStrike ? "#1a1a2e" : teacherColor,
            marginTop: 2,
            textDecoration: partialStrike ? "none" : teacherDecor,
          }}
        >
          {(() => {
            if (teacherOverride != null) return teacherOverride;
            const nameBtn = (t, label = t) =>
              onSelectTeacher && !isSubMode ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTeacher(t);
                  }}
                  title={`${t} の月間スケジュールを開く`}
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    font: "inherit",
                    color: "inherit",
                    cursor: "pointer",
                    textDecoration: "underline dotted",
                    textUnderlineOffset: 3,
                  }}
                >
                  {label}
                </button>
              ) : (
                label
              );
            if (activeBiweeklyTeacher) {
              return <>{nameBtn(activeBiweeklyTeacher)} (隔週)</>;
            }
            // 休む人だけ薄く取消線、出勤する人はそのまま (名前で月間へ飛べる)
            if (partialStrike) {
              return slotTeachers.map((t, i) => (
                <Fragment key={i}>
                  {i > 0 && "·"}
                  {struckTeachers.has(t) ? (
                    <span
                      style={{
                        color: teacherColor,
                        textDecoration: "line-through",
                        textDecorationThickness: 2,
                      }}
                    >
                      {t}
                    </span>
                  ) : (
                    <span>{nameBtn(t)}</span>
                  )}
                </Fragment>
              ));
            }
            if (onSelectTeacher && !isSubMode && !biweekly && teacherDecor !== "line-through") {
              if (slotTeachers.length > 0) {
                return slotTeachers.map((t, i) => (
                  <Fragment key={i}>
                    {i > 0 && "·"}
                    {nameBtn(t)}
                  </Fragment>
                ));
              }
            }
            return formatBiweeklyTeacher(slot.teacher, slot.note);
          })()}
        </div>
        {subDisplay}
        {conflictList && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#c03030",
              marginTop: 2,
              lineHeight: 1.3,
            }}
          >
            {conflictList.map((c, i) => (
              <div key={i}>⚠ {describeTeacherConflict(c)}</div>
            ))}
          </div>
        )}
        {isCombineHost && hostedSlots && hostedSlots.length > 0 && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: ADJ_COLOR.combine.color,
              marginTop: 2,
              lineHeight: 1.3,
            }}
          >
            {hostedSlots.map((hs) => (
              <div key={hs.id}>
                + {describeSlot(hs)}
                {hs.teacher ? `（${hs.teacher}）` : ""}
              </div>
            ))}
          </div>
        )}
        {slot.note && !slot.note.startsWith("隔週") && slot.note !== "合同" && (
          <div style={{ fontSize: 10, color: "#a0331a", marginTop: 1 }}>
            {slot.note}
          </div>
        )}
      </div>
    </td>
  );
});
