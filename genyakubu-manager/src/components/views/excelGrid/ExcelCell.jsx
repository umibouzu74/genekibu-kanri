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
import { BiweeklyWeekBadge } from "../../BiweeklyWeekBadge";

// 状態 (pending / nosub / requested / confirmed) → 表示メタ。
const SUB_STATE_META = {
  pending: subStateMeta({ substitute: "", status: "requested" }),
  nosub: subStateMeta({ substitute: "", status: "confirmed" }),
  requested: subStateMeta({ substitute: "x", status: "requested" }),
  confirmed: subStateMeta({ substitute: "x", status: "confirmed" }),
};

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
  isHolidayOff,
  pendingSub,
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

  // 休講日のセルは合同・移動より優先 (休みなら実質何も起こらない)。
  // 逆に sub/pending/unavailable と合同は同時起こり得るので併記する。
  if (isDragOver) {
    bg = "#e8f4ff";
  } else if (isHolidayOff) {
    bg = "#f5f0e0";
    borderLeft = "3px solid #b8860b";
    badges.push(mkBadge("#b8860b", "休", "holiday"));
    teacherColor = "#aaa";
  } else if (pendingSub) {
    bg = "#e0f5e0";
    borderLeft = "3px solid #2a7a4a";
    badges.push(mkBadge("#2a7a4a", "仮", "pending"));
    teacherColor = "#888";
    teacherDecor = "line-through";
    partialStrikeOriginals = pendingSub.originalTeacher ? [pendingSub.originalTeacher] : [];
    subDisplay = (
      <div style={{ fontSize: 12, fontWeight: 800, color: "#2a7a4a", marginTop: 1 }}>
        ← {pendingSub.substitute}
      </div>
    );
  } else if (existingSubs.length > 0) {
    // 代行者が未定のまま登録した欠勤 (substitute: "") も必ず出す。
    // ここで落とすと、代行が見つかるまで時間割上は通常授業に見えてしまう。
    // 1 コマを複数人で担当するコマ (プレップ) は**講師ごとに 1 件**なので、
    // 休む人ぶんだけ並べる。
    const anyCovered = existingSubs.some((x) => x.substitute);
    const tone = anyCovered ? "#3a6ea5" : "#c03030";
    bg = anyCovered ? "#e8f0ff" : "#fff0f0";
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
            {existingSubs.length > 1 ? `${x.originalTeacher} ⇒ ` : ""}
            {x.substitute ? `← ${x.substitute}` : subTargetLabel(x)}
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
  }

  // 合同・移動は休講日には意味がないのでそこでは表示しない (バッジもつけない)。
  if (!isHolidayOff) {
    if (absorbed) {
      // 合同で吸収された側: 既存の sub 背景がなければ紫で塗って line-through
      if (!pendingSub && existingSubs.length === 0) {
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

  // In sub mode, all cells with a teacher are clickable (for chain substitutions)
  const isClickable = isSubMode && (slot.teacher || pendingSub || isCombineTarget);

  const handleClick = (e) => {
    if (!isClickable || !onCellClick) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    onCellClick(slot, rect, el);
  };

  // In sub mode, cells are draggable for swap-based substitution
  const subModeDraggable = isSubMode && isAdmin && slot.teacher && !isHolidayOff;

  return (
    <td
      colSpan={colSpan}
      draggable={subModeDraggable || (isAdmin && !isSubMode)}
      onDragStart={isAdmin ? onDragStart : undefined}
      onDragOver={isAdmin ? onDragOver : undefined}
      onDragLeave={isAdmin ? onDragLeave : undefined}
      onDrop={isAdmin ? onDrop : undefined}
      onDragEnd={isAdmin ? onDragEnd : undefined}
      onDoubleClick={isAdmin && onEdit && !isSubMode ? () => onEdit(slot) : undefined}
      onClick={handleClick}
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
            color: teacherColor,
            marginTop: 2,
            textDecoration: teacherDecor,
          }}
        >
          {(() => {
            if (teacherOverride != null) return teacherOverride;
            if (activeBiweeklyTeacher) return `${activeBiweeklyTeacher} (隔週)`;
            // 多担任 (例: "香川·福江·川井") の slot で代行が発生している場合、
            // 取消線を originalTeacher の名前のみに絞る。それ以外の担任は
            // 通常の色で見える状態に戻す。
            const teachers = getSlotTeachers(slot);
            const struck = new Set(
              partialStrikeOriginals.filter((t) => teachers.includes(t))
            );
            if (teacherDecor === "line-through" && teachers.length > 1 && struck.size > 0) {
              return teachers.map((t, i) => (
                <Fragment key={i}>
                  {i > 0 && (
                    <span style={{ color: "#1a1a2e", textDecoration: "none" }}>·</span>
                  )}
                  {struck.has(t) ? (
                    <span>{t}</span>
                  ) : (
                    <span style={{ color: "#1a1a2e", textDecoration: "none" }}>{t}</span>
                  )}
                </Fragment>
              ));
            }
            return formatBiweeklyTeacher(slot.teacher, slot.note);
          })()}
        </div>
        {subDisplay}
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
