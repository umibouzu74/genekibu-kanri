import { useCallback } from "react";
import { useCrudResource } from "./useCrudResource";
import { useToasts } from "./useToasts";

// 回数手動補正 (SessionOverride) の CRUD ロジック。
// 同じ (slotId, date) の組に対する override は 1 件だけ許容し、
// 重複時は上書き (古いレコードを削除して新しいものを追加) する。
export function useSessionOverridesCrud({ sessionOverrides, saveSessionOverrides }) {
  const toasts = useToasts();
  const crud = useCrudResource({
    list: sessionOverrides,
    save: saveSessionOverrides,
  });

  // add/upsert: 同一 (slotId, date) が存在すれば replace、無ければ add。
  const upsert = useCallback(
    (override) => {
      const existing = sessionOverrides.find(
        (o) => o.slotId === override.slotId && o.date === override.date
      );
      if (existing) {
        const ts = new Date().toISOString();
        const filtered = sessionOverrides.filter((o) => o.id !== existing.id);
        const id = Math.max(0, ...filtered.map((o) => o.id || 0)) + 1;
        saveSessionOverrides([
          ...filtered,
          { ...override, id, createdAt: ts },
        ]);
        toasts.success("回数補正を更新しました");
      } else {
        crud.add(override, {
          successMsg: "回数補正を登録しました",
          withCreatedAt: true,
        });
      }
    },
    [sessionOverrides, saveSessionOverrides, crud, toasts]
  );

  const remove = crud.remove;

  const del = useCallback(
    (id) => crud.removeWithUndo(id, { successMsg: "回数補正を削除しました" }),
    [crud]
  );

  return { upsert, remove, del };
}
