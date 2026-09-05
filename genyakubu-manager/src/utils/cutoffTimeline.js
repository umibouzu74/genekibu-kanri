// ─── 期間の全体像 (時間割 / 学年グループ / コース) を帯に組む ────────
// 時間割の有効期間・表示期間設定・コース別終講日は「別のフィルタ」なので、
// どれか 1 つが旧期で終わっていると画面からコマが消える。期切替の点検で
// いちばん効くのは 3 つを同じ物差しで並べて見ることなので、帯 (ガント) 用の
// 行と位置を組む純粋関数をここに置く。
//
// 位置は 0..1 の割合で返す (描画側で % にする)。日付の無い端は openStart /
// openEnd を立てて、描画側で「続いている」ことを示す。

import { findGroupForGrade, summarizeCutoffGroups } from "./timetable";
import { addDays } from "./dateHelpers";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmt(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}


/**
 * 日付の帯の中での位置 (0..1)。範囲外は 0 / 1 に丸める。
 * @param {string} dateStr
 * @param {string} start 帯の左端
 * @param {string} end 帯の右端
 * @returns {number}
 */
export function datePos(dateStr, start, end) {
  if (!dateStr || !start || !end) return 0;
  const s = parseDate(start).getTime();
  const e = parseDate(end).getTime();
  if (e <= s) return 0;
  const t = parseDate(dateStr).getTime();
  return Math.min(1, Math.max(0, (t - s) / (e - s)));
}

/**
 * 帯に並べる月の目盛り (月初の位置)。
 * @returns {{label: string, pos: number}[]}
 */
export function monthTicks(start, end) {
  if (!start || !end) return [];
  const out = [];
  const cur = parseDate(start);
  cur.setDate(1);
  const last = parseDate(end);
  for (let i = 0; i < 60 && cur <= last; i++) {
    const ds = fmt(cur);
    if (ds >= start) out.push({ label: `${cur.getMonth() + 1}月`, pos: datePos(ds, start, end) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

// 学年グループのコマが属する時間割のうち、いちばん遅い終了日。
// 「時間割はまだ有効なのに表示期間が先に終わっている」区間 (uncovered) の
// 検出に使う。終了日なし (無期限) の時間割が混じっていれば open を立て、
// uncovered は帯の右端まで伸ばす。
function latestTimetableEndForGroup(timetables, slotById, groupSlotIds) {
  const ids = new Set();
  for (const id of groupSlotIds || []) {
    const s = slotById.get(id);
    if (s) ids.add(s.timetableId ?? 1);
  }
  let latest = null;
  let open = false;
  for (const tt of timetables || []) {
    if (!ids.has(tt.id)) continue;
    if (!tt.endDate) {
      open = true;
      continue;
    }
    if (!latest || tt.endDate > latest) latest = tt.endDate;
  }
  return { latest, open };
}

/**
 * 帯の行と目盛りを組む。
 *
 * @param {{timetables?: object[], slots?: object[],
 *          displayCutoff?: object|null, todayStr: string,
 *          includeCohorts?: boolean}} params
 * @returns {{start: string, end: string, todayPos: number|null,
 *            ticks: {label: string, pos: number}[], rows: object[]}}
 */
export function buildCutoffTimeline({
  timetables = [],
  slots = [],
  displayCutoff,
  todayStr,
  includeCohorts = true,
}) {
  const groups = displayCutoff?.groups || [];
  const cohorts = displayCutoff?.cohorts || [];
  const summary = summarizeCutoffGroups(slots, displayCutoff);
  const slotById = new Map((slots || []).map((s) => [s.id, s]));

  const dates = [];
  for (const tt of timetables) {
    if (tt.startDate) dates.push(tt.startDate);
    if (tt.endDate) dates.push(tt.endDate);
  }
  for (const g of groups) {
    if (g.startDate) dates.push(g.startDate);
    if (g.date) dates.push(g.date);
  }
  for (const c of cohorts) if (c.date) dates.push(c.date);
  if (todayStr) dates.push(todayStr);

  // 端の日付だけだと帯の両端に貼り付くので、前後に余白を取る。
  // 日付が 1 つも無いときは今日を中心に半年ぶんの物差しを引く。
  const min = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : todayStr;
  const max = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : todayStr;
  const span = Math.max(
    1,
    Math.round((parseDate(max).getTime() - parseDate(min).getTime()) / DAY_MS)
  );
  const pad = Math.max(7, Math.round(span * 0.05));
  const start = addDays(min, -pad);
  const end = addDays(max, pad);

  const bar = (startDate, endDate) => {
    const s = startDate || start;
    const e = endDate || end;
    const left = datePos(s, start, end);
    const width = Math.max(0.004, datePos(e, start, end) - left);
    return { left, width };
  };

  const rows = [];

  for (const tt of timetables) {
    rows.push({
      key: `tt-${tt.id}`,
      kind: "timetable",
      label: tt.name,
      sub: (tt.grades || []).length > 0 ? (tt.grades || []).join("・") : "全学年",
      startDate: tt.startDate || null,
      endDate: tt.endDate || null,
      openStart: !tt.startDate,
      openEnd: !tt.endDate,
      ...bar(tt.startDate, tt.endDate),
    });
  }

  for (const g of groups) {
    const info = summary.get(g.label) || { slotCount: 0, slotIds: [] };
    const invalid = !!(g.startDate && g.date && g.startDate > g.date);
    const tt = latestTimetableEndForGroup(timetables, slotById, info.slotIds);
    // 時間割はまだ有効なのに表示期間が先に終わっている区間
    let uncovered = null;
    if (g.date && info.slotCount > 0 && (tt.open || (tt.latest && tt.latest > g.date))) {
      const uStart = addDays(g.date, 1);
      const uEnd = tt.open ? null : tt.latest;
      uncovered = { ...bar(uStart, uEnd), endDate: uEnd, openEnd: tt.open };
    }
    rows.push({
      key: `group-${g.label}`,
      kind: "group",
      label: g.label,
      sub: `${info.slotCount} コマ`,
      startDate: g.startDate || null,
      endDate: g.date || null,
      openStart: !g.startDate,
      openEnd: !g.date,
      slotCount: info.slotCount,
      invalid,
      uncovered,
      ...bar(g.startDate, g.date),
    });

    if (!includeCohorts) continue;
    for (const c of cohorts) {
      if (!c.date) continue;
      if (findGroupForGrade(c.grade, groups)?.label !== g.label) continue;
      rows.push({
        key: `cohort-${c.id}`,
        kind: "cohort",
        label: c.label,
        sub: "",
        startDate: g.startDate || null,
        endDate: c.date,
        openStart: !g.startDate,
        openEnd: false,
        // グループ終了日より後のコース終講日は表示されない (グループが外側の枠)
        invalid: !!(g.date && c.date > g.date),
        ...bar(g.startDate, c.date),
      });
    }
  }

  return {
    start,
    end,
    todayPos: todayStr ? datePos(todayStr, start, end) : null,
    ticks: monthTicks(start, end),
    rows,
  };
}
