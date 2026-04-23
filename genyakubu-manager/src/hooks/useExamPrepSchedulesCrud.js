import { useCallback } from "react";
import {
  copyDay as copyDayPure,
  removeDay as removeDayPure,
  removeSchedulesForPeriod,
  upsertDay as upsertDayPure,
} from "../utils/examPrepHelpers";
import { useToasts } from "./useToasts";

// テスト直前特訓シフトの CRUD ヘルパ。純粋関数は examPrepHelpers に置き、
// ここは useSyncedStorage からの save 関数を介した副作用のみを担う。
export function useExamPrepSchedulesCrud({
  examPrepSchedules,
  saveExamPrepSchedules,
}) {
  const toasts = useToasts();

  const upsertDay = useCallback(
    (examPeriodId, day, opts = {}) => {
      saveExamPrepSchedules(upsertDayPure(examPrepSchedules, examPeriodId, day));
      if (opts.successMsg !== null) {
        toasts.success(opts.successMsg || "特訓シフトを保存しました");
      }
    },
    [examPrepSchedules, saveExamPrepSchedules, toasts]
  );

  const deleteDay = useCallback(
    (examPeriodId, dateStr) => {
      saveExamPrepSchedules(removeDayPure(examPrepSchedules, examPeriodId, dateStr));
      toasts.success("この日のシフトを削除しました");
    },
    [examPrepSchedules, saveExamPrepSchedules, toasts]
  );

  const cascadeDeletePeriod = useCallback(
    (examPeriodId) => {
      saveExamPrepSchedules(
        removeSchedulesForPeriod(examPrepSchedules, examPeriodId)
      );
    },
    [examPrepSchedules, saveExamPrepSchedules]
  );

  const copyDay = useCallback(
    (examPeriodId, fromDate, toDates) => {
      const next = copyDayPure(examPrepSchedules, examPeriodId, fromDate, toDates);
      saveExamPrepSchedules(next);
      toasts.success(`${toDates.length} 日にシフトをコピーしました`);
    },
    [examPrepSchedules, saveExamPrepSchedules, toasts]
  );

  return { upsertDay, deleteDay, cascadeDeletePeriod, copyDay };
}
