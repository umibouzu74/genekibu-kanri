import { ADJ_COLOR, gradeColor as GC } from "../../../data";
import { colors } from "../../../styles/tokens";
import {
  formatBiweeklyTeacher,
  getSlotWeekType,
  isBiweekly,
} from "../../../utils/biweekly";
import { formatSessionNumber } from "../../../utils/sessionCount";
import { BiweeklyWeekBadge } from "../../BiweeklyWeekBadge";

// ─── 欠勤 UI 用スロットカード ──────────────────────────────────
// 欠勤バッジ・下書き状態・代行表示・振替表示・回数バッジを統合し、
// DnD と右クリックはカード上で発火する。

export function AbsenceSlotCard({
  slot,
  date, // 対象日 (YYYY-MM-DD) — 隔週の A/B 判定に使用
  biweeklyAnchors,
  isAbsent,
  isMoved,
  isCombineHost,
  absorbedLabel, // host のとき: "+ 中3A 理科"
  isAbsorbed,
  hostLabel, // absorbed のとき: "→ 中3S 理科"
  substituteName, // 代行済みなら代行者名。未設定なら null
  substituteStatus, // "confirmed" | "requested"
  overrideLabel, // 補正バッジ文字列 (例: "第4回 補正" / "カウント外")
  sessionCount, // 回数 (override 反映後)
  isCombineCandidate, // 合同モード中の候補ハイライト用
  isCombineSource, // 合同モード中の起点
  disableDrag, // DnD 抑止 (合同ホスト / 吸収済み / 合同モード中など)
  dimmed, // 合同モード中の非候補: 暗くする
  isRescheduled, // 他日へ振替中
  rescheduleLabel, // 振替情報テキスト (例: "振替 → 2026-05-01 19:00-20:20")
  onContextMenu,
  onDragStart,
  onClick,
}) {
  const gc = GC(slot.grade);
  const biweekly = isBiweekly(slot.note);
  const weekType = biweekly && date
    ? getSlotWeekType(date, slot, biweeklyAnchors)
    : null;

  const borderColor = isCombineSource
    ? "#e0a020"
    : isCombineCandidate
      ? "#ffc107"
      : isAbsent
        ? colors.danger
        : isRescheduled
          ? ADJ_COLOR.reschedule.color
          : isMoved
            ? ADJ_COLOR.move.color
            : isCombineHost
              ? "#e0a020"
              : "#ddd";

  const background = isRescheduled
    ? ADJ_COLOR.reschedule.bg
    : isMoved
      ? ADJ_COLOR.move.bg
      : isCombineHost
        ? "#fff8e0"
        : isAbsorbed
          ? "#fafafa"
          : "#fff";

  const draggable = !isAbsorbed && !disableDrag;
  const cursor = isAbsorbed
    ? "not-allowed"
    : draggable
      ? "grab"
      : isCombineCandidate || isCombineSource
        ? "pointer"
        : "default";

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
      onClick={onClick}
      style={{
        background,
        border: `${isCombineCandidate || isCombineSource || isAbsent ? 2 : 1}px ${
          isCombineCandidate ? "dashed" : "solid"
        } ${borderColor}`,
        borderRadius: 6,
        padding: "6px 8px",
        cursor,
        minWidth: 0,
        position: "relative",
        opacity: isAbsorbed ? 0.55 : dimmed ? 0.35 : 1,
        userSelect: "none",
      }}
    >
      {/* 状態バッジ (右上) */}
      {(isMoved || isCombineHost || substituteName || isRescheduled) && (
        <div
          style={{
            position: "absolute",
            top: -8,
            right: 4,
            display: "flex",
            gap: 3,
          }}
        >
          {isRescheduled && (
            <BadgeChip color={ADJ_COLOR.reschedule.color} label="振替" />
          )}
          {isMoved && (
            <BadgeChip color={ADJ_COLOR.move.color} label="移動" />
          )}
          {isCombineHost && (
            <BadgeChip color="#c08020" label="合同" />
          )}
          {substituteName && (
            <BadgeChip
              color={substituteStatus === "confirmed" ? colors.success : colors.danger}
              label={substituteStatus === "confirmed" ? "代行" : "依頼"}
            />
          )}
        </div>
      )}

      {/* 欠勤バッジ (左上) */}
      {isAbsent && (
        <div
          style={{
            position: "absolute",
            top: -8,
            left: 4,
            background: colors.danger,
            color: "#fff",
            fontSize: 9,
            fontWeight: 800,
            padding: "1px 6px",
            borderRadius: 3,
          }}
        >
          ❗欠勤
        </div>
      )}

      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            background: gc.b,
            color: gc.f,
            borderRadius: 3,
            padding: "1px 4px",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {slot.grade}
          {slot.cls && slot.cls !== "-" ? slot.cls : ""}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{slot.subj}</span>
        {biweekly && <BiweeklyWeekBadge weekType={weekType} />}
        {sessionCount > 0 && (
          <span
            style={{
              fontSize: 11,
              color: "#2a6a9e",
              fontWeight: 700,
            }}
          >
            {formatSessionNumber(sessionCount)}
          </span>
        )}
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          marginTop: 2,
          color: substituteName ? colors.danger : "#1a1a2e",
        }}
      >
        {substituteName ? (
          <>
            {formatBiweeklyTeacher(slot.teacher, slot.note)}
            <span style={{ margin: "0 2px" }}>⇒</span>
            {substituteName}
          </>
        ) : (
          formatBiweeklyTeacher(slot.teacher, slot.note)
        )}
      </div>

      {slot.room && (
        <div style={{ fontSize: 11, color: "#888" }}>{slot.room}</div>
      )}

      {absorbedLabel && (
        <div style={{ fontSize: 10, color: "#8a6a20", marginTop: 2 }}>
          {absorbedLabel}
        </div>
      )}
      {hostLabel && (
        <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
          {hostLabel}
        </div>
      )}
      {rescheduleLabel && (
        <div
          style={{
            fontSize: 10,
            color: ADJ_COLOR.reschedule.deep,
            fontWeight: 700,
            marginTop: 2,
          }}
        >
          {rescheduleLabel}
        </div>
      )}
      {overrideLabel && (
        <div
          style={{
            fontSize: 10,
            color: "#6a3d8e",
            background: "#f4edf8",
            marginTop: 4,
            padding: "1px 4px",
            borderRadius: 3,
            display: "inline-block",
          }}
        >
          {overrideLabel}
        </div>
      )}
    </div>
  );
}

function BadgeChip({ color, label }) {
  return (
    <span
      style={{
        background: color,
        color: "#fff",
        fontSize: 9,
        fontWeight: 800,
        padding: "1px 6px",
        borderRadius: 3,
      }}
    >
      {label}
    </span>
  );
}
