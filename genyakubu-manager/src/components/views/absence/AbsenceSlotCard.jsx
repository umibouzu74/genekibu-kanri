import { Fragment, useMemo } from "react";
import { ADJ_COLOR, gradeColor as GC } from "../../../data";
import { colors } from "../../../styles/tokens";
import {
  formatBiweeklyTeacher,
  getSlotTeachers,
  getSlotWeekType,
  isBiweekly,
} from "../../../utils/biweekly";
import { formatSessionNumber } from "../../../utils/sessionCount";
import { subState, subStateMeta, subTargetLabel } from "../../../utils/substituteState";
import { BiweeklyWeekBadge } from "../../BiweeklyWeekBadge";

// 状態 (pending / nosub / requested / confirmed) → 表示メタ。
// substituteState の 1 か所から引く (色とラベルを画面ごとに書き起こさない)。
const STATE_META = {
  pending: subStateMeta({ substitute: "", status: "requested" }),
  nosub: subStateMeta({ substitute: "", status: "confirmed" }),
  requested: subStateMeta({ substitute: "x", status: "requested" }),
  confirmed: subStateMeta({ substitute: "x", status: "confirmed" }),
};

// ─── 欠勤 UI 用スロットカード ──────────────────────────────────
// 欠勤バッジ・下書き状態・代行表示・振替表示・回数バッジを統合し、
// DnD と右クリックはカード上で発火する。

