import { useCallback } from "react";
import { useToasts } from "./useToasts";
import { useCrudResource } from "./useCrudResource";
import { nextNumericId } from "../utils/schema";
import { applyTimeBulkEdit } from "../utils/timeBulkEdit";

/**
 * Timetable CRUD hook.
 * @param {{
 *   timetables: import("../types").Timetable[],
 *   saveTimetables: (v: import("../types").Timetable[]) => void,
 *   slots: import("../types").Slot[],
 *   saveSlots: (v: import("../types").Slot[]) => void,
 *   classSets?: import("../types").ClassSet[],
 *   saveClassSets?: (v: import("../types").ClassSet[]) => void,
 * }} deps
 */
export function useTimetablesCrud({
  timetables,
  saveTimetables,
  slots,
  saveSlots,
  classSets,
  saveClassSets,
  onRemoveActive,
}) {
  const toasts = useToasts();
  const crud = useCrudResource({ list: timetables, save: saveTimetables });

  const add = useCallback(
    (fields) => crud.add(fields, { successMsg: "時間割を作成しました" }),
    [crud]
  );

  const update = useCallback(
    (id, changes) =>
      crud.update(id, changes, { successMsg: "時間割を更新しました" }),
    [crud]
  );

  const remove = useCallback(
    async (id) => {
      if (id === 1) {
        toasts.error("デフォルト時間割は削除できません");
        return;
      }
      const linkedSlots = slots.filter((s) => s.timetableId === id);
      const msg = linkedSlots.length
        ? `この時間割には ${linkedSlots.length} 件のコマが割り当てられています。\n削除するとコマはデフォルト時間割に移動します。`
        : "この時間割を削除しますか？";
      const removed = await crud.confirmedRemove(id, {
        title: "時間割の削除",
        message: msg,
        successMsg: "時間割を削除しました",
        cascade: () => {
          if (linkedSlots.length) {
            saveSlots(
              slots.map((s) =>
                s.timetableId === id ? { ...s, timetableId: 1 } : s
              )
            );
          }
        },
      });
      if (removed && onRemoveActive) onRemoveActive(id);
    },
    [slots, saveSlots, toasts, crud, onRemoveActive]
  );

  const duplicate = useCallback(
    (sourceId, newName, newDates) => {
      const source = timetables.find((t) => t.id === sourceId);
      if (!source) {
        toasts.error("複製元の時間割が見つかりません");
        return null;
      }
      const newTtId = nextNumericId(timetables);
      const newTimetable = {
        ...source,
        id: newTtId,
        name: newName,
        startDate: newDates.startDate,
        endDate: newDates.endDate,
      };

      // Duplicate all slots belonging to source timetable
      const sourceSlots = slots.filter(
        (s) => (s.timetableId ?? 1) === sourceId
      );
      let nextSlotId = nextNumericId(slots);
      const idMap = new Map(); // 旧スロット id → 新スロット id
      const newSlots = sourceSlots.map((s) => {
        const newId = nextSlotId++;
        idMap.set(s.id, newId);
        return { ...s, id: newId, timetableId: newTtId };
      });

      // 授業セット (回数カウントの束ね) も新スロット id に読み替えて複製する。
      // これが無いと複製先の期でセット単位の第N回が引き継がれない。
      // 2 コマ以上写像できたセットのみ (1 コマのセットは束ねる意味がない)。
      const newSets = [];
      if (Array.isArray(classSets) && saveClassSets) {
        let nextSetId = nextNumericId(classSets);
        for (const cs of classSets) {
          const mapped = (cs.slotIds || [])
            .map((id) => idMap.get(id))
            .filter((id) => id != null);
          if (mapped.length < 2) continue;
          newSets.push({ id: nextSetId++, label: cs.label, slotIds: mapped });
        }
        if (newSets.length) saveClassSets([...classSets, ...newSets]);
      }

      saveTimetables([...timetables, newTimetable]);
      saveSlots([...slots, ...newSlots]);
      toasts.success(
        `「${source.name}」を複製しました（${newSlots.length} コマ` +
          (newSets.length ? `、授業セット ${newSets.length} 件` : "") +
          `）`
      );
      return newTtId;
    },
    [timetables, saveTimetables, slots, saveSlots, classSets, saveClassSets, toasts]
  );

  // 時刻一括変換 (期切替支援)。プレビュー・確認は呼び出し側 (ビュー) の責務。
  const bulkRetime = useCallback(
    (filter, mappings) => {
      const { slots: updated, changedCount } = applyTimeBulkEdit(
        slots,
        filter,
        mappings
      );
      if (changedCount === 0) {
        toasts.error("変換対象のコマがありません");
        return 0;
      }
      saveSlots(updated);
      toasts.success(`${changedCount} 件のコマの時刻を変換しました`);
      return changedCount;
    },
    [slots, saveSlots, toasts]
  );

  return { add, update, remove, duplicate, bulkRetime };
}
