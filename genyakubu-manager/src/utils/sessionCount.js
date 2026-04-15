// ─── 授業回数 (セッション番号) 計算 ──────────────────────────────
// 各スロットが、所属するセット内で対象日までに何回目の授業かを算出する。
// 同一セット内でも教科 (slot.subj) ごとに独立したカウンタで数える。
// 休講日 / テスト期間 / 隔週ハズレ週はカウントしない。
// 対象日で該当スロットが実施されない場合は 0 を返す。

import { WEEKDAYS } from "../data";
import { getSlotWeekType, isBiweekly } from "./biweekly";

// "YYYY-MM-DD" → Date (ローカル)
function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// slot.grade から、displayCutoff.groups 内の該当 group の startDate を引く。
// 未設定 or 対象 group 未発見の場合は null。
export function getGradeStartDate(grade, displayCutoff) {
  if (!displayCutoff || !Array.isArray(displayCutoff.groups)) return null;
  for (const g of displayCutoff.groups) {
    if (Array.isArray(g.grades) && g.grades.includes(grade)) {
      return g.startDate || null;
    }
  }
  return null;
}

// スロットが属するセット (slotIds 配列) を返す。
// セット未登録の場合は自身のみのセット (単体扱い)。
export function resolveSetSlotIds(slot, classSets) {
  if (!Array.isArray(classSets)) return [slot.id];
  for (const cs of classSets) {
    if (cs.slotIds && cs.slotIds.includes(slot.id)) return cs.slotIds;
  }
  return [slot.id];
}

