import { useCallback, useMemo } from "react";
import { buildConflictView, computeConflicts, conflictKey } from "../conflicts";

// ─── 重なり (講師 / 教室 / クラス・NG・校舎移動) の検出と承認
// (RegularBuilderApp から 2026-09-05 に切り出し)。検出は conflicts.js、
// ここは project から一覧・承認済みの振り分け・タブ別件数を作り、
// 承認 / 解除 / 無効承認の掃除を saveProject に流す。
export function useConflictApprovals({ project, saveProject, toasts }) {
  const conflictList = useMemo(() => computeConflicts(project).list, [project]);
  const conflictView = useMemo(
    () => buildConflictView(conflictList, project.approvedConflicts),
    [conflictList, project.approvedConflicts]
  );

  // タブ別の未承認衝突件数 (タブバーの ⚠ バッジ用)。1 つの衝突が同一タブ
  // 内の 2 セルの場合も 1 件と数える。
  const tabConflictCounts = useMemo(() => {
    const counts = {};
    for (const c of conflictView.active) {
      for (const tabId of new Set(c.refs.map((r) => Number(r.split(":")[0])))) {
        counts[tabId] = (counts[tabId] || 0) + 1;
      }
    }
    return counts;
  }, [conflictView]);

  const approveConflict = useCallback(
    (c) =>
      saveProject((p) => ({
        ...p,
        approvedConflicts: [...(p.approvedConflicts || []), conflictKey(c)],
      })),
    [saveProject]
  );
  const unapproveConflict = useCallback(
    (c) =>
      saveProject((p) => ({
        ...p,
        approvedConflicts: (p.approvedConflicts || []).filter(
          (k) => k !== conflictKey(c)
        ),
      })),
    [saveProject]
  );

  // 対象の消えた承認の掃除。承認キーはセル参照を含むため、承認したコマを
  // 動かすと無効になる (意図どおり保守的)。無効キーは画面に出ないまま
  // 残り続けるので、まとめて捨てられるようにする
  const purgeStaleApprovals = useCallback(() => {
    const stale = new Set(conflictView.stale);
    if (stale.size === 0) return;
    saveProject(
      (p) => ({
        ...p,
        approvedConflicts: (p.approvedConflicts || []).filter(
          (k) => !stale.has(k)
        ),
      }),
      { atomic: true }
    );
    toasts.success(
      `対象の無くなった承認 ${stale.size} 件を削除しました（Ctrl+Z で戻せます）`
    );
  }, [conflictView.stale, saveProject, toasts]);

  return {
    conflictList,
    conflictView,
    tabConflictCounts,
    approveConflict,
    unapproveConflict,
    purgeStaleApprovals,
  };
}
