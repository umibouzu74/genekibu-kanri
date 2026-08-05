import { useMemo, useRef, useState } from "react";
import { useToasts } from "../hooks/useToasts";
import { useConfirm } from "../hooks/useConfirm";
import { addSnapshot, restoreSnapshot } from "./model";
import { diffProjects, formatCellShort } from "./historyFeedback";
import { UI } from "./ui";

// ─── 📌 スナップショット (プロジェクトの名前付き保存) ───────────────
// 講習ビルダーのスナップショットに相当。別案を試す前に現在の状態を保存
// しておき、「保存時 → 現在」の差分を見て、いつでも復元できる。
// 保存・復元・削除・リネームはすべて commitWorkspace を通るため
// Ctrl+Z で取り消せる。差分のセル行は「表示」で該当セルへジャンプ。

const DIFF_LINE_LIMIT = 20;

export function RegularSnapshotPanel({ project, saveProject, onJump }) {
  const toasts = useToasts();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [diffForId, setDiffForId] = useState(null);
  // リネーム: 講師マスタと同じ Enter/blur 確定・Escape 取消パターン
  const [editing, setEditing] = useState(null); // { id, value }
  const cancelEditRef = useRef(false);

  const snapshots = project.snapshots || [];
  const diffSnap = snapshots.find((s) => s.id === diffForId) || null;
  const diff = useMemo(
    () => (diffSnap ? diffProjects(diffSnap.data, project) : null),
    [diffSnap, project]
  );

  const save = () => {
    const snapName = name.trim() || `案 ${snapshots.length + 1}`;
    saveProject((p) => addSnapshot(p, snapName, Date.now()), { atomic: true });
    toasts.success(`スナップショット「${snapName}」を保存しました`);
    setName("");
  };

  const restore = async (s) => {
    const ok = await confirm({
      title: "スナップショットの復元",
      message:
        `「${s.name}」の保存時の状態に戻しますか？\n` +
        `現在の内容は上書きされます（Ctrl+Z で戻せます）。`,
      okLabel: "復元する",
    });
    if (!ok) return;
    saveProject((p) => restoreSnapshot(p, s.id), { atomic: true });
    toasts.success(`「${s.name}」を復元しました`);
  };

  const remove = async (s) => {
    const ok = await confirm({
      title: "スナップショットの削除",
      message: `スナップショット「${s.name}」を削除しますか？`,
      okLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    saveProject(
      (p) => ({ ...p, snapshots: (p.snapshots || []).filter((x) => x.id !== s.id) }),
      { atomic: true }
    );
    if (diffForId === s.id) setDiffForId(null);
  };

  const commitRename = () => {
    if (!editing) return;
    const { id, value } = editing;
    setEditing(null);
    const trimmed = value.trim();
    if (!trimmed) return;
    saveProject((p) => ({
      ...p,
      snapshots: (p.snapshots || []).map((s) =>
        s.id === id ? { ...s, name: trimmed } : s
      ),
    }));
  };

  const fmtWhen = (t) =>
    t ? new Date(t).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" }) : "";

  // 差分のセル行を 追加 / 削除 / 変更 に分類 (before/after の有無で判る)
  const diffLines = useMemo(() => {
    if (!diff) return [];
    return diff.cellChanges.map((c) => {
      const mark = !c.before ? "＋" : !c.after ? "－" : "≠";
      const color =
        mark === "＋"
          ? "text-builder-green"
          : mark === "－"
            ? "text-builder-red"
            : "text-builder-orange";
      const place = [c.day, c.periodLabel, c.tabName, c.clsLabel]
        .filter(Boolean)
        .join(" ");
      return { ...c, mark, color, place };
    });
  }, [diff]);

  return (
    <div className={`no-print ${UI.panel} text-xs`}>
      <div className={UI.panelHead}>📌 スナップショット</div>
      <div className={UI.hint}>
        別案を試す前に現在の状態を保存しておくと、差分を見ながらいつでも戻せます。
        保存・復元・削除は Ctrl+Z で取り消せます
        （スナップショットは保存容量を使うため、不要になったら削除してください）。
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          placeholder={`名前 (空欄で「案 ${snapshots.length + 1}」)`}
          className={`${UI.input} w-52`}
        />
        <button type="button" className={UI.btnBlue} onClick={save}>
          ＋ 現在の状態を保存
        </button>
      </div>

      {snapshots.length === 0 && (
        <div className="text-builder-ink-subtle">
          保存されたスナップショットはありません。
        </div>
      )}
      {snapshots.map((s) => (
        <div key={s.id} className="flex items-center gap-2 flex-wrap">
          {editing?.id === s.id ? (
            <input
              type="text"
              autoFocus
              value={editing.value}
              aria-label={`${s.name} の新しい名前`}
              onChange={(e) => setEditing({ id: s.id, value: e.target.value })}
              onBlur={() => {
                if (cancelEditRef.current) {
                  cancelEditRef.current = false;
                  setEditing(null);
                } else {
                  commitRename();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.target.blur();
                else if (e.key === "Escape") {
                  cancelEditRef.current = true;
                  e.target.blur();
                }
              }}
              className={`${UI.input} w-40 py-0.5`}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing({ id: s.id, value: s.name })}
              title="クリックで名前を変更"
              className="border-0 bg-transparent cursor-pointer p-0 font-bold text-builder-ink hover:text-builder-blue hover:underline decoration-dotted"
            >
              {s.name}
            </button>
          )}
          <span className="text-builder-ink-subtle text-[10px]">
            {fmtWhen(s.createdAt)}
          </span>
          <div className="flex gap-1 ml-auto">
            <button
              type="button"
              className={UI.btnToggle(diffForId === s.id)}
              onClick={() => setDiffForId((v) => (v === s.id ? null : s.id))}
              title="保存時 → 現在 の差分を表示"
            >
              🔍 差分
            </button>
            <button
              type="button"
              className={UI.btn}
              onClick={() => restore(s)}
              title="このスナップショットの状態に戻す (Ctrl+Z で取り消せます)"
            >
              復元
            </button>
            <button
              type="button"
              className={UI.btnDanger}
              onClick={() => remove(s)}
              aria-label={`${s.name} を削除`}
            >
              🗑
            </button>
          </div>
        </div>
      ))}

      {/* 差分ビュー (保存時 → 現在) */}
      {diffSnap && diff && (
        <div className="bg-builder-bg border border-builder-border rounded p-2 flex flex-col gap-0.5 max-h-56 overflow-y-auto">
          <div className="font-bold">
            「{diffSnap.name}」→ 現在:
            <span className="ml-2 text-builder-green">
              ＋{diffLines.filter((l) => l.mark === "＋").length}
            </span>
            <span className="ml-2 text-builder-red">
              －{diffLines.filter((l) => l.mark === "－").length}
            </span>
            <span className="ml-2 text-builder-orange">
              ≠{diffLines.filter((l) => l.mark === "≠").length}
            </span>
            {diff.otherChanges.length > 0 && (
              <span className="ml-2 font-normal text-builder-ink-muted">
                他: {diff.otherChanges.join("・")}
              </span>
            )}
          </div>
          {diffLines.length === 0 && diff.otherChanges.length === 0 && (
            <div className="text-builder-ink-subtle">変更はありません。</div>
          )}
          {diffLines.slice(0, DIFF_LINE_LIMIT).map((l) => (
            <div key={l.ref} className="flex items-center gap-1.5">
              <span className={`flex-1 ${l.color}`}>
                {l.mark} {l.place}: {formatCellShort(l.before)} →{" "}
                {formatCellShort(l.after)}
              </span>
              <button
                type="button"
                onClick={() => onJump([l.ref], l.day)}
                title="該当セルへ移動"
                className="border-0 bg-transparent cursor-pointer p-0 text-builder-blue hover:underline"
              >
                表示
              </button>
            </div>
          ))}
          {diffLines.length > DIFF_LINE_LIMIT && (
            <div className="text-builder-ink-subtle text-[10px]">
              …他 {diffLines.length - DIFF_LINE_LIMIT} 件
            </div>
          )}
        </div>
      )}
    </div>
  );
}
