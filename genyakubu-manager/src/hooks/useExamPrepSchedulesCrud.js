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

  // テスト期間の削除に伴って、その特訓シフトを消す。id の配列も受ける (出典ごとの
  // まとめて削除。1 件ずつ呼ぶと、どれも同じ古い一覧から書いて最後の 1 件しか
  // 消えないため、1 回の保存にまとめる)
  const cascadeDeletePeriod = useCallback(
    (examPeriodIdOrIds) => {
      const ids = Array.isArray(examPeriodIdOrIds) ? examPeriodIdOrIds : [examPeriodIdOrIds];
      let next = examPrepSchedules;
      for (const id of ids) next = removeSchedulesForPeriod(next, id);
      saveExamPrepSchedules(next);
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
