import { useCallback } from "react";
import { useCrudResource } from "./useCrudResource";
import { useToasts } from "./useToasts";
import { nextNumericId } from "../utils/schema";

const ADJ_LABEL = {
  move: "コマ移動",
  combine: "合同授業",
  reschedule: "振替",
};

function adjLabel(type) {
  return ADJ_LABEL[type] || "時間割調整";
}

// 時間割調整 (move / combine / reschedule) の CRUD ロジック。
export function useAdjustmentsCrud({ adjustments, saveAdjustments }) {
  const toasts = useToasts();
  const crud = useCrudResource({ list: adjustments, save: saveAdjustments });

  const add = useCallback(
    (adj) => {
      crud.add(adj, {
        successMsg: `${adjLabel(adj.type)}を登録しました`,
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
      const id = nextNumericId(filtered);
      saveAdjustments([
        ...filtered,
        { ...newAdj, id, createdAt: ts },
      ]);
      toasts.success(`${adjLabel(newAdj.type)}を更新しました`);
    },
    [adjustments, saveAdjustments, toasts]
  );

  const del = useCallback(
    (id) =>
      crud.removeWithUndo(id, { successMsg: "時間割調整を削除しました" }),
    [crud]
  );

  // 日まるごと振替の一括解除など、複数件をまとめて消す用。
  const delMany = useCallback(
    (ids) =>
      crud.removeManyWithUndo(ids, {
        successMsg: (n) => `時間割調整を ${n} 件削除しました`,
      }),
    [crud]
  );

  return { add, del, delMany, remove, replace };
}
