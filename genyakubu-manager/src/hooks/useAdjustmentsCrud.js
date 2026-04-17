import { useCallback } from "react";
import { useCrudResource } from "./useCrudResource";
import { useToasts } from "./useToasts";

// 時間割調整 (move / combine) の CRUD ロジック。
export function useAdjustmentsCrud({ adjustments, saveAdjustments }) {
  const toasts = useToasts();
  const crud = useCrudResource({ list: adjustments, save: saveAdjustments });

  const add = useCallback(
    (adj) => {
      crud.add(adj, {
        successMsg:
          adj.type === "move" ? "コマ移動を登録しました" : "合同授業を登録しました",
        withCreatedAt: true,
      });
    },
    [crud]
  );

  // 確認ダイアログなしで削除（ドラッグ操作での置き換え等に使用）
  const remove = crud.remove;

  // 削除 + 追加を 1 回の saveAdjustments で行う (stale closure 回避)
  const replace = useCallback(
    (oldId, newAdj) => {
      const ts = new Date().toISOString();
      const filtered = adjustments.filter((a) => a.id !== oldId);
      const id = Math.max(0, ...filtered.map((a) => a.id || 0)) + 1;
      saveAdjustments([
        ...filtered,
        { ...newAdj, id, createdAt: ts },
      ]);
      toasts.success(
        newAdj.type === "move" ? "コマ移動を更新しました" : "合同授業を更新しました"
      );
    },
    [adjustments, saveAdjustments, toasts]
  );

  const del = useCallback(
    (id) =>
      crud.confirmedRemove(id, {
        title: "調整の削除",
        message: "この時間割調整を削除しますか？",
        successMsg: "時間割調整を削除しました",
      }),
    [crud]
  );

  return { add, del, remove, replace };
}
