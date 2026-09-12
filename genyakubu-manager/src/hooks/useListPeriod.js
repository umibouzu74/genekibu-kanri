import { useMemo, useState } from "react";
import { useToday } from "./useToday";
import { filterByListPeriod } from "../utils/listPeriod";

// 一覧の期間絞り込みの状態 (mode / month) と適用関数。表示は
// components/ListPeriodFilter。既定は「今月以降」(utils/listPeriod 参照)
export function useListPeriod(initialMode = "current") {
  const todayStr = useToday();
  const [mode, setMode] = useState(initialMode);
  const [month, setMonth] = useState(() => todayStr.slice(0, 7));
  const period = useMemo(() => ({ mode, month, todayStr }), [mode, month, todayStr]);
  return useMemo(
    () => ({
      ...period,
      setMode,
      setMonth,
      apply: (items, getRange) => filterByListPeriod(items, period, getRange),
    }),
    [period]
  );
}

