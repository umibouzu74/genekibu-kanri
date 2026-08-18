// ─── 終講日の効き目 (最終授業日) を逆算する ────────────────────────
// 表示期間設定 / コース別終講日の画面で「その終了日だと、実際の最後の
// 授業はいつか」を出すためのユーティリティ。
// findNextSessionMap (nextSessionDate.js) の逆向き版。
//
// 「実施される日」の判定は sessionCount.isSlotHeldOnDate に委ねる
// (休講・テスト期間・特別時程の部分休講・単独教科隔週の B 週・時間割の
// 有効期間・開講日 1 限のオリエンまで、回数計算と同じルールで揃える)。
// 第N回は buildSessionCountMap で引く。開始日が未設定だと回数は 0 に
// なるので、その場合は日付だけを返す (sessionNo: 0)。

import { fmtDate, WEEKDAYS } from "../data";
import { buildSessionCountMap, isSlotHeldOnDate } from "./sessionCount";
import { isSlotBeyondCutoff } from "./timetable";

function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * endDateStr 以前で、slots のいずれかが実施される最後の日を返す。
 * 見つからなければ null (終了日の直前 maxLookbackDays 日に授業が無い)。
 *
 * @param {import("../types").Slot[]} slots 対象コマ (学年グループ / コース)
 * @param {string} endDateStr "YYYY-MM-DD" 終了日 (終講日)
 * @param {object} sessionCtx useSessionCtx が返す ctx
 * @param {{maxLookbackDays?: number, applyCutoff?: boolean}} [opts]
 *   applyCutoff: true なら表示期間 (isSlotBeyondCutoff) も満たす日だけを
 *   対象にする。終講日を入れる前の下見では false (既定) にして、
 *   「その日に授業があるか」だけを見る。
 * @returns {{date: string, sessionNo: number, slotCount: number} | null}
 */
export function findLastSessionOnOrBefore(slots, endDateStr, sessionCtx, opts = {}) {
  const maxLookbackDays = opts.maxLookbackDays ?? 28;
  if (!Array.isArray(slots) || slots.length === 0) return null;
  if (!endDateStr || !sessionCtx) return null;

  const days = new Set(slots.map((s) => s.day));
  const cur = parseDate(endDateStr);
  for (let i = 0; i <= maxLookbackDays; i++) {
    const ds = fmtDate(cur);
    const dayKey = WEEKDAYS[cur.getDay()];
    if (days.has(dayKey)) {
      const held = slots.filter(
        (s) =>
          s.day === dayKey &&
          isSlotHeldOnDate(s, ds, sessionCtx) &&
          (!opts.applyCutoff || !isSlotBeyondCutoff(ds, s, sessionCtx.displayCutoff))
      );
      if (held.length > 0) {
        const map = buildSessionCountMap(held, ds, sessionCtx);
        let sessionNo = 0;
        for (const v of map.values()) if (v > sessionNo) sessionNo = v;
        return { date: ds, sessionNo, slotCount: held.length };
      }
    }
    cur.setDate(cur.getDate() - 1);
  }
  return null;
}
