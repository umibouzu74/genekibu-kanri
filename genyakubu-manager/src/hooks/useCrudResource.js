import { useCallback } from "react";
import { useToasts } from "./useToasts";
import { useConfirm } from "./useConfirm";
import { nextNumericId } from "../utils/schema";

/**
 * Generic CRUD primitives for list-backed resources stored in
 * useSyncedStorage. Resource-specific hooks (e.g. useSubsCrud) use this
 * to avoid re-implementing add / update / remove / confirmed-delete
 * boilerplate, while keeping domain logic (cascades, validation) inline
 * at the call site via options.
 *
 * @template T
 * @param {{
 *   list: T[],
 *   save: (next: T[]) => void,
 *   idKey?: keyof T,
 * }} deps
 */
export function useCrudResource({ list, save, idKey = "id" }) {
  const toasts = useToasts();
  const confirm = useConfirm();

  const add = useCallback(
    (
      fields,
      { successMsg, withCreatedAt = false, withUpdatedAt = false } = {}
    ) => {
      const id = nextNumericId(list, idKey);
      const ts =
        withCreatedAt || withUpdatedAt ? new Date().toISOString() : null;
      const extras = {};
      if (withCreatedAt) extras.createdAt = ts;
      if (withUpdatedAt) extras.updatedAt = ts;
      const record = { ...fields, [idKey]: id, ...extras };
      save([...list, record]);
      if (successMsg) toasts.success(successMsg);
      return id;
    },
    [list, save, idKey, toasts]
  );

  const update = useCallback(
    (id, changes, { successMsg, withTimestamp = false } = {}) => {
      save(
        list.map((x) =>
          x[idKey] === id
            ? {
                ...x,
                ...changes,
                [idKey]: x[idKey],
                ...(withTimestamp ? { updatedAt: new Date().toISOString() } : {}),
              }
            : x
        )
      );
      if (successMsg) toasts.success(successMsg);
    },
    [list, save, idKey, toasts]
  );

  const remove = useCallback(
    (id) => {
      save(list.filter((x) => x[idKey] !== id));
    },
    [list, save, idKey]
  );

  /**
   * Confirmed-destructive delete. Runs the optional `cascade` callback
   * (which may read current state and call other save*() fns) **before**
   * filtering the primary list so all writes happen in one React batch.
   */
  const confirmedRemove = useCallback(
    async (
      id,
      {
        title = "削除",
        message = "この項目を削除しますか？",
        okLabel = "削除",
        successMsg,
        cascade,
      } = {}
    ) => {
      const ok = await confirm({ title, message, okLabel, tone: "danger" });
      if (!ok) return false;
      if (cascade) await cascade(id);
      save(list.filter((x) => x[idKey] !== id));
      if (successMsg) toasts.success(successMsg);
      return true;
    },
    [list, save, idKey, confirm, toasts]
  );

  return { add, update, remove, confirmedRemove };
}