// time 文字列 ("19:00-20:20") から開始時刻の分数を返す。
// 並び替え用のソート可能キー。
function timeToMinutes(time) {
  if (!time) return 0;
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

// 指定スロットを対象日付で実施するかを判定。
// - 曜日一致
// - 休講 / テスト期間に該当しない
// - 隔週スロットの場合は A 週に合致する
function isSlotActiveOn(slot, dateStr, ctx) {
  const dt = parseDate(dateStr);
  if (WEEKDAYS[dt.getDay()] !== slot.day) return false;

  // 隔週判定: B 週はスキップ。アンカーなしの隔週スロットはフォールバックで常時実施。
  if (isBiweekly(slot.note)) {
    const w = getSlotWeekType(dateStr, slot, ctx.biweeklyAnchors || []);
    if (w && w !== "A") return false;
  }

  // 休講 / テスト期間判定
  if (ctx.isOffForGrade && ctx.isOffForGrade(dateStr, slot.grade, slot.subj)) {
    return false;
  }

  return true;
}

// セット内スロット群の単一日における実施分を、安定した順序 (time, slotId)
// で返す。回数カウントの順番付けに使用。
// subj が与えられた場合は、同一教科のスロットだけを対象にする
// (セット内でも教科ごとに独立したカウンタで数えるため)。
function activeSlotsOnDay(setSlots, dateStr, ctx, subj) {
  const out = [];
  for (const s of setSlots) {
    if (subj != null && s.subj !== subj) continue;
    if (isSlotActiveOn(s, dateStr, ctx)) out.push(s);
  }
  out.sort((a, b) => {
    const ta = timeToMinutes(a.time);
    const tb = timeToMinutes(b.time);
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
  });
  return out;
}

/**
 * 対象スロットの、対象日付における授業回数 (1-indexed) を返す。
 * 開始日 未設定、対象日 < 開始日、または対象日で対象スロットが実施されない
 * 場合は 0 を返す (表示しない想定)。
 *
 * @param {object} slot 対象スロット
 * @param {string} targetDateStr "YYYY-MM-DD"
 * @param {object} ctx {classSets, allSlots, displayCutoff, isOffForGrade, biweeklyAnchors}
 * @returns {number} 回数 または 0
 */
export function computeSessionNumber(slot, targetDateStr, ctx) {
  if (!slot || !targetDateStr) return 0;

  const startDate = getGradeStartDate(slot.grade, ctx.displayCutoff);
  if (!startDate) return 0;
  if (targetDateStr < startDate) return 0;

  const setSlotIds = resolveSetSlotIds(slot, ctx.classSets);
  const slotById = new Map();
  for (const s of ctx.allSlots || []) slotById.set(s.id, s);
  const setSlots = setSlotIds.map((id) => slotById.get(id)).filter(Boolean);
  if (setSlots.length === 0) return 0;

  // 対象日当日に対象スロットが実施されるか確認 (同一教科のみで数える)
  const todayActive = activeSlotsOnDay(setSlots, targetDateStr, ctx, slot.subj);
  const todayIdx = todayActive.findIndex((s) => s.id === slot.id);
  if (todayIdx === -1) return 0;

  // 開始日から前日までの累計実施数を加算 (同一教科のみで数える)
  const start = parseDate(startDate);
  const target = parseDate(targetDateStr);
  let count = 0;
  const cur = new Date(start);
  while (cur < target) {
    const dStr = fmtDate(cur);
    count += activeSlotsOnDay(setSlots, dStr, ctx, slot.subj).length;
    cur.setDate(cur.getDate() + 1);
  }

  // 当日分は slot より前の時刻 + 自分 (todayIdx + 1) を加算
  return count + todayIdx + 1;
}

/**
 * 対象日付における全スロットのセッション番号を一括計算して Map<slotId, number>
 * を返す。ExcelGridView で useMemo と組み合わせて使う。
 *
 * @param {Array} slots 計算対象のスロット群 (表示中の日のものだけで良い)
 * @param {string} targetDateStr "YYYY-MM-DD"
 * @param {object} ctx {classSets, allSlots, displayCutoff, isOffForGrade, biweeklyAnchors}
 * @returns {Map<number, number>}
 */
export function buildSessionCountMap(slots, targetDateStr, ctx) {
  const out = new Map();
  if (!slots || slots.length === 0 || !targetDateStr) return out;

  // 同じ (セット × 教科) に属するスロットは 1 回の走査で済ませるためにキャッシュ
  const setCache = new Map(); // setKey → Map<dateStr, activeSlotIds[]>

  const slotById = new Map();
  for (const s of ctx.allSlots || []) slotById.set(s.id, s);

  for (const slot of slots) {
    const startDate = getGradeStartDate(slot.grade, ctx.displayCutoff);
    if (!startDate || targetDateStr < startDate) {
      out.set(slot.id, 0);
      continue;
    }

    const setSlotIds = resolveSetSlotIds(slot, ctx.classSets);
    const setKey =
      [...setSlotIds].sort((a, b) => a - b).join(",") +
      "|" + (slot.subj || "") +
      "|" + startDate;
    const setSlots = setSlotIds.map((id) => slotById.get(id)).filter(Boolean);
    if (setSlots.length === 0) {
      out.set(slot.id, 0);
      continue;
    }

    let dayMap = setCache.get(setKey);
    if (!dayMap) {
      dayMap = new Map();
      const start = parseDate(startDate);
      const target = parseDate(targetDateStr);
      const cur = new Date(start);
      while (cur <= target) {
        const dStr = fmtDate(cur);
        const active = activeSlotsOnDay(setSlots, dStr, ctx, slot.subj);
        dayMap.set(dStr, active.map((s) => s.id));
        cur.setDate(cur.getDate() + 1);
      }
      setCache.set(setKey, dayMap);
    }

    const todayActiveIds = dayMap.get(targetDateStr) || [];
    const todayIdx = todayActiveIds.indexOf(slot.id);
    if (todayIdx === -1) {
      out.set(slot.id, 0);
      continue;
    }

    let count = 0;
    const start = parseDate(startDate);
    const target = parseDate(targetDateStr);
    const cur = new Date(start);
    while (cur < target) {
      const dStr = fmtDate(cur);
      count += (dayMap.get(dStr) || []).length;
      cur.setDate(cur.getDate() + 1);
    }
    out.set(slot.id, count + todayIdx + 1);
  }
  return out;
}

// 見た目用の整形ヘルパ (①②... と 2 桁以上は第○回 表記)。
// 0 の場合は空文字を返すので、呼び出し側で分岐せずそのまま埋められる。
export function formatSessionNumber(n) {
  if (!n || n < 1) return "";
  if (n <= 20) {
    // Unicode circled digits ① (9312) … ⑳ (9331)
    return String.fromCharCode(9311 + n);
  }
  return `第${n}回`;
}
