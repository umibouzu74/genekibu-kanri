// ─── 授業回数 (セッション番号) 計算 ──────────────────────────────
// 各スロットが、所属するセット内で対象日までに何回目の授業かを算出する。
// 同一セット内でも教科 (slot.subj) ごとに独立したカウンタで数える。
// 「英/数」のような複合教科の隔週スロットは A 週 = 先頭教科 / B 週 = 次教科
// としてそれぞれ独立にカウントする。
// 休講日 / テスト期間 / 単独教科隔週の B 週はカウントしない。
// 対象日で対象スロットがその教科を実施していない場合は 0 を返す。
// 所属時間割の有効期間外の日もカウントしない (前期/後期のように期を
// またいで同種のコマが並存しても二重カウントしない)。カウント起点は
// 学年グループ開始日と所属時間割 startDate の遅い方 (getSlotCountStartDate)
// なので、期の切替では「第N回」が 1 から数え直しになる。
//
// SessionOverride (回数手動補正) の扱い:
//   - mode:"set"  → そのコマの回数を value に強制し、以降の同バケット
//                    スロットは value を基準に連番で続く。value は以降
//                    の通常カウントで二重使用されないよう予約扱い。
//   - mode:"skip" → そのコマを「実施していない」扱いとし、回数カウンタを
//                    進めない。displayAs を指定するとその値を表示し、
//                    かつその値を予約扱いとするため、以降の通常カウント
//                    が displayAs に到達すると自動で飛び越す。

import { gradeToDept, WEEKDAYS } from "../data";
// time 文字列 ("19:00-20:20") → 開始時刻の分数 (ソートキー)。
// 実装は dateHelpers.timeStartToMin に一元化し、このファイル内の従来名で使う。
import { timeStartToMin as timeToMinutes } from "./dateHelpers";
import { isSlotCancelledByDaySchedule } from "./daySchedules";
import { getSlotWeekType, isBiweekly } from "./biweekly";
import { slotGroupKey } from "./parallelSlots";
import { buildSlotCohortIndex } from "./cohorts";
import { isTimetableActiveForDate, findGroupForGrade } from "./timetable";

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
// グループの照合は表示フィルタ (isSlotBeyondCutoff) と同じ findGroupForGrade を
// 使う。完全一致で引くと「中1-3」(土曜プレップ等) のような複合学年が
// どのグループにも当たらず、表示は中1・2 の期間で効いているのに回数だけ
// 出ない、という食い違いが起きる (2026-08-18 修正)。
export function getGradeStartDate(grade, displayCutoff) {
  if (!displayCutoff || !Array.isArray(displayCutoff.groups)) return null;
  const group = findGroupForGrade(grade, displayCutoff.groups);
  return (group && group.startDate) || null;
}

// 学年グループ (表示期間設定) の「開講日 1 限をオリエン扱いにする」設定を引く。
// displayCutoff.groups[].orientationFirstDay:
//   - true / false  → その設定に従う (画面から明示的に切り替えた状態)
//   - 未設定 (undefined/null) → 従来どおり中学部のみ有効の既定値
// 2 学期以降のようにオリエンが入らない期は、表示期間設定でオフにする。
export function isOrientationEnabledForGrade(grade, displayCutoff) {
  if (!grade) return false;
  const group = findGroupForGrade(grade, displayCutoff?.groups);
  if (group && typeof group.orientationFirstDay === "boolean") {
    return group.orientationFirstDay;
  }
  return gradeToDept(grade) === "中学部";
}

// slot の所属時間割がその日に有効か。ctx.timetables 未指定 (単一時間割
// 運用) は常に有効扱い。時間割が見つからないコマは表示系
// (filterSlotsForDate) と同様に無効へ倒す。
function isSlotTimetableActive(slot, dateStr, ctx) {
  const tts = ctx.timetables;
  if (!Array.isArray(tts) || tts.length === 0) return true;
  const tt = tts.find((t) => t.id === (slot.timetableId ?? 1));
  return isTimetableActiveForDate(tt, dateStr, slot.grade);
}

