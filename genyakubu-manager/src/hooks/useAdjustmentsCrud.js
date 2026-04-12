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

  const del = async (id) => {
    const ok = await confirm({
      title: "調整の削除",
      message: "この時間割調整を削除しますか？",
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    saveAdjustments(adjustments.filter((a) => a.id !== id));
    toasts.success("時間割調整を削除しました");
  };

  return { add, del };
}
