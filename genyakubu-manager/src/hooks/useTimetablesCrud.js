import { useCallback } from "react";
import { useToasts } from "./useToasts";
import { useConfirm } from "./useConfirm";
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
export function useTimetablesCrud({ timetables, saveTimetables, slots, saveSlots, onRemoveActive }) {
  const toasts = useToasts();
  const confirm = useConfirm();

  const add = useCallback(
    (/** @type {Omit<import("../types").Timetable, "id">} */ fields) => {
      const id = nextNumericId(timetables);
      saveTimetables([...timetables, { ...fields, id }]);
      toasts.success("時間割を作成しました");
      return id;
    },
    [timetables, saveTimetables, toasts]
  );

  const update = useCallback(
    (/** @type {number} */ id, /** @type {Partial<import("../types").Timetable>} */ changes) => {
      saveTimetables(timetables.map((t) => (t.id === id ? { ...t, ...changes, id } : t)));
      toasts.success("時間割を更新しました");
    },
    [timetables, saveTimetables, toasts]
  );

  const remove = useCallback(
    async (/** @type {number} */ id) => {
      if (id === 1) {
        toasts.error("デフォルト時間割は削除できません");
        return;
      }
      const linkedSlots = slots.filter((s) => s.timetableId === id);
      const msg = linkedSlots.length
        ? `この時間割には ${linkedSlots.length} 件のコマが割り当てられています。\n削除するとコマはデフォルト時間割に移動します。`
        : "この時間割を削除しますか？";
      const ok = await confirm({
        title: "時間割の削除",
        message: msg,
        okLabel: "削除",
        tone: "danger",
      });
      if (!ok) return;
      saveTimetables(timetables.filter((t) => t.id !== id));
      if (linkedSlots.length) {
        saveSlots(
          slots.map((s) =>
            s.timetableId === id ? { ...s, timetableId: 1 } : s
          )
        );
      }
      if (onRemoveActive) onRemoveActive(id);
      toasts.success("時間割を削除しました");
    },
    [timetables, saveTimetables, slots, saveSlots, toasts, confirm, onRemoveActive]
  );

  const duplicate = useCallback(
    (
      /** @type {number} */ sourceId,
      /** @type {string} */ newName,
      /** @type {{ startDate: string | null, endDate: string | null }} */ newDates
    ) => {
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