// slot の回数カウント起点。学年グループの開始日 (表示期間設定) と
// 所属時間割の startDate の遅い方。後期など期を切り替えた時間割では
// 時間割の開始日が起点になり、「第N回」は期ごとに 1 から数え直しになる。
export function getSlotCountStartDate(slot, ctx) {
  const gradeStart = getGradeStartDate(slot.grade, ctx.displayCutoff);
  let ttStart = null;
  if (Array.isArray(ctx.timetables)) {
    const tt = ctx.timetables.find((t) => t.id === (slot.timetableId ?? 1));
    ttStart = (tt && tt.startDate) || null;
  }
  if (gradeStart && ttStart) return ttStart > gradeStart ? ttStart : gradeStart;
  return ttStart || gradeStart;
}

// スロットが属するセット (slotIds 配列) を返す。
// 優先順位: ① 明示的に登録された ClassSet → ② コース (コホート) 単位の
// フォールバック束ね (cohortIndex) → ③ 自身のみ (単体扱い)。
// ② により、ClassSet 未登録でも 高1・2 英数 (週2) や中学コースの回数が
// 「コース」単位で通算される (終講日コホートと同じ定義)。
export function resolveSetSlotIds(slot, classSets, cohortIndex) {
  if (Array.isArray(classSets)) {
    for (const cs of classSets) {
      if (cs.slotIds && cs.slotIds.includes(slot.id)) return cs.slotIds;
    }
  }
  if (cohortIndex) {
    const ids = cohortIndex.get(slot.id);
    if (ids && ids.length) return ids;
  }
  return [slot.id];
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

// startDate 以降で、pool 内のいずれかの slot が実施される初の日付を返す。
// 休講日 (isOffForGrade) はスキップ。隔週は判定対象に含めない (B 週でも候補)。
// 該当なしまたは startDate 未指定の場合は null。
function findPoolFirstDate(pool, startDate, ctx) {
  if (!startDate || !pool || pool.length === 0) return null;
  const days = new Set(pool.map((s) => s.day));
  const cur = parseDate(startDate);
  for (let i = 0; i < 31; i++) {
    const dStr = fmtDate(cur);
    const dt = parseDate(dStr);
    const dayKey = WEEKDAYS[dt.getDay()];
    if (days.has(dayKey)) {
      for (const s of pool) {
        if (s.day !== dayKey) continue;
        if (!isSlotTimetableActive(s, dStr, ctx)) continue;
        if (ctx.isOffForGrade && ctx.isOffForGrade(dStr, s.grade, s.subj)) continue;
        if (isSlotCancelledByDaySchedule(s, dStr, ctx.daySchedules)) continue;
        return dStr;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return null;
}

// 開講日の 1 限目がオリエンテーションに置き換わる学年グループでは、その
// コマを授業としてカウントしない。
//   - ctx.orientationOnFirstDay = true (呼び出し側でオプトイン)
//   - 学年グループ (表示期間設定) の orientationFirstDay が有効
//     (未設定なら従来どおり中学部のみ有効。2 学期以降のようにオリエンが
//      入らない期は画面からオフにする)
//   - 対象日 == そのスロットが属するセットの「初開講日」
//        セット未登録のスロットは同学年単位にフォールバック
//   - 同セット (または同学年) 同曜日のなかで最早時刻
// 例: 中2 月木セット (startDate 4/7 火) → 月は 4/13 だが木が 4/9 で早い
//     ので 4/9 (木) が初開講日。その日の同セット内最早時刻が 1 限。
function isOrientationSlot(slot, dateStr, ctx) {
  if (!ctx.orientationOnFirstDay) return false;
  if (!isOrientationEnabledForGrade(slot.grade, ctx.displayCutoff)) return false;
  const startDate = getGradeStartDate(slot.grade, ctx.displayCutoff);
  if (!startDate) return false;

  // pool: 「1 限目」判定の対象スロット群。
  //   - セット登録済み (size>1) → セット内 slots
  //   - 未登録 → 同学年の全 slots (cohort 推定不能のため学年単位で代替)
  const setSlotIds = resolveSetSlotIds(slot, ctx.classSets, ctx._cohortIndex);
  const slotById = new Map();
  for (const s of ctx.allSlots || []) slotById.set(s.id, s);
  const setSlots = setSlotIds.map((id) => slotById.get(id)).filter(Boolean);
  const pool =
    setSlots.length > 1
      ? setSlots
      : (ctx.allSlots || []).filter((s) => s.grade === slot.grade);

  const firstDate = findPoolFirstDate(pool, startDate, ctx);
  if (!firstDate || dateStr !== firstDate) return false;

  const dt = parseDate(dateStr);
  const dayKey = WEEKDAYS[dt.getDay()];
  let earliestMin = Infinity;
  for (const s of pool) {
    if (s.day !== dayKey) continue;
    // 別の期のコマ (例: 後期の 18:00 開始) が開講日の 1 限判定を奪わないように
    if (!isSlotTimetableActive(s, dateStr, ctx)) continue;
    const m = timeToMinutes(s.time);
    if (m < earliestMin) earliestMin = m;
  }
  if (earliestMin === Infinity) return false;
  return timeToMinutes(slot.time) === earliestMin;
}

// 対象日にスロットがどの教科を実施しているかを返す。
// 実施なし (曜日違い / 休講 / 単独教科隔週の B 週 / 開講日 1 限の
// オリエンテーション) の場合は null。
// 複合教科の隔週スロット ("英/数" + 隔週) は毎週実施され、A 週は先頭教科、
// B 週は次の教科を返す (それぞれ独立した進度としてカウントされる)。
// アンカー未設定の隔週スロットは常時実施 (先頭教科) にフォールバック。
function effectiveSubjectOnDay(slot, dateStr, ctx) {
  const dt = parseDate(dateStr);
  if (WEEKDAYS[dt.getDay()] !== slot.day) return null;

  // 所属時間割の有効期間外は実施なし (期をまたぐ二重カウント防止)。
  if (!isSlotTimetableActive(slot, dateStr, ctx)) return null;

  // 休講 / テスト期間 (exam) 判定は生の slot.subj で評価 (既存挙動維持)。
  if (ctx.isOffForGrade && ctx.isOffForGrade(dateStr, slot.grade, slot.subj)) {
    return null;
  }

  // 特別時程の部分休講 (例: 附属の 1 限カット)。その日は実施なしとして
  // カウントを進めない。時刻読み替え (timeMap) は同日実施なので影響しない。
  if (isSlotCancelledByDaySchedule(slot, dateStr, ctx.daySchedules)) {
    return null;
  }

  // 中学部開講日の 1 限目はオリエン (授業実施なし)。
  if (isOrientationSlot(slot, dateStr, ctx)) return null;

  const parts = parseSubjects(slot.subj);
  const bi = isBiweekly(slot.note);

  if (bi) {
    const w = getSlotWeekType(
      dateStr, slot, ctx.biweeklyAnchors || [], ctx.holidays, ctx.examPeriods
    );
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

/**
 * 対象日にそのコマが実施されるか (曜日・時間割の有効期間・休講・テスト期間・
 * 特別時程の部分休講・単独教科隔週の B 週・開講日 1 限のオリエンを考慮)。
 * 回数の起点 (開始日) には依存しないので、開始日が未設定でも判定できる。
 * @param {object} slot
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {object} ctx computeSessionNumber と同じ ctx
 * @returns {boolean}
 */
export function isSlotHeldOnDate(slot, dateStr, ctx) {
  if (!slot || !dateStr || !ctx) return false;
  return effectiveSubjectOnDay(slot, dateStr, ctx) != null;
}

// セット内スロット群の単一日における「対象教科 × 対象 cohort を実施する」
// スロットを、安定した順序 (time, slotId) で返す。回数カウントの順番付け。
// targetSubj が与えられた場合は同教科のみ。
// targetCls が与えられた場合は同 cls (cohort) のみ。
// 学年×曜日ペアでセットを括っても、cohort と教科で進度カウンタを独立させる。
function activeSlotsOnDay(setSlots, dateStr, ctx, targetSubj, targetCls) {
  const out = [];
  for (const s of setSlots) {
    const eff = effectiveSubjectOnDay(s, dateStr, ctx);
    if (eff == null) continue;
    if (targetSubj != null && eff !== targetSubj) continue;
    if (targetCls != null && (s.cls || "") !== targetCls) continue;
    out.push(s);
  }
  out.sort((a, b) => {
    const ta = timeToMinutes(a.time);
    const tb = timeToMinutes(b.time);
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
  });
  // 並列スロット (同一 day|time|grade|cls|subj で担任のみ違う) は 1 コマとして
  // カウントする。例: 中3 火 21:35 確認テスト 藤田 + 大屋敷 → +1 回
  const seen = new Set();
  const deduped = [];
  for (const s of out) {
    const key = slotGroupKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }
  return deduped;
}

// (slotId × date) → SessionOverride のインデックスを作る。
// ctx.sessionOverrides 未指定時は空 Map を返す。
function buildOverrideIndex(sessionOverrides) {
  const idx = new Map();
  if (!Array.isArray(sessionOverrides)) return idx;
  for (const o of sessionOverrides) {
    if (!o || typeof o !== "object") continue;
    idx.set(`${o.slotId}|${o.date}`, o);
  }
  return idx;
}

// 1 つの (setKey) バケットに属する setSlots について、対象教科 × cohort で
// 開始日〜対象日 (含む) の各日・各スロットの回数を算出した Map を返す。
//   key:   `${slotId}|${dateStr}`
//   value: 1-indexed の回数 (skip + displayAs 未指定時は 0)
// 走査中に override を見つけたらそれに従い、通常カウント時は reserved
// (既に override で消費された値の集合) をスキップしながら +1 する。
function computeBucketCounts(
  setSlots,
  startDateStr,
  targetDateStr,
  targetSubj,
  targetCls,
  ctx,
  overrideIndex,
) {
  const result = new Map();
  if (!startDateStr || targetDateStr < startDateStr) return result;

  const start = parseDate(startDateStr);
  const end = parseDate(targetDateStr);
  const cur = new Date(start);
  let running = 0;
  const reserved = new Set();
  while (cur <= end) {
    const dStr = fmtDate(cur);
    const active = activeSlotsOnDay(setSlots, dStr, ctx, targetSubj, targetCls);
    for (const s of active) {
      const ov = overrideIndex.get(`${s.id}|${dStr}`);
      if (ov && ov.mode === "skip") {
        const disp =
          typeof ov.displayAs === "number" && Number.isFinite(ov.displayAs) && ov.displayAs > 0
            ? ov.displayAs
            : 0;
        if (disp > 0) reserved.add(disp);
        result.set(`${s.id}|${dStr}`, disp);
        continue;
      }
      if (
        ov &&
        ov.mode === "set" &&
        typeof ov.value === "number" &&
        Number.isFinite(ov.value)
      ) {
        running = ov.value;
        reserved.add(running);
        result.set(`${s.id}|${dStr}`, running);
        continue;
      }
      running += 1;
      while (reserved.has(running)) running += 1;
      result.set(`${s.id}|${dStr}`, running);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

/**
 * 対象スロットの、対象日付における授業回数 (1-indexed) を返す。
 * 開始日 未設定、対象日 < 開始日、または対象日で対象スロットが実施されない
 * 場合は 0 を返す (表示しない想定)。
 *
 * @param {object} slot 対象スロット
 * @param {string} targetDateStr "YYYY-MM-DD"
 * @param {object} ctx {classSets, allSlots, displayCutoff, timetables?, isOffForGrade, biweeklyAnchors, sessionOverrides?}
 * @returns {number} 回数 または 0
 */
export function computeSessionNumber(slot, targetDateStr, ctx) {
  if (!slot || !targetDateStr) return 0;
  if (!ctx._cohortIndex) {
    ctx = { ...ctx, _cohortIndex: buildSlotCohortIndex(ctx.allSlots) };
  }

  const startDate = getSlotCountStartDate(slot, ctx);
  if (!startDate) return 0;
  if (targetDateStr < startDate) return 0;

  const setSlotIds = resolveSetSlotIds(slot, ctx.classSets, ctx._cohortIndex);
  const slotById = new Map();
  for (const s of ctx.allSlots || []) slotById.set(s.id, s);
  const setSlots = setSlotIds.map((id) => slotById.get(id)).filter(Boolean);
  if (setSlots.length === 0) return 0;

  // 対象日当日に対象スロットが実施している教科を特定 (隔週複合教科は週ごとに変わる)
  const targetSubj = effectiveSubjectOnDay(slot, targetDateStr, ctx);
  if (targetSubj == null) return 0;
  const targetCls = slot.cls || "";

  const overrideIndex = buildOverrideIndex(ctx.sessionOverrides);
  const bucket = computeBucketCounts(
    setSlots,
    startDate,
    targetDateStr,
    targetSubj,
    targetCls,
    ctx,
    overrideIndex,
  );
  return bucket.get(`${slot.id}|${targetDateStr}`) || 0;
}

/**
 * 対象日付における全スロットのセッション番号を一括計算して Map<slotId, number>
 * を返す。ExcelGridView で useMemo と組み合わせて使う。
 *
 * @param {Array} slots 計算対象のスロット群 (表示中の日のものだけで良い)
 * @param {string} targetDateStr "YYYY-MM-DD"
 * @param {object} ctx {classSets, allSlots, displayCutoff, timetables?, isOffForGrade, biweeklyAnchors, sessionOverrides?}
 * @returns {Map<number, number>}
 */
export function buildSessionCountMap(slots, targetDateStr, ctx) {
  const out = new Map();
  if (!slots || slots.length === 0 || !targetDateStr) return out;
  if (!ctx._cohortIndex) {
    ctx = { ...ctx, _cohortIndex: buildSlotCohortIndex(ctx.allSlots) };
  }

  const overrideIndex = buildOverrideIndex(ctx.sessionOverrides);

  // 同じ (セット × 教科 × cohort) に属するスロットは 1 回の走査で済ませる
  const setCache = new Map(); // setKey → Map<`${slotId}|${dateStr}`, count>

  const slotById = new Map();
  for (const s of ctx.allSlots || []) slotById.set(s.id, s);

  for (const slot of slots) {
    const startDate = getSlotCountStartDate(slot, ctx);
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
    const targetCls = slot.cls || "";

    const setSlotIds = resolveSetSlotIds(slot, ctx.classSets, ctx._cohortIndex);
    // キャッシュキーは (セット × 実施教科 × cohort × 開始日) 単位で分離。
    // 区切りには非可視文字 (US: \u001f) を使い、ユーザー入力 (cls 等) に
    // 通常含まれない文字で衝突を防ぐ。
    const SEP = "\u001f";
    const setKey =
      [...setSlotIds].sort((a, b) => a - b).join(",") +
      SEP + targetSubj +
      SEP + targetCls +
      SEP + startDate;
    const setSlots = setSlotIds.map((id) => slotById.get(id)).filter(Boolean);
    if (setSlots.length === 0) {
      out.set(slot.id, 0);
      continue;
    }

    let bucket = setCache.get(setKey);
    if (!bucket) {
      bucket = computeBucketCounts(
        setSlots,
        startDate,
        targetDateStr,
        targetSubj,
        targetCls,
        ctx,
        overrideIndex,
      );
      setCache.set(setKey, bucket);
    }

    out.set(slot.id, bucket.get(`${slot.id}|${targetDateStr}`) || 0);
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
