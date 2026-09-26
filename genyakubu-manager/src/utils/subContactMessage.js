// ─── 代行の連絡文 ──────────────────────────────────────────────────
// 代行一覧の 💬 で、LINE などにそのまま貼れる連絡文を作る。
//
// 1 通で送りたい単位は「その日・その先生の欠勤」なので、同じ日・同じ元講師・
// 同じ代行者・同じ状態 (substituteState の 4 状態) のレコードは 1 通に束ねる
// (堀上が 9/18 に 3 コマ休む → 3 コマを箇条書きにした 1 通)。
//
// 時刻は**その日の実際の時刻** (コマ移動 → 特別時程 → 元の時刻の順)。連絡文は
// 人に送るものなので、時間割表の元の時刻のまま送ると間違った時刻に来て
// しまう。メモ (sub.memo) は欠勤理由など内部向けのことが多いので載せない。

import { WEEKDAYS } from "../constants/schools";
import { fmtMD, parseLocalDate, timeStartToMin } from "./dateHelpers";
import { resolveSlotDaySchedule } from "./daySchedules";
import { SUB_STATE, subState } from "./substituteState";

/**
 * そのコマのその日の実際の時刻。個別のコマ移動 (adjustments の move) が
 * 特別時程の読み替えより優先 (buildAdjustmentIndex と同じ優先順位)。
 */
export function effectiveSlotTime(slot, date, { adjustments = [], daySchedules = [] } = {}) {
  if (!slot) return "";
  const move = (adjustments || []).find(
    (a) => a.type === "move" && a.date === date && a.slotId === slot.id && a.targetTime
  );
  if (move) return move.targetTime;
  return resolveSlotDaySchedule(slot, date, daySchedules)?.time || slot.time || "";
}

function classLabel(slot) {
  const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
  return `${slot.grade || ""}${cls}`;
}

function slotLine(slot, time) {
  const room = slot.room ? ` (${slot.room})` : "";
  return `${time} ${classLabel(slot)} ${slot.subj || ""}${room}`.replace(/\s+/g, " ").trim();
}

/** 同じ 1 通に束ねるレコードのキー。 */
export function contactGroupKey(sub) {
  return [sub.date, sub.originalTeacher || "", sub.substitute || "", subState(sub)].join("|");
}

/**
 * 連絡文を作る。
 * @param {object[]} subs   同じ contactGroupKey の代行レコード (1 件以上)
 * @param {Record<number, object>} slotMap
 * @param {{adjustments?: object[], daySchedules?: object[]}} [ctx]
 * @returns {string} 束ねるコマが 1 つも引けなければ ""
 */
export function buildSubContactMessage(subs, slotMap, ctx = {}) {
  const rows = (subs || [])
    .map((sub) => {
      const slot = slotMap?.[sub.slotId];
      if (!slot) return null;
      const time = effectiveSlotTime(slot, sub.date, ctx);
      return { sub, slot, time };
    })
    .filter(Boolean)
    .sort((a, b) => timeStartToMin(a.time) - timeStartToMin(b.time));
  if (rows.length === 0) return "";

  const head = rows[0].sub;
  // dateToDay は授業曜日 (月〜土) しか返さないので日曜も引ける方で
  const dt = parseLocalDate(head.date);
  const date = `${fmtMD(head.date)}${dt ? ` (${WEEKDAYS[dt.getDay()]})` : ""}`;
  const from = `${head.originalTeacher || "?"}先生`;
  const to = head.substitute ? `${head.substitute}先生` : "";
  const state = subState(head);

  // 1 コマなら日付と同じ行に時刻、複数コマなら箇条書き
  const body =
    rows.length === 1
      ? [`${date} ${slotLine(rows[0].slot, rows[0].time)}`]
      : [date, ...rows.map((r) => `・${slotLine(r.slot, r.time)}`)];

  switch (state) {
    case SUB_STATE.PENDING:
      return [
        "【代行のお願い】",
        ...body,
        `${from}の代わりに入っていただける方を探しています。`,
      ].join("\n");
    case SUB_STATE.REQUESTED:
      return [
        `【代行のお願い】${to}`,
        ...body,
        `${from}の代わりに入っていただけますか？`,
      ].join("\n");
    case SUB_STATE.CONFIRMED:
      return ["【代行確定】", ...body, `${from} → ${to}`].join("\n");
    case SUB_STATE.NOSUB:
      return ["【欠勤連絡】", ...body, `${from}はお休みです (代行なし)`].join("\n");
    default:
      return "";
  }
}
