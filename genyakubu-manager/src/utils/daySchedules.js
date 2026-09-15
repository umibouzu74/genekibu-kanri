// ─── 特別時程 (DaySchedule) ─────────────────────────────────────────
// 学校行事の都合で特定日だけ時程が変わるコース (主に附属) のための
// 「日付 × 対象学年 × 時刻読み替え + 部分休講」。
//   - timeMap:     slot.time と完全一致した時間帯を別の時間帯に読み替える
//                  (例: 50 分授業への圧縮。中身・担当はそのまま)
//   - cancelTimes: 一致した時間帯のコマをその日だけ休講扱いにする
//                  (例: 1 限カット)。回数カウント (第N回) も進めない
// 時刻はコードに固定せず、その日のコマから導出したプリセットを UI で
// 編集して保存する。読み替えは表示・衝突判定用で、Slot 本体は変更しない。
//
// 制限 (v1): 隔週ローテーションのスキップ判定 (biweekly) には関与しない。
// cancelTimes で隔週コマを休講にしても週タイプは進む (附属に隔週コマが
// 無いため。必要になったら biweekly 側へ配線する)。

import { timeStartToMin } from "./dateHelpers";
import { splitTeacherField } from "./biweekly";

// ── 照合 ────────────────────────────────────────────────────────────

// その日に有効な特別時程の一覧 (登録順)
export function getDaySchedulesForDate(daySchedules, dateStr) {
  if (!Array.isArray(daySchedules) || !dateStr) return [];
  return daySchedules.filter((d) => d && d.date === dateStr);
}

/**
 * slot × 日付 → 特別時程の適用結果。
 * @returns {null
 *   | {schedule: object, cancelled: true}
 *   | {schedule: object, time: string}}
 * 複数件が同じコマに該当する場合は登録順の先勝ち。1 件の中では
 * cancelTimes が timeMap より優先 (休講したコマは読み替えない)。
 */
export function resolveSlotDaySchedule(slot, dateStr, daySchedules) {
  if (!slot) return null;
  for (const d of getDaySchedulesForDate(daySchedules, dateStr)) {
    if (!(d.targetGrades || []).includes(slot.grade)) continue;
    if ((d.cancelTimes || []).includes(slot.time)) {
      return { schedule: d, cancelled: true };
    }
    const entry = (d.timeMap || []).find((m) => m && m.from === slot.time);
    if (entry && entry.to && entry.to !== slot.time) {
      return { schedule: d, time: entry.to };
    }
  }
  return null;
}

// 回数カウント (sessionCount) 用の休講判定
export function isSlotCancelledByDaySchedule(slot, dateStr, daySchedules) {
  return resolveSlotDaySchedule(slot, dateStr, daySchedules)?.cancelled === true;
}

// ── 同日の二重登録の検出 ────────────────────────────────────────────
// resolveSlotDaySchedule は「同じ日 × 同じ学年 × 同じ時間帯」に複数件が
// 当たると登録順の先勝ちなので、後から登録した方はその時間帯で黙って
// 効かない。登録時に止める / 一覧で ⚠ を出すための純関数。

// その特別時程が実際に効く時間帯 (timeMap.from ∪ cancelTimes)
export function dayScheduleTimeKeys(d) {
  const set = new Set();
  for (const m of d?.timeMap || []) if (m && m.from) set.add(m.from);
  for (const t of d?.cancelTimes || []) if (t) set.add(t);
  return [...set];
}

// 対象学年の交わり。空 (未指定) は resolveSlotDaySchedule と同じく「どの
// 学年にも効かない」なので、誰とも交わらない (「全学年」と読むと、効かない
// 登録が本物の登録を止めたり ⚠ を出したりする)
function sharedGrades(a, b) {
  const ga = a || [];
  const gb = b || [];
  if (ga.length === 0 || gb.length === 0) return [];
  return ga.filter((g) => gb.includes(g));
}

/**
 * 同じ日で対象学年が交わる他の特別時程を列挙する。
 * @param {{date: string, targetGrades?: string[], timeMap?: object[], cancelTimes?: string[]}} candidate
 * @param {object[]} daySchedules
 * @param {{excludeId?: number | null}} [opts] 編集中の自分自身を除く
 * @returns {{schedule: object, sharedGrades: string[], sharedTimes: string[]}[]}
 *   sharedTimes が空でない相手とは (学年, 時間帯) が衝突する = どちらか
 *   (登録順で後の方) がその時間帯で適用されない。空なら時間帯は別なので
 *   共存できる (ただし 1 件にまとめた方が読みやすい)
 */
export function findSameDayDaySchedules(candidate, daySchedules, opts = {}) {
  if (!candidate || !candidate.date) return [];
  const excludeId = opts.excludeId ?? null;
  const myTimes = new Set(dayScheduleTimeKeys(candidate));
  const out = [];
  for (const d of getDaySchedulesForDate(daySchedules, candidate.date)) {
    if (excludeId != null && d.id === excludeId) continue;
    const grades = sharedGrades(candidate.targetGrades, d.targetGrades);
    if (grades.length === 0) continue;
    const times = dayScheduleTimeKeys(d).filter((t) => myTimes.has(t));
    out.push({ schedule: d, sharedGrades: grades, sharedTimes: times });
  }
  return out;
}

/**
 * 一覧の ⚠ 用: 同じ日に先に登録されたものへ (学年, 時間帯) を取られていて、
 * その分が適用されない特別時程。
 * @param {object[]} daySchedules 登録順 (= 配列順) が先勝ちの順
 * @returns {{id: number, byId: number, grades: string[], times: string[]}[]}
 *   1 件につき最初に見つかった相手 1 つ
 */
