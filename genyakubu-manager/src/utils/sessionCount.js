// ─── 授業回数 (セッション番号) 計算 ──────────────────────────────
// 各スロットが、所属するセット内で対象日までに何回目の授業かを算出する。
// 同一セット内でも教科 (slot.subj) ごとに独立したカウンタで数える。
// 「英/数」のような複合教科の隔週スロットは A 週 = 先頭教科 / B 週 = 次教科
// としてそれぞれ独立にカウントする。
// 休講日 / テスト期間 / 単独教科隔週の B 週はカウントしない。
// 対象日で対象スロットがその教科を実施していない場合は 0 を返す。

import { gradeToDept, WEEKDAYS } from "../data";
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

// 略称を正式名に正規化 (複合教科 "英/数" の分割時に使用)。
// 組み込み主要教科のみ対応; 未登録の文字列はそのまま返す。
const SUBJECT_ALIASES = {
  "英": "英語",
  "数": "数学",
  "国": "国語",
  "社": "社会",
  "理": "理科",
};
function normalizeSubjectName(s) {
  if (!s) return s;
  const t = s.trim();
  return SUBJECT_ALIASES[t] || t;
}

// "英/数" → ["英語", "数学"], "英語" → ["英語"]
function parseSubjects(subjStr) {
  if (!subjStr) return [];
  return subjStr
    .split("/")
    .map((s) => normalizeSubjectName(s))
    .filter(Boolean);
}

// 中学部の開講日 1 限目はオリエンテーションに置き換わるため、授業として
// カウントしない。対象スロットが
//   - ctx.orientationOnFirstDay = true (呼び出し側でオプトイン)
//   - 中学部
//   - 対象日 == 自分の学年の開始日
//   - 同じ学年・同じ曜日のスロット群のなかで最早時刻
// をすべて満たすとき true。
function isOrientationSlot(slot, dateStr, ctx) {
  if (!ctx.orientationOnFirstDay) return false;
  if (gradeToDept(slot.grade) !== "中学部") return false;
  const startDate = getGradeStartDate(slot.grade, ctx.displayCutoff);
  if (!startDate || dateStr !== startDate) return false;

  const dt = parseDate(dateStr);
  const dayKey = WEEKDAYS[dt.getDay()];
  let earliestMin = Infinity;
  for (const s of ctx.allSlots || []) {
    if (s.grade !== slot.grade) continue;
    if (s.day !== dayKey) continue;
    const m = timeToMinutes(s.time);
    if (m < earliestMin) earliestMin = m;
  }
  if (earliestMin === Infinity) return false;
  return timeToMinutes(slot.time) === earliestMin;
}

// 対象日にスロットがどの教科を実施しているかを返す。
// 実施なし (曜日違い / 休講 / 単独教科隔週の B 週 / 中学部開講日 1 限の
// オリエンテーション) の場合は null。
// 複合教科の隔週スロット ("英/数" + 隔週) は毎週実施され、A 週は先頭教科、
// B 週は次の教科を返す (それぞれ独立した進度としてカウントされる)。
// アンカー未設定の隔週スロットは常時実施 (先頭教科) にフォールバック。
function effectiveSubjectOnDay(slot, dateStr, ctx) {
  const dt = parseDate(dateStr);
  if (WEEKDAYS[dt.getDay()] !== slot.day) return null;

  // 休講 / テスト期間 (exam) 判定は生の slot.subj で評価 (既存挙動維持)。
  if (ctx.isOffForGrade && ctx.isOffForGrade(dateStr, slot.grade, slot.subj)) {
    return null;
  }

  // 中学部開講日の 1 限目はオリエン (授業実施なし)。
  if (isOrientationSlot(slot, dateStr, ctx)) return null;

  const parts = parseSubjects(slot.subj);
  const bi = isBiweekly(slot.note);

  if (bi) {
    const w = getSlotWeekType(dateStr, slot, ctx.biweeklyAnchors || []);
    if (parts.length > 1) {
      // 複合教科の隔週: 毎週実施、教科が A/B で入れ替わる。
      if (!w) return parts[0];
      const idx = w === "A" ? 0 : 1;
      return parts[idx] || parts[parts.length - 1];
    }
    // 単独教科の隔週: B 週は実施なし (アンカーなしなら常時実施)。
    if (w && w !== "A") return null;
  }

  return parts[0] || slot.subj || null;
}

// セット内スロット群の単一日における「対象教科を実施する」スロットを、
// 安定した順序 (time, slotId) で返す。回数カウントの順番付けに使用。
// targetSubj が与えられた場合、その教科を実施するスロットのみを対象にする。
function activeSlotsOnDay(setSlots, dateStr, ctx, targetSubj) {
  const out = [];
  for (const s of setSlots) {
    const eff = effectiveSubjectOnDay(s, dateStr, ctx);
    if (eff == null) continue;
    if (targetSubj != null && eff !== targetSubj) continue;
    out.push(s);
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

  // 対象日当日に対象スロットが実施している教科を特定 (隔週複合教科は週ごとに変わる)
  const targetSubj = effectiveSubjectOnDay(slot, targetDateStr, ctx);
  if (targetSubj == null) return 0;

  // 対象日当日の該当教科スロット一覧内での自分の位置
  const todayActive = activeSlotsOnDay(setSlots, targetDateStr, ctx, targetSubj);
  const todayIdx = todayActive.findIndex((s) => s.id === slot.id);
  if (todayIdx === -1) return 0;

  // 開始日から前日までの同一教科の累計実施数を加算
  const start = parseDate(startDate);
  const target = parseDate(targetDateStr);
  let count = 0;
  const cur = new Date(start);
  while (cur < target) {
    const dStr = fmtDate(cur);
    count += activeSlotsOnDay(setSlots, dStr, ctx, targetSubj).length;
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

    // 対象日における当該スロットの実施教科 (複合教科の隔週は週で変わる)
    const targetSubj = effectiveSubjectOnDay(slot, targetDateStr, ctx);
    if (targetSubj == null) {
      out.set(slot.id, 0);
      continue;
    }

    const setSlotIds = resolveSetSlotIds(slot, ctx.classSets);
    // キャッシュキーは (セット × 実施教科 × 開始日) 単位で分離。
    const setKey =
      [...setSlotIds].sort((a, b) => a - b).join(",") +
      "|" + targetSubj +
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
        const active = activeSlotsOnDay(setSlots, dStr, ctx, targetSubj);
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
