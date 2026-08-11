import { useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { S } from "../styles/common";
import { useToasts } from "../hooks/useToasts";
import { useConfirm } from "../hooks/useConfirm";
import { addSnapshot } from "./model";
import {
  applyReflection,
  buildReflectionPlan,
  describeDiffChange,
  describeDiffRecord,
  diffReflection,
} from "./reflect";

// 差分リストの最大表示行数 (超過分は「…他 n 件」)
const DIFF_LINE_LIMIT = 12;

function DiffLines({ mark, color, records, describe }) {
  const shown = records.slice(0, DIFF_LINE_LIMIT);
  return (
    <>
      {shown.map((r, i) => (
        <div key={i} style={{ color, fontSize: 11 }}>
          {mark} {describe(r)}
        </div>
      ))}
      {records.length > shown.length && (
        <div style={{ color: "#888", fontSize: 10 }}>
          …他 {records.length - shown.length} 件
        </div>
      )}
    </>
  );
}

// ─── 反映ダイアログ ─────────────────────────────────────────────────
// 下書きを本体の時間割 + コマに書き出す。新規作成 (時間割を作る) と
// 置き換え (既存時間割のコマを差し替え) の 2 モード。置き換えは位置の
// 一致したコマの slot.id を引き継ぐので代行・調整・回数補正・授業セットの
// 紐付けは保たれるが、下書きに無いコマは削除される (= cascade) ため確認
// ダイアログを挟む (CLAUDE.md 削除 UX ルールの confirmedRemove 相当)。

export function ReflectDialog({
  project,
  timetables,
  slots,
  saveTimetables,
  saveSlots,
  saveProject,
  onClose,
}) {
  const toasts = useToasts();
  const confirm = useConfirm();
  const [mode, setMode] = useState("new");
  const [name, setName] = useState(project.name || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetId, setTargetId] = useState(timetables[timetables.length - 1]?.id ?? 1);

  const opts = useMemo(() => {
    const base = { mode, name, targetTimetableId: Number(targetId) };
    if (mode === "replace") {
      // 置き換えでは空欄 = 据え置き (undefined を渡すと applyReflection が現値を維持)
      if (startDate) base.startDate = startDate;
      if (endDate) base.endDate = endDate;
    } else {
      base.startDate = startDate || null;
      base.endDate = endDate || null;
    }
    return base;
  }, [mode, name, startDate, endDate, targetId]);
  const plan = useMemo(() => buildReflectionPlan(project, opts), [project, opts]);
  const total = plan.drafts.length;
  const replaceTargetCount = useMemo(
    () =>
      mode === "replace"
        ? slots.filter((s) => (s.timetableId ?? 1) === Number(targetId)).length
        : 0,
    [mode, slots, targetId]
  );
  // 置き換え時の差分プレビュー (変わらず / 変更 / 追加 / 削除)
  const diff = useMemo(
    () =>
      mode === "replace" && plan.drafts.length > 0
        ? diffReflection(plan.drafts, slots, Number(targetId))
        : null,
    [mode, plan.drafts, slots, targetId]
  );

  const execute = async () => {
    if (!plan.ok) return;
    if (mode === "replace") {
      const target = timetables.find((t) => t.id === Number(targetId));
      // 位置の一致したコマは同じコマとして引き継がれる (applyReflection が
      // slot.id を保つ)。紐付けが切れるのは実際に消える差分だけなので、
      // 確認文もその実態に合わせる
      const kept = diff ? diff.unchanged + diff.changed.length : 0;
      const lost = diff ? diff.removed.length : replaceTargetCount;
      const ok = await confirm({
        title: "時間割の置き換え",
        message:
          `「${target?.name ?? "?"}」の ${replaceTargetCount} コマを、下書きの ${total} コマに差し替えます。\n` +
          `・同じ位置 (曜日・時刻・学年・クラス) の ${kept} コマは同じコマとして引き継ぎます` +
          `（代行・調整・回数補正・授業セットの紐付けは保たれます）\n` +
          (lost > 0
            ? `・下書きに無い ${lost} コマは削除されます。そのコマに紐づく代行・調整・回数補正・授業セットは無効になります\n`
            : "・削除されるコマはありません\n") +
          `\nよろしいですか？`,
        okLabel: "置き換える",
        tone: "danger",
      });
      if (!ok) return;
    }
    const result = applyReflection(plan, opts, { timetables, slots });
    if (result.error) {
      toasts.error(result.error);
      return;
    }
    saveTimetables(result.timetables);
    saveSlots(result.slots);
    // 反映した時点の状態を自動スナップショットで残す (「本体に出したのは
    // どの状態か」に後から必ず戻れる安全網)。他のスナップショット操作と
    // 同じく Ctrl+Z で取り消せる
    const reflectedName =
      (opts.name || "").trim() ||
      timetables.find((t) => t.id === result.timetableId)?.name ||
      "";
    saveProject?.(
      (p) => addSnapshot(p, `⤴ 反映: ${reflectedName || "本体"}`, Date.now()),
      { atomic: true }
    );
    toasts.success(
      (mode === "replace"
        ? `置き換えました（引き継ぎ ${result.keptCount}（うち内容変更 ${result.changedCount}）` +
          ` / 追加 ${result.addedCount} / 削除 ${result.removedCount} コマ）`
        : `時間割「${opts.name}」として ${result.addedCount} コマを反映しました`) +
        "／📌 反映時点の案を保存しました"
    );
    onClose();
  };

  const radio = (value, label) => (
    <label style={{ fontSize: 12, fontWeight: 600, display: "inline-flex", gap: 4, alignItems: "center" }}>
      <input
        type="radio"
        name="reflect-mode"
        checked={mode === value}
        onChange={() => setMode(value)}
      />
      {label}
    </label>
  );

  return (
    <Modal title="本体へ反映" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12 }}>
        <div style={{ display: "flex", gap: 16 }}>
          {radio("new", "新しい時間割として作成")}
          {radio("replace", "既存の時間割を置き換え")}
        </div>

        {mode === "replace" && (
          <label style={{ fontWeight: 600 }}>
            置き換え先
            <select
              value={targetId}
              onChange={(e) => setTargetId(Number(e.target.value))}
              style={{ ...S.input, marginTop: 2, display: "block", minWidth: 200 }}
            >
              {timetables.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 10, color: "#888", fontWeight: 400 }}>
              現在 {replaceTargetCount} コマ。同じ位置 (曜日・時刻・学年・クラス)
              のコマは同じコマとして引き継ぎ、下書きに無いコマだけ削除します。
            </span>
          </label>
        )}

        <label style={{ fontWeight: 600 }}>
          時間割の名前{mode === "replace" ? "（空欄で据え置き）" : ""}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 2026 後期"
            style={{ ...S.input, marginTop: 2 }}
          />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ flex: 1, fontWeight: 600 }}>
            開始日{mode === "replace" ? "（空欄で据え置き）" : ""}
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ ...S.input, marginTop: 2 }}
            />
          </label>
          <label style={{ flex: 1, fontWeight: 600 }}>
            終了日{mode === "replace" ? "（空欄で据え置き）" : ""}
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ ...S.input, marginTop: 2 }}
            />
          </label>
        </div>

        {/* プレビュー */}
        <div style={{ background: "#f6f8fc", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 700 }}>反映されるコマ: {total} 件</div>
          {plan.perTab.map(({ tabName, count }) => (
            <div key={tabName} style={{ color: "#555" }}>
              {tabName}: {count} 件
            </div>
          ))}
        </div>

        {/* 置き換え時の差分プレビュー */}
        {diff && (
          <div style={{ background: "#fbfbf6", border: "1px solid #e8e4d0", borderRadius: 8, padding: 10, maxHeight: 220, overflowY: "auto" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              置き換えによる差分:
              <span style={{ marginLeft: 8, color: "#888" }}>変わらず {diff.unchanged}</span>
              <span style={{ marginLeft: 8, color: "#9a6b00" }}>変更 {diff.changed.length}</span>
              <span style={{ marginLeft: 8, color: "#2a7a2a" }}>追加 {diff.added.length}</span>
              <span style={{ marginLeft: 8, color: "#c03030" }}>削除 {diff.removed.length}</span>
            </div>
            <DiffLines
              mark="✎"
              color="#9a6b00"
              records={diff.changed}
              describe={(c) =>
                `${describeDiffRecord(c.after)}: ${describeDiffChange(c.before, c.after) || "内容変更"}`
              }
            />
            <DiffLines
              mark="＋"
              color="#2a7a2a"
              records={diff.added}
              describe={(r) => `${describeDiffRecord(r)} ${r.subj}`}
            />
            <DiffLines
              mark="－"
              color="#c03030"
              records={diff.removed}
              describe={(r) => `${describeDiffRecord(r)} ${r.subj}`}
            />
            {diff.changed.length === 0 && diff.added.length === 0 && diff.removed.length === 0 && (
              <div style={{ color: "#888", fontSize: 11 }}>内容の変化はありません。</div>
            )}
          </div>
        )}
        {plan.warnings.map((w) => (
          <div key={w} style={{ color: "#9a6b00", fontSize: 11 }}>⚠ {w}</div>
        ))}
        {plan.errors.map((e) => (
          <div key={e} style={{ color: "#c03030", fontSize: 11 }}>✕ {e}</div>
        ))}

        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={S.btn(false)}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={execute}
            disabled={!plan.ok}
            style={{ ...S.btn(true), background: "#2a4a8e", opacity: plan.ok ? 1 : 0.5 }}
          >
            反映する
          </button>
        </div>
      </div>
    </Modal>
  );
}
