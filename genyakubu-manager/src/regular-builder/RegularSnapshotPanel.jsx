import { useMemo, useRef, useState } from "react";
import { useToasts } from "../hooks/useToasts";
import { useConfirm } from "../hooks/useConfirm";
import { addSnapshot, restoreSnapshot } from "./model";
import { diffProjects, formatCellShort } from "./historyFeedback";
import { formatBytes, projectStorageSize } from "./storageSize";
import { UI } from "./ui";

// ─── 📌 スナップショット (プロジェクトの名前付き保存) ───────────────
// 講習ビルダーのスナップショットに相当。別案を試す前に現在の状態を保存
// しておき、「保存時 → 現在」の差分を見て、いつでも復元できる。
// 保存・復元・削除・リネームはすべて commitWorkspace を通るため
// Ctrl+Z で取り消せる。差分のセル行は「表示」で該当セルへジャンプ。
//
// 差分ビューは他のプロジェクト (「2026 1学期」など) との比較にも使う —
// 突き合わせの実体 (diffProjects) は同じで、比較相手が違うだけ。
// ただし学年 (タブ) とクラスの対応付けは **id 基準** なので、複製・取込で
// 系譜のつながったプロジェクト同士でないと対応がずれる (無関係な 2 つを
// 比べると差分がノイズになる)。UI にもその旨を出す。
// 下書きは 1 キーに全プロジェクトが入るため、保存サイズも併記する
// (スナップショットを溜めすぎて quota に当たる前に気付けるように)。

const DIFF_LINE_LIMIT = 20;

export function RegularSnapshotPanel({ project, otherProjects = [], saveProject, onJump }) {
  const toasts = useToasts();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  // 差分の相手: {kind: "snapshot"|"project", id} (null = 非表示)
  const [diffFor, setDiffFor] = useState(null);
  // リネーム: 講師マスタと同じ Enter/blur 確定・Escape 取消パターン
  const [editing, setEditing] = useState(null); // { id, value }
  const cancelEditRef = useRef(false);

  const snapshots = useMemo(() => project.snapshots || [], [project.snapshots]);
  const size = useMemo(() => projectStorageSize(project), [project]);

  // 比較相手の解決 (スナップショット or 他のプロジェクト)
  const diffSource = useMemo(() => {
    if (!diffFor) return null;
    if (diffFor.kind === "snapshot") {
      const s = snapshots.find((x) => x.id === diffFor.id);
      return s ? { label: s.name, data: s.data } : null;
    }
    const p = otherProjects.find((x) => x.id === diffFor.id);
    return p ? { label: p.name || "無題", data: p } : null;
  }, [diffFor, snapshots, otherProjects]);
  const diff = useMemo(
    () => (diffSource ? diffProjects(diffSource.data, project) : null),
    [diffSource, project]
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
    if (diffFor?.kind === "snapshot" && diffFor.id === s.id) setDiffFor(null);
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
        保存・復元・削除は Ctrl+Z で取り消せます。
        {" "}このプロジェクトの保存サイズは約 {formatBytes(size.total)}
        {snapshots.length > 0 && (
          <>（うちスナップショット {snapshots.length} 件で {formatBytes(size.snapshots)}）</>
        )}
        。容量を使うため、不要になったスナップショットは削除してください。
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

      {/* 他のプロジェクトとの比較 (「1学期 と 2学期 で何が違うか」)。
          突き合わせはスナップショット差分と同じ diffProjects */}
      {otherProjects.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-builder-ink-muted">他のプロジェクトと比較:</span>
          <select
            value={diffFor?.kind === "project" ? diffFor.id : ""}
            onChange={(e) =>
              setDiffFor(
                e.target.value ? { kind: "project", id: Number(e.target.value) } : null
              )
            }
            aria-label="比較するプロジェクト"
            className={`${UI.input} min-w-[150px]`}
          >
            <option value="">選択なし</option>
            {otherProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || "無題"}
              </option>
            ))}
          </select>
          <span className="text-builder-ink-subtle">
            選んだプロジェクト → このプロジェクト の差分を下に出します
            （複製・取込で枝分かれしたプロジェクト同士で使ってください。
            無関係なプロジェクトだと学年・クラスの対応がずれます）
          </span>
        </div>
      )}

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
              className={UI.btnToggle(
                diffFor?.kind === "snapshot" && diffFor.id === s.id
              )}
              onClick={() =>
                setDiffFor((v) =>
                  v?.kind === "snapshot" && v.id === s.id
                    ? null
                    : { kind: "snapshot", id: s.id }
                )
              }
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

      {/* 差分ビュー (比較相手 → 現在) */}
      {diffSource && diff && (
        <div className="bg-builder-bg border border-builder-border rounded p-2 flex flex-col gap-0.5 max-h-56 overflow-y-auto">
          <div className="font-bold">
            「{diffSource.label}」→ 現在:
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