export function findShadowedDaySchedules(daySchedules) {
  const list = Array.isArray(daySchedules) ? daySchedules.filter(Boolean) : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const earlier = list.slice(0, i);
    const hits = findSameDayDaySchedules(d, earlier).filter((h) => h.sharedTimes.length > 0);
    if (hits.length === 0) continue;
    const h = hits[0];
    out.push({ id: d.id, byId: h.schedule.id, grades: h.sharedGrades, times: h.sharedTimes });
  }
  return out;
}

// ── プリセット生成 (附属の 2 パターン) ─────────────────────────────
// 「50 分授業 (17:00 開始)」の読み替え先。テスト (21:00-21:30) は
// 5 コマ目以降として据え置きになる。
export const COMPRESS_TARGET_TIMES = [
  "17:00-17:50",
  "18:00-18:50",
  "19:00-19:50",
  "20:00-20:50",
];

// 対象学年のコマからその曜日の時間帯一覧 (distinct, 開始時刻順) を作る。
// 呼び出し側で当日有効なコマ (filterSlotsForDate + 曜日一致) に絞って渡す。
export function collectTargetTimes(slots, targetGrades) {
  const set = new Set();
  for (const s of slots || []) {
    if (!(targetGrades || []).includes(s.grade)) continue;
    const t = (s.time || "").trim();
    if (t) set.add(t);
  }
  return [...set].sort(
    (a, b) => timeStartToMin(a) - timeStartToMin(b) || a.localeCompare(b)
  );
}

// プリセット①: 先頭から最大 4 コマを 50 分授業へ圧縮する timeMap。
// 読み替え先と同じ時刻はエントリを作らない (据え置き)。
export function buildCompressTimeMap(times) {
  const out = [];
  const n = Math.min(times.length, COMPRESS_TARGET_TIMES.length);
  for (let i = 0; i < n; i++) {
    if (times[i] !== COMPRESS_TARGET_TIMES[i]) {
      out.push({ from: times[i], to: COMPRESS_TARGET_TIMES[i] });
    }
  }
  return out;
}

// プリセット②: 最初の時間帯 (1 限) を休講にする cancelTimes。
export function buildCutFirstCancelTimes(times) {
  return times.length > 0 ? [times[0]] : [];
}

// ── 衝突プレビュー ──────────────────────────────────────────────────
// 読み替え後に「新たに」生じる講師・教室の重なりを列挙する。
// 元から存在する重なり (並列コマや意図的な合同) は報告しない。

// "17:00-17:50" → {start, end} (分)。end の読めない "17:00" は幅 0 扱い。
function parseTimeRange(time) {
  const m = String(time || "").match(/^(\d{1,2}):(\d{2})\s*[-〜]\s*(\d{1,2}):(\d{2})/);
  if (m) {
    return {
      start: Number(m[1]) * 60 + Number(m[2]),
      end: Number(m[3]) * 60 + Number(m[4]),
    };
  }
  const s = String(time || "").match(/^(\d{1,2}):(\d{2})/);
  if (s) {
    const v = Number(s[1]) * 60 + Number(s[2]);
    return { start: v, end: v };
  }
  return null;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

// 2 コマ間の重なり要因を列挙 ("teacher:石原" / "room:402")
function overlapReasons(a, b) {
  const reasons = [];
  const ta = splitTeacherField(a.teacher);
  const tb = new Set(splitTeacherField(b.teacher));
  for (const name of ta) {
    if (tb.has(name)) reasons.push({ kind: "teacher", value: name });
  }
  const ra = (a.room || "").trim();
  const rb = (b.room || "").trim();
  if (ra && ra === rb) reasons.push({ kind: "room", value: ra });
  return reasons;
}

// slots: その日に実施されるコマ (呼び出し側で時間割・曜日・休講を解決済み)。
// resolve: (slot) => resolveSlotDaySchedule 相当の結果。
// 戻り値: [{kind, value, a, b, aTime, bTime}] — a が読み替え対象コマ。
export function findNewConflicts(slots, resolve) {
  const items = [];
  for (const s of slots || []) {
    const r = resolve(s);
    if (r?.cancelled) continue; // 休講したコマは衝突しない
    items.push({
      slot: s,
      before: parseTimeRange(s.time),
      after: parseTimeRange(r?.time || s.time),
      remapped: !!r?.time,
    });
  }
  const out = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i];
      const B = items[j];
      if (!A.remapped && !B.remapped) continue; // 読み替えと無関係
      if (!A.after || !B.after) continue;
      if (!rangesOverlap(A.after, B.after)) continue;
      // 元の時程でも重なっていた組は既存の状態 (並列・合同等) なので除外
      if (A.before && B.before && rangesOverlap(A.before, B.before)) continue;
      for (const reason of overlapReasons(A.slot, B.slot)) {
        // a 側を読み替えられたコマに揃える (表示用)
        const [a, b] = A.remapped ? [A, B] : [B, A];
        out.push({
          kind: reason.kind,
          value: reason.value,
          a: a.slot,
          b: b.slot,
          aTime: a.remapped ? `${a.slot.time}→${fmtRange(a.after)}` : a.slot.time,
          bTime: b.remapped ? `${b.slot.time}→${fmtRange(b.after)}` : b.slot.time,
        });
      }
    }
  }
  return out;
}

function fmtRange(r) {
  const f = (min) =>
    `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  return `${f(r.start)}-${f(r.end)}`;
}
