import { useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { computeMergeLayout } from "./mergedColumns";
import { parseCellKey, parseCellRef } from "./model";
import { changeJoint, columnCells } from "./jointEdit";
import { formatCellShort } from "./historyFeedback";
import { UI } from "./ui";

// ─── 合同 (結合) コマの作成・変更ダイアログ ─────────────────────────
// セル右クリック → 「⊞ 合同にする / 合同の変更」で開く。対象クラスを
// チップで選ぶと changeJoint (jointEdit.js) がライブで検証し、実行内容
// (列の新設・再利用・元列の削除) か、できない理由をプレビューに出す。
// 適用は App 側 (applyJointChange) が同じ引数で再計算してコミットする。

export function JointDialog({ project, tab, cellRef, onApply, onClose }) {
  const { key } = parseCellRef(cellRef);
  const { day, periodId, classId } = parseCellKey(key);
  const cell = tab.schedule?.[key];

  const layout = useMemo(() => computeMergeLayout(tab), [tab]);
  const srcRange = layout.ranges.find((r) => r.cls.id === classId) || null;
  const isJoint = !!srcRange;
  const initialIds = useMemo(
    () =>
      srcRange
        ? layout.visible
            .slice(srcRange.startIdx, srcRange.endIdx + 1)
            .map((c) => c.id)
        : [classId],
    [layout, srcRange, classId]
  );
  const [selected, setSelected] = useState(() => new Set(initialIds));
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // この列の他の有効コマ (一括適用の対象。ロック中は対象外)
  const others = useMemo(
    () => columnCells(tab, classId).filter((x) => x.key !== key),
    [tab, classId, key]
  );
  const movable = useMemo(() => others.filter((x) => !x.cell.locked), [others]);
  const lockedCount = others.length - movable.length;
  // 合同列のコマは「同じ授業の別曜日」であることが多いので既定でまとめて
  // 変更する。通常列は別々の授業なので既定は単独
  const [applyAll, setApplyAll] = useState(isJoint && movable.length > 0);

  const perLabel = (pid) => {
    const p = project.periods.find((x) => x.id === pid);
    return p ? p.label || p.time || `時限${pid}` : `時限${pid}`;
  };

  const keys = useMemo(
    () => (applyAll ? [key, ...movable.map((x) => x.key)] : [key]),
    [applyAll, key, movable]
  );
  const memberIds = useMemo(
    () => layout.visible.filter((c) => selected.has(c.id)).map((c) => c.id),
    [layout, selected]
  );
  const result = useMemo(
    () => changeJoint(tab, keys, memberIds, { periods: project.periods }),
    [tab, keys, memberIds, project.periods]
  );

  if (!cell) return null; // 開いている間に消えた (Undo 等) — 何も出さない

  return (
    <Modal title={isJoint ? "合同の変更" : "合同にする"} onClose={onClose}>
      <div className="flex flex-col gap-3 text-xs text-builder-ink">
        <div className="text-[11px] text-builder-ink-muted">
          {day}曜 {perLabel(periodId)}・{tab.name}{" "}
          {srcRange ? srcRange.cls.label : ""} —{" "}
          <span className="font-bold">{formatCellShort(cell)}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-bold">合同にするクラス</span>
          <div className="flex flex-wrap items-center gap-1">
            {layout.visible.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={selected.has(c.id)}
                className={UI.btnToggle(selected.has(c.id))}
              >
                {c.label || c.room || `列${c.id}`}
              </button>
            ))}
          </div>
          <span className={UI.hint}>
            表の並びで連続するクラスを選んでください。1 クラスだけ選ぶと通常のコマに戻ります。
          </span>
        </div>

        {others.length > 0 && (
          <label className="flex items-start gap-1.5">
            <input
              type="checkbox"
              checked={applyAll}
              onChange={(e) => setApplyAll(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              この列の他のコマにも適用（{movable.length} 件:{" "}
              {movable
                .slice(0, 4)
                .map((x) => `${x.day}曜 ${perLabel(x.periodId)}`)
                .join("、")}
              {movable.length > 4 ? " …" : ""}）
              {lockedCount > 0 && (
                <span className="block text-[10px] text-builder-ink-subtle">
                  ロック中の {lockedCount} 件は対象外です
                </span>
              )}
            </span>
          </label>
        )}

        {/* 実行内容 / できない理由のライブプレビュー */}
        {result.ok ? (
          <div className="rounded border border-builder-success-border bg-builder-success-soft px-2.5 py-2 flex flex-col gap-0.5">
            <span>
              「{result.fromLabel}」の {result.moves.length} コマを
              {result.toPlain
                ? `通常コマ「${result.toLabel}」に戻します`
                : `合同「${result.toLabel}」に変更します`}
            </span>
            {result.created.length > 0 && (
              <span className="text-[11px]">
                ・合同列「{result.created.join("」「")}」を新しく作ります
              </span>
            )}
            {result.removedSource && (
              <span className="text-[11px]">
                ・空になる合同列「{result.removedSource}」は削除されます
              </span>
            )}
          </div>
        ) : (
          <div className="rounded border border-builder-danger-border bg-builder-danger-soft px-2.5 py-2 flex flex-col gap-0.5 text-builder-red">
            {result.errors.map((msg) => (
              <span key={msg}>{msg}</span>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-1.5">
          <button type="button" className={UI.btn} onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className={UI.btnPrimary}
            disabled={!result.ok}
            onClick={() => onApply({ tabId: tab.id, keys, memberIds, day })}
          >
            変更する
          </button>
        </div>
      </div>
    </Modal>
  );
}
