import { fmtDate } from "../data";
import { buildSessionCountMap } from "./sessionCount";
import { isEntireDayBeyondCutoff } from "./timetable";

// 指定曜日について、today 以降で「回数 > 0 のスロットがある」最初の実施日を
// 最大 maxWeeks 週まで探し、その日のセッション番号マップを返す。
// 該当日が見つからなければ空 Map を返す (呼び出し側はバッジ非表示に倒す)。
//
// 純粋関数。today は Date オブジェクト (時分秒は 0 前提)。
// targetDow は 0..6 (Sun..Sat; Date#getDay と同じインデックス)。
// displayCutoff は sessionCtx.displayCutoff から参照する (単一情報源)。
export function findNextSessionMap(daySlots, targetDow, today, sessionCtx, maxWeeks = 4) {
  if (!daySlots || daySlots.length === 0) return new Map();
  if (!sessionCtx || !sessionCtx.displayCutoff) return new Map();

  const displayCutoff = sessionCtx.displayCutoff;
  const base = new Date(today);
  const diff = (targetDow - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + diff);

  for (let attempt = 0; attempt < maxWeeks; attempt++) {
    const ds = fmtDate(base);
    if (!isEntireDayBeyondCutoff(ds, displayCutoff)) {
      const map = buildSessionCountMap(daySlots, ds, sessionCtx);
      for (const v of map.values()) {
        if (v > 0) return map;
      }
    }
    base.setDate(base.getDate() + 7);
  }
  return new Map();
}
