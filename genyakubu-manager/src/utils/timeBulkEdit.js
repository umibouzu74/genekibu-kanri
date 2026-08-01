// ─── 時刻一括変換 (期切替支援) ──────────────────────────────────────
// 前期 → 後期のような期の切替で「割当 (教科・講師・クラス) はそのまま、
// 時刻だけ差し替える」ための純粋関数群。対象時間割 × 学年 × 曜日で
// 絞ったコマ群に、時刻置換マップ (from → to) を適用する。
// 学年は完全一致で照合する ("中3" 指定で "中1-3" や "附中3" は対象外)。

// slot.time の想定形式。データは自由入力だが、変換先 (to) はタイポで
// ソートや重複判定が壊れないようこの形式のみ受け付ける。
const TIME_RANGE_RE = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

export function isWellFormedTimeRange(str) {
  return TIME_RANGE_RE.test((str || "").trim());
}

/** フィルタに合致するか。grades / days は空配列 = 全対象 */
export function slotMatchesFilter(slot, { timetableId, grades, days }) {
  if ((slot.timetableId ?? 1) !== timetableId) return false;
  if (grades && grades.length > 0 && !grades.includes(slot.grade)) return false;
  if (days && days.length > 0 && !days.includes(slot.day)) return false;
  return true;
}

// slot に最初に合致する mapping の index を返す (なければ -1)。
// from との照合は前後空白を無視した完全一致。
function matchMappingIndex(slot, mappings) {
  const time = (slot.time || "").trim();
  for (let i = 0; i < mappings.length; i++) {
    const from = (mappings[i]?.from || "").trim();
    if (from && from === time) return i;
  }
  return -1;
}

/**
 * 変換プランを作る (適用はしない)。プレビュー表示と適用の両方で使う。
 * @param {import("../types").Slot[]} slots 全スロット
 * @param {{timetableId: number, grades: string[], days: string[]}} filter
 * @param {{from: string, to: string}[]} mappings
 * @returns {{
 *   changes: {slot: import("../types").Slot, to: string}[],
 *   countsByMapping: number[],
 * }} changes は from ≠ to のコマのみ。countsByMapping は mapping ごとの件数。
 */
export function planTimeBulkEdit(slots, filter, mappings) {
  const changes = [];
  const countsByMapping = (mappings || []).map(() => 0);
  for (const slot of slots || []) {
    if (!slotMatchesFilter(slot, filter)) continue;
    const idx = matchMappingIndex(slot, mappings || []);
    if (idx < 0) continue;
    const to = (mappings[idx].to || "").trim();
    if (!to || to === (slot.time || "").trim()) continue;
    countsByMapping[idx] += 1;
    changes.push({ slot, to });
  }
  return { changes, countsByMapping };
}

/**
 * 変換を適用した新しい slots 配列を返す。変更のないスロットは同一参照。
 * @returns {{slots: import("../types").Slot[], changedCount: number}}
 */
export function applyTimeBulkEdit(slots, filter, mappings) {
  const { changes } = planTimeBulkEdit(slots, filter, mappings);
  if (changes.length === 0) return { slots, changedCount: 0 };
  const toById = new Map(changes.map((c) => [c.slot.id, c.to]));
  return {
    slots: slots.map((s) => {
      const to = toById.get(s.id);
      return to ? { ...s, time: to } : s;
    }),
    changedCount: changes.length,
  };
}

// フォームへのプリフィル用プリセット。適用先の時間割は UI で選ぶ。
// 2026 後期: 中3 平日は 18:00 開始で最終コマ (20:45-21:30) を 1 限へ
// 前倒しし、確認テストも同幅で繰り上げる。1・2 限の時刻は後期でも
// そのまま 2・3 限として残るため、変換対象はこの 2 種類だけで足りる。
export const TIME_BULK_PRESETS = [
  {
    key: "chu3-heijitsu-maedaoshi",
    label: "中3 平日前倒し (後期)",
    description:
      "最終コマ 20:45-21:30 → 1限 18:00-18:45、確認テスト 21:35-21:50 → 20:40-20:55",
    grades: ["中3"],
    days: ["月", "火", "水", "木", "金"],
    mappings: [
      { from: "20:45-21:30", to: "18:00-18:45" },
      { from: "21:35-21:50", to: "20:40-20:55" },
    ],
  },
];
