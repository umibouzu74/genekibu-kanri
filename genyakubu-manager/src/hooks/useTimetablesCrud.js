import { useCallback } from "react";
import { useToasts } from "./useToasts";
import { useCrudResource } from "./useCrudResource";
import { nextNumericId } from "../utils/schema";
import { applyTimeBulkEdit } from "../utils/timeBulkEdit";
import { isLegacySet } from "../utils/classSets";
import { dropTimetableFromCutoff } from "../utils/timetable";
import { countDuplicatesInTarget } from "../utils/duplicateSlots";
import { describeOrphanDetection } from "../utils/orphanCleanup";

/**
 * Timetable CRUD hook.
 * @param {{
 *   timetables: import("../types").Timetable[],
 *   saveTimetables: (v: import("../types").Timetable[]) => void,
 *   slots: import("../types").Slot[],
 *   saveSlots: (v: import("../types").Slot[]) => void,
 *   classSets?: import("../types").ClassSet[],
 *   saveClassSets?: (v: import("../types").ClassSet[]) => void,
 *   saveDisplayCutoff?: (v: import("../types").DisplayCutoff
 *     | ((prev: import("../types").DisplayCutoff) => import("../types").DisplayCutoff)) => void,
 *   detectSlotRemoval?: (nextSlots: import("../types").Slot[]) => {total: number} | null,
 *   onSlotsRemoved?: (nextSlots: import("../types").Slot[]) => {total: number} | null,
 * }} deps
 *
 * detectSlotRemoval / onSlotsRemoved はコマを消したときの孤立データ (代行・調整・
 * 回数補正・休講日の例外…) の下見と後始末 (App の handleSlotsReflected。
 * utils/orphanCleanup.cascadeOrphansForSlots)。
 */
export function useTimetablesCrud({
  timetables,
  saveTimetables,
  slots,
  saveSlots,
  classSets,
  saveClassSets,
  saveDisplayCutoff,
  detectSlotRemoval,
  onSlotsRemoved,
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

  // 時間割の削除 (cascade あり → confirmedRemove)。コマのある時間割は、
  // コマも一緒に削除するか、デフォルト時間割へ移すかを確認ダイアログで選ぶ
  // (2026-11-19、P1-2)。以前は移すだけだったので、複製で作った時間割を消すと
  // 複製元と同じコマがデフォルト側に二重に入った。どちらも既定にしない
  // (コマごと消すと代行・調整も消え、移すと二重になりうるので、人が選ぶ)
  const remove = useCallback(
    async (id) => {
      if (id === 1) {
        toasts.error("デフォルト時間割は削除できません");
        return;
      }
      const target = timetables.find((t) => t.id === id);
      const defaultName = timetables.find((t) => t.id === 1)?.name || "デフォルト時間割";
      const linkedSlots = slots.filter((s) => s.timetableId === id);
      const remaining = slots.filter((s) => s.timetableId !== id);
      // この時間割だけの表示期間設定・終講日を外す (id を使い回したときに
      // 新しい時間割へ黙って効かないように)
      const dropCutoff = () => saveDisplayCutoff?.((prev) => dropTimetableFromCutoff(prev, id));
      if (linkedSlots.length === 0) {
        await crud.confirmedRemove(id, {
          title: "時間割の削除",
          message: `「${target?.name || "この時間割"}」を削除しますか？`,
          successMsg: "時間割を削除しました",
          cascade: dropCutoff,
        });
        return;
      }
      const detection = detectSlotRemoval ? detectSlotRemoval(remaining) : null;
      const dupCount = countDuplicatesInTarget(linkedSlots, slots, 1);
      await crud.confirmedRemove(id, {
        title: "時間割の削除",
        message:
          `「${target?.name || "この時間割"}」を削除します。\n` +
          `この時間割には ${linkedSlots.length} 件のコマがあります。コマをどうするか選んでください。`,
        okLabel: "削除する",
        successMsg: "時間割を削除しました",
        choices: [
          {
            value: "delete",
            label: `コマも一緒に削除する（${linkedSlots.length} コマ）`,
            description:
              detection && detection.total > 0
                ? `このコマに付いている ${describeOrphanDetection(detection)} も消えます / 外れます`
                : "このコマに付いている代行・調整などはありません",
          },
          {
            value: "move",
            label: `コマを「${defaultName}」へ移す`,
            description:
              dupCount > 0
                ? `⚠ 同じ内容のコマが「${defaultName}」に ${dupCount} 件あります。移すとそのコマは二重に入ります`
                : `「${defaultName}」に同じ内容のコマはありません`,
            warn: dupCount > 0,
          },
        ],
        cascade: (_id, how) => {
          dropCutoff();
          if (how === "delete") {
            saveSlots(remaining);
            const done = onSlotsRemoved ? onSlotsRemoved(remaining) : null;
            if (done && done.total > 0) {
              toasts.info(`紐付けの切れたデータを掃除しました（${describeOrphanDetection(done)}）`);
            }
          } else {
            saveSlots(slots.map((s) => (s.timetableId === id ? { ...s, timetableId: 1 } : s)));
          }
        },
      });
    },
    [slots, saveSlots, toasts, crud, saveDisplayCutoff, timetables, detectSlotRemoval, onSlotsRemoved]
  );

  // コマをまとめて消す (同じ内容のコマの整理)。確認は呼び出し側 (cascade あり)。
  // 消したコマに付いた代行・調整などは孤立データの掃除と同じく片付ける
  const removeSlots = useCallback(
    (ids) => {
      const drop = new Set((ids || []).map(String));
      if (drop.size === 0) return null;
      const next = slots.filter((s) => !drop.has(String(s.id)));
      saveSlots(next);
      return onSlotsRemoved ? onSlotsRemoved(next) : null;
    },
    [slots, saveSlots, onSlotsRemoved]
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

      // 授業セット (回数カウントの束ね) のうち旧 slotIds 形式のものは、
      // 新スロット id に読み替えて複製する。これが無いと複製先の期で
      // セット単位の第N回が引き継がれない。
      // 2 コマ以上写像できたセットのみ (1 コマのセットは束ねる意味がない)。
      // units 形式 (学年 × 曜日) のセットはコマ id を参照しないので、
      // 複製先のコマにもそのまま効く = 複製しない (増やすと二重定義になる)。
      const newSets = [];
      if (Array.isArray(classSets) && saveClassSets) {
        let nextSetId = nextNumericId(classSets);
        for (const cs of classSets) {
          if (!isLegacySet(cs)) continue;
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

  // 複製の計画 (utils/timetableDuplicate.planTimetableDuplicate) をそのまま保存する。
  // 学年を選ぶ・続き番号・担当の確定は計画の側で決めてある (A2)
  const applyDuplicate = useCallback(
    (plan, sourceName) => {
      if (!plan || plan.error) {
        toasts.error(plan?.error || "複製できませんでした");
        return null;
      }
      if (plan.classSets && saveClassSets) saveClassSets(plan.classSets);
      saveTimetables([...timetables, plan.timetable]);
      saveSlots(plan.slots);
      const added = plan.classSets ? plan.classSets.length - (classSets || []).length : 0;
      toasts.success(
        `「${sourceName}」を複製しました（${plan.newSlots.length} コマ` +
          (added > 0 ? `、授業セット ${added} 件` : "") +
          `）`
      );
      return plan.timetable.id;
    },
    [timetables, saveTimetables, saveSlots, classSets, saveClassSets, toasts]
  );

  return { add, update, remove, removeSlots, duplicate, applyDuplicate, bulkRetime };
}
