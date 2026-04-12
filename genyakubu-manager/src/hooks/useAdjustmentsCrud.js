import { useToasts } from "./useToasts";
import { useConfirm } from "./useConfirm";
import { nextNumericId } from "../utils/schema";

// 時間割調整 (move / combine) の CRUD ロジック。
export function useAdjustmentsCrud({ adjustments, saveAdjustments }) {
  const toasts = useToasts();
  const confirm = useConfirm();

  const add = (adj) => {
    const ts = new Date().toISOString();
    saveAdjustments([
      ...adjustments,
      { ...adj, id: nextNumericId(adjustments), createdAt: ts },
    ]);
    toasts.success(
      adj.type === "move" ? "コマ移動を登録しました" : "合同授業を登録しました"
    );
  };

  // 確認ダイアログなしで削除（ドラッグ操作での置き換え等に使用）
  const remove = (id) => {
    saveAdjustments(adjustments.filter((a) => a.id !== id));
  };

  // 削除と追加を1回の saveAdjustments で行う（stale closure 回避）
  const replace = (oldId, newAdj) => {
    const ts = new Date().toISOString();
    const filtered = adjustments.filter((a) => a.id !== oldId);
    saveAdjustments([
      ...filtered,
      { ...newAdj, id: nextNumericId(filtered), createdAt: ts },
    ]);
    toasts.success(
      newAdj.type === "move" ? "コマ移動を更新しました" : "合同授業を更新しました"
    );
  };

  const del = async (id) => {
    const ok = await confirm({
      title: "調整の削除",
      message: "この時間割調整を削除しますか？",
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    remove(id);
    toasts.success("時間割調整を削除しました");
  };

  return { add, del, remove, replace };
}
