import { useCallback } from "react";
import { useToasts } from "./useToasts";
import { useCrudResource } from "./useCrudResource";

// Substitute (代行) の CRUD ロジック。
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
          status: r.substitute ? r.status : "requested",
          id: next++,
          createdAt: ts,
          updatedAt: ts,
        }));
        saveSubs([...subs, ...newRecords]);
        toasts.success(`代行を ${newRecords.length} 件追加しました`);
        setEditSub(null);
        return;
      }

      const normalized = { ...f, status: f.substitute ? f.status : "requested" };
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
    (id) =>
      crud.confirmedRemove(id, {
        title: "代行の削除",
        message: "この代行記録を削除しますか？",
        successMsg: "代行記録を削除しました",
      }),
    [crud]
  );

  return { save, del };
}
