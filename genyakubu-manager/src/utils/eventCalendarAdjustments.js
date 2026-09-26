// ─── イベントカレンダーの「日単位の時間割調整」 ───────────────────────
// 日まるごと振替 (= 振替 adjustments をコマの数だけ並べたもの) とコマ休講
// (adjustments の cancel) を、イベントカレンダーの月グリッドと月の一覧に
// 出すための集計。どちらもモデルを足さずに時間割調整で表している
// (CLAUDE.md「日まるごと振替」「コマ休講」) ので、休講・テスト期間のような
// イベントのレコードが無く、そのままではカレンダーのどこにも出ない。
// ここで日ごとにまとめて「↻ 振替 5 コマ → 12/4」「🚫 コマ休講 3」の 1 件にする。
//
// コマの拾い方は日付ベースのビュー共通のヘルパに任せる (画面ごとに書き起こさない):
//   - 入ってくる側 = adjustmentDisplay.collectIncomingReschedules
//   - 出ていく側   = buildAdjustmentIndex の rescheduleOutBySlot → collectOutgoingReschedules
//   - コマ休講     = slotCancel.collectCancelledSlots
// イベントカレンダーは学校全体の予定表なので、その日のコマを休講・表示期間で
// 絞らずに登録された調整をそのまま数える。入る側と出る側を同じ条件で数える
// ので、振替元と振替先でコマ数が食い違わない。
// 「振替で休み」(その日の授業が全部出ていったか) は実施判定 (時間割の有効期間・
// 表示期間・休講) が要るのでここでは言わない — 日別ダッシュボード /
// タイムテーブル / 月間カレンダーの担当 (isDayEmptiedByReschedule)。

import {
  buildAdjustmentIndex,
  collectIncomingReschedules,
  collectOutgoingReschedules,
  describeSlot,
} from "./adjustmentDisplay";
import { collectCancelledSlots } from "./slotCancel";
import { fmtDateWeekday, fmtMD } from "./dateHelpers";

export const ADJ_ENTRY = Object.freeze({
  RESCHEDULE: "reschedule",
  SLOT_CANCEL: "slotCancel",
});

