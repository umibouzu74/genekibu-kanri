import { useCallback } from "react";
import { useToasts } from "./useToasts";
import { useCrudResource } from "./useCrudResource";

// Substitute (代行) の CRUD ロジック。
//
// status は「対応が確定したか」だけを表す。**代行者が空でも confirmed に
// できる** — それが「代行なしで確定 (他の担当者で回す)」という状態
// (utils/substituteState の 4 状態)。空欄を requested に丸めてしまうと
// この状態が作れないので、丸めるのは status 自体が無いときだけ。
function normalizeSubStatus(r) {
  return r?.status === "confirmed" ? "confirmed" : "requested";
}
export function useSubsCrud({ subs, saveSubs }) {
  const toasts = useToasts();
  const crud = useCrudResource({ list: subs, save: saveSubs });

  const save = useCallback(
    (editSub, f, setEditSub) => {
      const ts = new Date().toISOString();

      // 1 日分モードからの一括保存 (配列)
      if (Array.isArray(f)) {
        let next = subs.reduce((m, s) => Math.max(m, s.id || 0), 0) + 1;
        const newRecords = f.map((r) => ({
          ...r,
          status: normalizeSubStatus(r),
          id: next++,
          createdAt: ts,
          updatedAt: ts,
        }));
        saveSubs([...subs, ...newRecords]);
        toasts.success(`代行を ${newRecords.length} 件追加しました`);
        setEditSub(null);
        return;
      }

      const normalized = { ...f, status: normalizeSubStatus(f) };
      if (editSub === "new") {
        crud.add(normalized, {
          successMsg: "代行を追加しました",
          withCreatedAt: true,
          withUpdatedAt: true,
        });
      } else {
        crud.update(editSub.id, normalized, {
          successMsg: "代行を更新しました",
          withTimestamp: true,
        });
      }
      setEditSub(null);
    },
    [subs, saveSubs, crud, toasts]
  );

  const del = useCallback(
    (id) => crud.removeWithUndo(id, { successMsg: "代行記録を削除しました" }),
    [crud]
  );

  return { save, del };
}
