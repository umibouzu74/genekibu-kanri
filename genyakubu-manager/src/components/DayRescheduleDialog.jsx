import { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { S } from "../styles/common";
import { DAY_COLOR as DC, gradeColor as GC } from "../data";
import { fmtDateWeekday } from "../utils/dateHelpers";
import {
  applyDayReschedule,
  buildDayReschedulePlan,
  findDayRescheduleAdjustments,
} from "../utils/dayReschedule";

// ─── 日まるごと振替ダイアログ ──────────────────────────────────
// 「12/7 (月) の授業を 12/4 (金) にまとめて振り替える」操作。中身は
// 1 コマずつの振替 (adjustments の reschedule) をまとめて作るだけなので、
// 表示・一覧・解除は既存の振替と同じ経路に乗る。
//
// 画面の作りは「振替元 → 対象コマの確認 → 振替先 → 実行」の一方通行。
// 対象コマは既定で全選択 (まるごと振り替えるのが主目的) だが、外したい
// コマだけチェックを外せる。

const CHECK_ALL = "all";

function SlotRow({ slot, checked, conflicts, onToggle, disabled }) {
  const gc = GC(slot.grade);
  const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "6px 8px",
        borderBottom: "1px solid #eee",
        cursor: disabled ? "default" : "pointer",
        background: conflicts.length > 0 ? "#fdf3f3" : undefined,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => onToggle(slot.id)}
        style={{ marginTop: 3 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
            {slot.time}
          </span>
          <span
            style={{
              background: gc.b,
              color: gc.f,
              borderRadius: 3,
              padding: "0 5px",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {slot.grade}
            {cls}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{slot.subj}</span>
          <span style={{ fontSize: 11, color: "#555" }}>{slot.teacher}</span>
          {slot.room && (
            <span style={{ fontSize: 10, color: "#888" }}>{slot.room}</span>
          )}
        </div>
        {conflicts.length > 0 && (
          <div style={{ marginTop: 2, fontSize: 10, color: "#a02020" }}>
            {conflicts.map((c, i) => (
              <div key={i}>
                ⚠ {c.kind === "teacher" ? "講師重複" : "教室重複"}: {c.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </label>
  );
}

export function DayRescheduleDialog({
  slots,
  adjustments,
  extraLessons = [],
  subs = [],
  sessionCtx,
  saveAdjustments,
  onRemoveAdjustments,
  onClose,
  onSaved,
  isAdmin = true,
}) {
  const [sourceDate, setSourceDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [memo, setMemo] = useState("");
  // null = 全選択 (振替元日を変えたら選び直し)
  const [excluded, setExcluded] = useState(() => new Set());

  useEffect(() => {
    setExcluded(new Set());
  }, [sourceDate]);

  const plan = useMemo(
    () =>
      buildDayReschedulePlan({
        slots,
        adjustments,
        extraLessons,
        subs,
        sourceDate,
        targetDate,
        selectedSlotIds: null,
        ctx: sessionCtx,
      }),
    [slots, adjustments, extraLessons, subs, sourceDate, targetDate, sessionCtx]
  );

  // 除外を反映した最終プラン。実行するのはこちら。候補の一覧は除外前の
  // plan から出す (チェックを外したコマも行としては残す)。
  const selectedIds = useMemo(
    () => plan.candidates.filter((s) => !excluded.has(s.id)).map((s) => s.id),
    [plan.candidates, excluded]
  );
  const finalPlan = useMemo(
    () =>
      buildDayReschedulePlan({
        slots,
        adjustments,
        extraLessons,
        subs,
        sourceDate,
        targetDate,
        selectedSlotIds: selectedIds,
        ctx: sessionCtx,
      }),
    [
      slots,
      adjustments,
      extraLessons,
      subs,
      sourceDate,
      targetDate,
      selectedIds,
      sessionCtx,
    ]
  );

  // 行に出す重なり。選んでいるコマは最終プラン (選んでいないコマは振替先に
  // 残るので、埋まりとして数えた結果) を、選んでいないコマは全選択時の
  // プランを使う。
  const conflictsBySlot = useMemo(() => {
    const m = new Map();
    for (const e of plan.entries) m.set(e.slot.id, e.conflicts);
    for (const e of finalPlan.entries) m.set(e.slot.id, e.conflicts);
    return m;
  }, [plan.entries, finalPlan.entries]);

  const existing = useMemo(
    () => findDayRescheduleAdjustments(adjustments, sourceDate),
    [adjustments, sourceDate]
  );

  const toggle = (id) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (id === CHECK_ALL) {
        if (next.size > 0) return new Set();
        for (const s of plan.candidates) next.add(s.id);
        return next;
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canApply =
    isAdmin && finalPlan.errors.length === 0 && finalPlan.entries.length > 0;
  // 開いた直後 (どちらの日付も未入力) は赤字を出さない。ボタンが押せない
  // ことと空の入力欄で足りるので、開くたびにエラーで迎えない。
  const showErrors = Boolean(sourceDate || targetDate);

  const handleApply = () => {
    if (!canApply) return;
    const { next, added, replaced } = applyDayReschedule({
      adjustments,
      plan: finalPlan,
      memo: memo.trim(),
    });
    saveAdjustments(next);
    onSaved?.({ added, replaced, sourceDate, targetDate });
    onClose?.();
  };

  const handleClearExisting = () => {
    if (existing.length === 0) return;
    onRemoveAdjustments?.(existing.map((a) => a.id));
  };

  return (
    <Modal
      title="📅 日まるごと振替"
      onClose={onClose}
      width="min(720px, 96vw)"
    >
      <div style={{ fontSize: 12, color: "#666", marginBottom: 12, lineHeight: 1.7 }}>
        ある日の授業をまとめて別の日へ振り替えます (例: 12/7 (月) の授業を
        すべて 12/4 (金) に寄せる)。作られるのは 1 コマずつの「別日振替」なので、
        個別の解除は時間割調整一覧から、1 コマだけの時刻変更や講師の差し替えは
        欠勤組み換え画面からできます。
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <label htmlFor="day-resched-src" style={S.formLabel}>
            振替元日
          </label>
          <input
            id="day-resched-src"
            type="date"
            value={sourceDate}
            onChange={(e) => setSourceDate(e.target.value)}
            style={{ ...S.input, width: "auto" }}
          />
          {plan.sourceDay && (
            <div style={{ fontSize: 11, color: DC[plan.sourceDay], fontWeight: 700 }}>
              {plan.sourceDay}曜 / 実施 {plan.candidates.length} コマ
            </div>
          )}
        </div>
        <div style={{ alignSelf: "center", fontSize: 18, color: "#888" }}>→</div>
        <div>
          <label htmlFor="day-resched-dst" style={S.formLabel}>
            振替先日
          </label>
          <input
            id="day-resched-dst"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            style={{ ...S.input, width: "auto" }}
          />
          {plan.targetDay && (
            <div style={{ fontSize: 11, color: DC[plan.targetDay], fontWeight: 700 }}>
              {plan.targetDay}曜
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label htmlFor="day-resched-memo" style={S.formLabel}>
            メモ (任意)
          </label>
          <input
            id="day-resched-memo"
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例: 12/7 の授業を 12/4 へ"
            style={S.input}
          />
        </div>
      </div>

      {existing.length > 0 && (
        <div
          style={{
            background: "#fdecea",
            border: "1px solid #f0b0b0",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 11,
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "#a03030", fontWeight: 700 }}>
            {fmtDateWeekday(sourceDate)} には振替が {existing.length} 件登録済みです
          </span>
          {isAdmin && (
            <button
              type="button"
              onClick={handleClearExisting}
              title="この日から出ている振替をすべて解除します (振替先は問いません)"
              style={{ ...S.btn(false), fontSize: 11, padding: "4px 10px" }}
            >
              まとめて解除
            </button>
          )}
        </div>
      )}

      {finalPlan.notes.length > 0 && (
        <ul
          style={{
            background: "#fdf5e8",
            border: "1px solid #e0c080",
            borderRadius: 6,
            padding: "8px 8px 8px 26px",
            fontSize: 11,
            color: "#7a4a10",
            margin: "0 0 10px",
          }}
        >
          {finalPlan.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {showErrors && finalPlan.errors.length > 0 && (
        <ul
          style={{
            fontSize: 11,
            color: "#a02020",
            margin: "0 0 10px",
            paddingLeft: 18,
          }}
        >
          {finalPlan.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      {plan.candidates.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            <strong style={{ fontSize: 12 }}>
              振替するコマ {selectedIds.length} / {plan.candidates.length}
            </strong>
            <button
              type="button"
              onClick={() => toggle(CHECK_ALL)}
              style={{ ...S.btn(false), fontSize: 11, padding: "4px 10px" }}
            >
              {excluded.size > 0 ? "すべて選択" : "すべて解除"}
            </button>
          </div>
          <div
            style={{
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              maxHeight: 260,
              overflow: "auto",
              background: "#fff",
            }}
          >
            {plan.candidates.map((slot) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                checked={!excluded.has(slot.id)}
                conflicts={conflictsBySlot.get(slot.id) || []}
                onToggle={toggle}
                disabled={!isAdmin}
              />
            ))}
          </div>
        </div>
      )}

      {plan.skipped.length > 0 && (
        <details style={{ fontSize: 11, color: "#666", marginBottom: 10 }}>
          <summary style={{ cursor: "pointer" }}>
            対象外のコマ {plan.skipped.length} 件 (振替元日に実施されない)
          </summary>
          <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
            {plan.skipped.map(({ slot, reason }) => (
              <li key={slot.id}>
                {slot.time} {slot.grade}
                {slot.cls && slot.cls !== "-" ? slot.cls : ""} {slot.subj} —{" "}
                <span style={{ color: "#a06010" }}>{reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* 対象コマが多いと縦に伸びるので、注記と実行ボタンは下に貼り付ける。
          脚注ごと sticky にしないと、ボタンの下に説明文が取り残される。 */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: S.card.background,
          borderTop: "1px solid #eee",
          paddingTop: 8,
        }}
      >
        <div
          style={{ fontSize: 10, color: "#888", marginBottom: 8, lineHeight: 1.6 }}
        >
          時刻は変えずに日付だけを移します。第N回は振替元の日付で数えたまま
          です (授業の回数は増減しません)。
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={S.btn(false)}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            style={{
              ...S.btn(true),
              opacity: canApply ? 1 : 0.5,
              cursor: canApply ? "pointer" : "not-allowed",
            }}
          >
            {finalPlan.entries.length > 0
              ? `${finalPlan.entries.length} コマを振り替える`
              : "振り替える"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