// 並びを保ったまま key ごとにまとめ、key の昇順 (= 日付順) で返す
function groupByKey(list, keyOf) {
  const m = new Map();
  for (const x of list) {
    const k = keyOf(x) || "";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return [...m].sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * 月の範囲の振替・コマ休講を集める。
 *
 * - `byDate` はグリッドの 1 日ぶん。振替は相手の日付ごとに 1 件
 *   (出ていく側 direction "out" と入ってくる側 "in" の両方の日に出る)、
 *   コマ休講はその日の 1 件にまとめる。並びは 出 → 入 → コマ休講
 * - `rows` は月の一覧。振替は (振替元, 振替先) の組で 1 行 (両方の日が同じ月
 *   でも 2 行にしない)。並べる日付 `date` は振替元がこの月なら振替元、
 *   そうでなければ振替先。コマ休講は日ごとに 1 行
 *
 * @param {Array} adjustments
 * @param {Array} slots 全コマ (調整が指すコマを引く。消えたコマを指す調整は数えない)
 * @param {string} monthStart "YYYY-MM-01"
 * @param {string} monthEnd "YYYY-MM-末日"
 * @returns {{byDate: Map<string, object[]>, rows: object[]}}
 */
export function collectMonthAdjustmentEntries(adjustments, slots, monthStart, monthEnd) {
  const byDate = new Map();
  const rows = [];
  if (!adjustments?.length || !monthStart || !monthEnd) return { byDate, rows };
  const inMonth = (d) => !!d && d >= monthStart && d <= monthEnd;
  // 月に関わる振替・コマ休講だけを相手にする (日付ループで毎日全件を舐めない)
  const relevant = adjustments.filter(
    (a) =>
      (a?.type === "reschedule" && (inMonth(a.date) || inMonth(a.targetDate))) ||
      (a?.type === "cancel" && inMonth(a.date))
  );
  if (relevant.length === 0) return { byDate, rows };
  const dates = new Set();
  for (const a of relevant) {
    if (inMonth(a.date)) dates.add(a.date);
    if (a.type === "reschedule" && inMonth(a.targetDate)) dates.add(a.targetDate);
  }

  const pairRows = new Map();
  const addPairRow = (fromDate, toDate, items) => {
    const key = `${fromDate}>${toDate}`;
    if (pairRows.has(key)) return;
    pairRows.set(key, {
      kind: ADJ_ENTRY.RESCHEDULE,
      id: `rs-${fromDate}-${toDate}`,
      date: inMonth(fromDate) ? fromDate : toDate,
      fromDate,
      toDate,
      items,
    });
  };

  for (const ds of [...dates].sort()) {
    const entries = [];
    const { rescheduleOutBySlot } = buildAdjustmentIndex(relevant, ds);
    const outgoing = collectOutgoingReschedules(slots, rescheduleOutBySlot);
    for (const [toDate, items] of groupByKey(outgoing, (x) => x.adj.targetDate)) {
      entries.push({
        kind: ADJ_ENTRY.RESCHEDULE,
        direction: "out",
        id: `rs-out-${ds}-${toDate}`,
        date: ds,
        fromDate: ds,
        toDate,
        items,
      });
      addPairRow(ds, toDate, items);
    }
    const incoming = collectIncomingReschedules(relevant, ds, slots);
    for (const [fromDate, items] of groupByKey(incoming, (x) => x.adj.date)) {
      entries.push({
        kind: ADJ_ENTRY.RESCHEDULE,
        direction: "in",
        id: `rs-in-${ds}-${fromDate}`,
        date: ds,
        fromDate,
        toDate: ds,
        items,
      });
      addPairRow(fromDate, ds, items);
    }
    const cancelled = collectCancelledSlots(slots, ds, relevant);
    if (cancelled.length > 0) {
      const entry = { kind: ADJ_ENTRY.SLOT_CANCEL, id: `sc-${ds}`, date: ds, items: cancelled };
      entries.push(entry);
      rows.push(entry);
    }
    if (entries.length > 0) byDate.set(ds, entries);
  }
  rows.push(...pairRows.values());
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { byDate, rows };
}

/**
 * グリッドのチップの文言を [本体, 末尾] に分けて返す。狭いセルでは本体の
 * 方を省略し、末尾 (相手の日付 / 件数) は切らさないため。
 * 振替元 ["↻ 振替 5 コマ", "→ 12/4"] / 振替先 ["↻ 振替 5 コマ", "← 12/7"] /
 * コマ休講 ["🚫 コマ休講", "3"]
 * @returns {[string, string]}
 */
export function adjustmentEntryLabelParts(entry) {
  const n = entry.items.length;
  if (entry.kind === ADJ_ENTRY.SLOT_CANCEL) return ["🚫 コマ休講", String(n)];
  return entry.direction === "in"
    ? [`↻ 振替 ${n} コマ`, `← ${fmtMD(entry.fromDate)}`]
    : [`↻ 振替 ${n} コマ`, `→ ${fmtMD(entry.toDate)}`];
}

/** チップの文言 1 行 ("↻ 振替 5 コマ → 12/4" / "🚫 コマ休講 3")。読み上げ名に使う */
export function adjustmentEntryLabel(entry) {
  return adjustmentEntryLabelParts(entry).join(" ");
}

/**
 * 見出し ("振替: 2026-12-07 (月) → 2026-12-04 (金) (5 コマ)" /
 * "コマ休講: 2026-09-19 (土) (3 コマ)")。ツールチップの 1 行目。
 */
export function adjustmentEntryHeading(entry) {
  const n = entry.items.length;
  if (entry.kind === ADJ_ENTRY.SLOT_CANCEL) {
    return `コマ休講: ${fmtDateWeekday(entry.date)} (${n} コマ)`;
  }
  return `振替: ${fmtDateWeekday(entry.fromDate)} → ${fmtDateWeekday(entry.toDate)} (${n} コマ)`;
}

/**
 * 1 コマぶんの説明 ("19:40 中3A 英語 香川 → 20:00 (福江) — 行事のため")。
 * 振替の日付は見出しに出ているので、行には時刻・担当が変わるときだけ
 * 行き先を書く。担当は元担当と同じなら書かない (describeRescheduleTarget の
 * originalTeacher と同じ扱い。書くと担当が変わった振替に読める)。
 */
export function describeAdjustmentItem({ slot, adj }) {
  const parts = [[slot.time, describeSlot(slot), slot.teacher].filter(Boolean).join(" ")];
  if (adj.type === "reschedule") {
    const change = [
      adj.targetTime,
      adj.targetTeacher && adj.targetTeacher !== slot.teacher ? `(${adj.targetTeacher})` : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (change) parts.push(`→ ${change}`);
  }
  if (adj.memo) parts.push(`— ${adj.memo}`);
  return parts.join(" ");
}
