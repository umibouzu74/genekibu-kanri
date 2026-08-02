import { useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { S } from "../styles/common";
import { useToasts } from "../hooks/useToasts";
import { useConfirm } from "../hooks/useConfirm";
import { applyReflection, buildReflectionPlan } from "./reflect";

// ─── 反映ダイアログ ─────────────────────────────────────────────────
// 下書きを本体の時間割 + コマに書き出す。新規作成 (時間割を作る) と
// 置き換え (既存時間割のコマを差し替え) の 2 モード。置き換えは cascade
// (旧コマ削除 → 代行・調整の参照切れ) を伴うため確認ダイアログを挟む
// (CLAUDE.md 削除 UX ルールの confirmedRemove 相当)。

export function ReflectDialog({
  project,
  timetables,
  slots,
  saveTimetables,
  saveSlots,
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

  const execute = async () => {
    if (!plan.ok) return;
    if (mode === "replace") {
      const target = timetables.find((t) => t.id === Number(targetId));
      const ok = await confirm({
        title: "時間割の置き換え",
        message:
          `「${target?.name ?? "?"}」の既存 ${replaceTargetCount} コマを削除して、` +
          `下書きの ${total} コマに差し替えます。\n` +
          `削除されるコマに紐づく代行・調整・回数補正は無効になります。\n\nよろしいですか？`,
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
    toasts.success(
      mode === "replace"
        ? `置き換えました（削除 ${result.removedCount} / 追加 ${result.addedCount} コマ）`
        : `時間割「${opts.name}」として ${result.addedCount} コマを反映しました`
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
              現在 {replaceTargetCount} コマ。反映時に削除して差し替えます。
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
