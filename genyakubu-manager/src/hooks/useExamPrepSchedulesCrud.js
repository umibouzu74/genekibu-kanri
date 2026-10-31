import { useCallback } from "react";
import {
  findDay,
  findScheduleByExamPeriodId,
  withoutOrphanStaffTimes,
  copyDay as copyDayPure,
  removeDay as removeDayPure,
  removeSchedulesForPeriod,
  upsertDay as upsertDayPure,
} from "../utils/examPrepHelpers";
import { useToasts } from "./useToasts";

// テスト直前特訓シフトの CRUD ヘルパ。純粋関数は examPrepHelpers に置き、
// ここは useSyncedStorage からの save 関数を介した副作用のみを担う。
// 保存は書き込む時点の値から (updater)。来る・帰る時刻を続けて打つと、
// 描画時点の値で上書きして前の入力を消していた (C1)。
export function useExamPrepSchedulesCrud({ saveExamPrepSchedules }) {
  const toasts = useToasts();

  const upsertDay = useCallback(
    (examPeriodId, day, opts = {}) => {
      saveExamPrepSchedules((prev) =>
        upsertDayPure(prev || [], examPeriodId, withoutOrphanStaffTimes(day))
      );
      if (opts.successMsg !== null) {
        toasts.success(opts.successMsg || "特訓シフトを保存しました");
      }
    },
    [saveExamPrepSchedules, toasts]
  );

  // 書き込む時点のその日の設定に updater を当てて保存する (無ければ blank を渡す)。
  // 出勤の無くなった講師の来る・帰る時刻はここで消す
  const updateDay = useCallback(
    (examPeriodId, dateStr, updater, blank) => {
      saveExamPrepSchedules((prev) => {
        const cur = findDay(findScheduleByExamPeriodId(prev || [], examPeriodId), dateStr) || blank;
        if (!cur) return prev;
        return upsertDayPure(prev || [], examPeriodId, withoutOrphanStaffTimes(updater(cur)));
      });
    },
    [saveExamPrepSchedules]
  );

  // テスト期間の日をまとめて置き換える (表の貼り付け、C2)。days に入っている日だけを
  // 置き換え、ほかの日はそのまま。1 回の保存
  const replaceDays = useCallback(
    (examPeriodId, days) => {
      saveExamPrepSchedules((prev) => {
        let next = prev || [];
        for (const d of days) next = upsertDayPure(next, examPeriodId, withoutOrphanStaffTimes(d));
        return next;
      });
    },
    [saveExamPrepSchedules]
  );

  // 「元に戻す」: 日ごとの控え ({date, day|null}) に戻す (null = その日は無かった)
  const restoreDays = useCallback(
    (examPeriodId, snapshot) => {
      saveExamPrepSchedules((prev) => {
        let next = prev || [];
        for (const { date, day } of snapshot) {
          next = day ? upsertDayPure(next, examPeriodId, day) : removeDayPure(next, examPeriodId, date);
        }
        return next;
      });
    },
    [saveExamPrepSchedules]
  );

  const deleteDay = useCallback(
    (examPeriodId, dateStr) => {
      saveExamPrepSchedules((prev) => removeDayPure(prev || [], examPeriodId, dateStr));
      toasts.success("この日のシフトを削除しました");
    },
    [saveExamPrepSchedules, toasts]
  );

  // テスト期間の削除に伴って、その特訓シフトを消す。id の配列も受ける (出典ごとの
  // まとめて削除。1 件ずつ呼ぶと、どれも同じ古い一覧から書いて最後の 1 件しか
  // 消えないため、1 回の保存にまとめる)
  const cascadeDeletePeriod = useCallback(
    (examPeriodIdOrIds) => {
      const ids = Array.isArray(examPeriodIdOrIds) ? examPeriodIdOrIds : [examPeriodIdOrIds];
      saveExamPrepSchedules((prev) => {
        let next = prev || [];
        for (const id of ids) next = removeSchedulesForPeriod(next, id);
        return next;
      });
    },
    [saveExamPrepSchedules]
  );

  const copyDay = useCallback(
    (examPeriodId, fromDate, toDates) => {
      saveExamPrepSchedules((prev) => copyDayPure(prev || [], examPeriodId, fromDate, toDates));
      toasts.success(`${toDates.length} 日にシフトをコピーしました`);
    },
    [saveExamPrepSchedules, toasts]
  );

  return { upsertDay, updateDay, replaceDays, restoreDays, deleteDay, cascadeDeletePeriod, copyDay };
}
