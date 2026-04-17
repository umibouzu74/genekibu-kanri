import { useCallback } from "react";
import { useToasts } from "./useToasts";
import { useCrudResource } from "./useCrudResource";
import { nextNumericId } from "../utils/schema";

/**
 * Timetable CRUD hook.
 * @param {{
 *   timetables: import("../types").Timetable[],
 *   saveTimetables: (v: import("../types").Timetable[]) => void,
 *   slots: import("../types").Slot[],
 *   saveSlots: (v: import("../types").Slot[]) => void,
 * }} deps
 */
export function useTimetablesCrud({
  timetables,
  saveTimetables,
  slots,
  saveSlots,
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
      const newSlots = sourceSlots.map((s) => ({
        ...s,
        id: nextSlotId++,
        timetableId: newTtId,
      }));

      saveTimetables([...timetables, newTimetable]);
      saveSlots([...slots, ...newSlots]);
      toasts.success(
        `「${source.name}」を複製しました（${newSlots.length} コマ）`
      );
      return newTtId;
    },
    [timetables, saveTimetables, slots, saveSlots, toasts]
  );

  return { add, update, remove, duplicate };
}