export function AbsenceSlotCard({
  slot,
  date, // 対象日 (YYYY-MM-DD) — 隔週の A/B 判定に使用
  biweeklyAnchors,
  holidays, // 隔週ローテーションのシフトに使う (任意)
  examPeriods, // 隔週ローテーションのシフトに使う (任意)
  isAbsent,
  cancelLabel, // 当日が「休講」「テスト期間」等で授業が走らない場合のラベル
  isMoved,
  isCombineHost,
  absorbedLabel, // host のとき: "+ 中3A 理科"
  isAbsorbed,
  hostLabel, // absorbed のとき: "→ 中3S 理科"
  // このコマの代行 / 欠勤レコード (元講師ごとに 1 件)。
  //   [{ originalTeacher, substitute, status }, …]
  // プレップのように 1 コマを 3 人で担当するコマがあるので配列で受ける。
  subs = [],

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
  // 講師欄の並び (香川·福江·川井) に、その講師の代行 / 欠勤を突き合わせる。
  // 講師欄に出てこない元講師 (隔週 B 週のパートナー) は末尾に足す。
  const teacherLine = useMemo(() => {
    const byTeacher = new Map(subs.map((x) => [x.originalTeacher, x]));
    const line = getSlotTeachers(slot).map((teacher) => ({
      teacher,
      sub: byTeacher.get(teacher) || null,
    }));
    const listed = new Set(line.map((x) => x.teacher));
    for (const x of subs) {
      if (!listed.has(x.originalTeacher)) {
        line.push({ teacher: x.originalTeacher, sub: x });
      }
    }
    return line;
  }, [slot, subs]);
  const biweekly = isBiweekly(slot.note);
  const weekType = biweekly && date
    ? getSlotWeekType(date, slot, biweeklyAnchors, holidays, examPeriods)
    : null;

  // 休講 / テスト期間: 操作系をすべて無効化し、ラベル + 灰色化で簡素表示。
  if (cancelLabel) {
    return (
      <div
        style={{
          background: "#f5f5f5",
          border: "1px dashed #c0c0c0",
          borderRadius: 6,
          padding: "6px 8px",
          minWidth: 0,
          position: "relative",
          opacity: 0.7,
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              background: gc.b,
              color: gc.f,
              borderRadius: 3,
              padding: "1px 4px",
              fontSize: 10,
              fontWeight: 700,
              opacity: 0.6,
            }}
          >
            {slot.grade}
            {slot.cls && slot.cls !== "-" ? slot.cls : ""}
          </span>
          <span style={{ fontSize: 12, color: "#888", textDecoration: "line-through" }}>
            {slot.subj}
          </span>
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            marginTop: 2,
            color: colors.danger,
            letterSpacing: 1,
          }}
        >
          {cancelLabel}
        </div>
        {slot.teacher && (
          <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>
            {formatBiweeklyTeacher(slot.teacher, slot.note)}
          </div>
        )}
      </div>
    );
  }

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

  // キーボード操作 (2026-09-04): 欠勤組み換えの主要操作 (代行・合同・移動・
  // 回数補正) は右クリック → メニュー か D&D にしか無かった。Tab で到達し、
  // Enter / Space でクリック相当、ContextMenu キー / Shift+F10 で右クリック
  // 相当 (メニューはカードの左下に出す)。読み上げ用の名前も付ける
  const interactive = !!(onClick || onContextMenu);
  const stateWords = [
    isAbsent ? "欠勤" : null,
    isRescheduled ? "振替中" : null,
    isMoved ? "移動" : null,
    isCombineHost ? "合同" : null,
    isAbsorbed ? "合同に吸収" : null,
    ...[...new Set(subs.map((x) => subState(x)))].map((st) => STATE_META[st]?.label),
  ].filter(Boolean);
  const ariaLabel = [
    slot.time,
    [slot.grade, slot.cls].filter(Boolean).join(" "),
    slot.subj,
    getSlotTeachers(slot).join("・"),
    stateWords.length ? `（${stateWords.join("、")}）` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (!onClick) return;
      e.preventDefault();
      onClick(e);
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      if (!onContextMenu) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      onContextMenu({
        preventDefault() {},
        stopPropagation() {},
        clientX: r.left + 8,
        clientY: r.bottom - 4,
        currentTarget: e.currentTarget,
        target: e.currentTarget,
      });
    }
  };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
      onClick={onClick}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
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
      {(isMoved || isCombineHost || subs.length > 0 || isRescheduled) && (
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
          {/* 状態は講師ごと。同じ状態が並んでも 1 つにまとめる
              (3 人欠勤で「未定」が 3 つ並ぶと読みづらい)。 */}
          {[...new Set(subs.map((x) => subState(x)))].map((st) => {
            const meta = STATE_META[st];
            return <BadgeChip key={st} color={meta.color} label={meta.badge} />;
          })}
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
          // 第N回バッジは Dashboard (SectionColumn) / MonthView と同じ
          // 青地・白文字の塗りスタイルに統一 (K3e)
          <span
            title={`第${sessionCount}回`}
            aria-label={`第${sessionCount}回`}
            style={{
              background: "#3a6ea5",
              color: "#fff",
              borderRadius: 4,
              padding: "0 5px",
              fontSize: 11,
              fontWeight: 800,
              lineHeight: "16px",
              minWidth: 18,
              textAlign: "center",
              flexShrink: 0,
            }}
          >
            {formatSessionNumber(sessionCount)}
          </span>
        )}
      </div>

      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2, color: "#1a1a2e" }}>
        {subs.length === 0 ? (
          formatBiweeklyTeacher(slot.teacher, slot.note)
        ) : (
          <>
            {/* 講師欄の並びのまま、休む人だけ取消線 + 行き先を出す。
                出る人はそのまま黒で残す (プレップで 1 人だけ休む日に
                全員休みに見えないように)。 */}
            {teacherLine.map(({ teacher, sub }, i) => (
              <Fragment key={i}>
                {i > 0 && <span style={{ color: "#1a1a2e", fontWeight: 600 }}>·</span>}
                {sub ? (
                  <span style={{ color: STATE_META[subState(sub)].color }}>
                    <span style={{ textDecoration: "line-through" }}>{teacher}</span>
                    <span style={{ margin: "0 2px" }}>⇒</span>
                    {subTargetLabel(sub)}
                  </span>
                ) : (
                  <span style={{ color: "#1a1a2e", fontWeight: 600 }}>{teacher}</span>
                )}
              </Fragment>
            ))}
          </>
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
