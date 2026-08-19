// ─── 日まるごと振替 (ある日の授業を別の日へまとめて移す) ─────────
// 「12/7 (月) の授業を 12/4 (金) にまとめて振り替える」のように、日単位で
// 授業を移すための純粋関数群。作るのは既存の ScheduleAdjustment
// (type: "reschedule") の集まりなので、表示・印刷・一覧・解除はすべて
// 既存の振替の経路にそのまま乗る (新しいモデルを足さない)。
//
// 決めごと:
//   - 対象は「振替元日に実施されるコマ」だけ。休講・テスト期間・隔週の
//     B 週・時間割の有効期間外・表示期間外のコマは最初から外し、外した
//     理由を skipped に載せる (黙って減らさない)
//   - 時刻は変えない (「まるごと移す」操作なので)。1 コマだけ時刻を
//     ずらしたい場合は欠勤組み換え画面の振替から
//   - 第N回は振替元の日付で数えたまま (sessionCount は振替を見ない)。
//     授業の総回数は変わらないので、カウントの日付は付け替えない
//   - 振替先が振替元より前の日付でもよい (休みの日へ前倒しで寄せる運用)

import { dateToDay, timeStartToMin, timeToMin } from "./dateHelpers";
import { biweeklyActiveTeacher, splitTeacherField } from "./biweekly";
import { isSlotCancelledByDaySchedule } from "./daySchedules";
import { isSlotHeldOnDate } from "./sessionCount";
import { isSlotBeyondCutoff, isTimetableActiveForDate } from "./timetable";
import { buildAdjustmentIndex } from "./adjustmentDisplay";
import { nextNumericId } from "./schema";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// "19:00-20:20" → {start, end} (分)。終了時刻が読めないときは start と
// 同じにして「点」として扱う (重なり判定では同じ開始時刻だけが当たる)。
function timeRange(time) {
  const parts = String(time || "").split("-");
  const start = timeStartToMin(parts[0]);
  let end = start;
  if (parts[1]) {
    const e = timeToMin(parts[1].trim());
    if (Number.isFinite(e)) end = e;
  }
  return { start, end: end > start ? end : start };
}

function rangesOverlap(a, b) {
  if (a.end === a.start || b.end === b.start) return a.start === b.start;
  return a.start < b.end && b.start < a.end;
}

// 指定日にそのコマを実際に担当する講師名 (隔週の A/B 週を解決した後)。
function activeTeachers(slot, dateStr, ctx) {
  return splitTeacherField(
    biweeklyActiveTeacher(
      slot,
      dateStr,
      ctx?.biweeklyAnchors || [],
      ctx?.holidays,
      ctx?.examPeriods,
    ),
  );
}

// 対象日にそのコマが実施されない理由を 1 つだけ返す (表示用)。
// 判定の順序は「期間 → 休講 → その他」。isSlotHeldOnDate が false を返した
// ときの説明なので、ここで新しいルールを足さないこと。
function skipReason(slot, dateStr, ctx) {
  const tts = ctx?.timetables;
  if (Array.isArray(tts) && tts.length > 0) {
    const tt = tts.find((t) => t.id === (slot.timetableId ?? 1));
    if (!isTimetableActiveForDate(tt, dateStr, slot.grade)) {
      return "時間割の期間外";
    }
  }
  if (isSlotBeyondCutoff(dateStr, slot, ctx?.displayCutoff)) return "表示期間外";
  if (ctx?.isOffForGrade && ctx.isOffForGrade(dateStr, slot.grade, slot.subj)) {
    return "休講・テスト期間";
  }
  if (isSlotCancelledByDaySchedule(slot, dateStr, ctx?.daySchedules)) {
    return "特別時程で休講";
  }
  return "実施なし (隔週など)";
}

// 時刻 → id の順に並べる。timeOf / idOf で並べ替えキーの取り出し方だけ差し替える。
function sortByTime(list, timeOf, idOf) {
  return [...list].sort((a, b) => {
    const d = timeStartToMin(timeOf(a)) - timeStartToMin(timeOf(b));
    return d || idOf(a) - idOf(b);
  });
}

/**
 * 振替元日に実施されるコマ (振替の候補) を集める。
 * 実施されないコマは skipped に理由つきで載せる。
 *
 * @param {{slots: Array, dateStr: string, ctx: object}} args
 *   ctx は useSessionCtx が返す sessionCtx (timetables / displayCutoff /
 *   daySchedules / isOffForGrade / biweeklyAnchors …)。
 * @returns {{candidates: Array, skipped: {slot: object, reason: string}[]}}
 */
export function collectDayRescheduleCandidates({ slots, dateStr, ctx }) {
  const day = dateToDay(dateStr);
  if (!day) return { candidates: [], skipped: [] };
  const candidates = [];
  const skipped = [];
  for (const slot of slots || []) {
    if (!slot || slot.day !== day) continue;
    const held =
      isSlotHeldOnDate(slot, dateStr, ctx || {}) &&
      !isSlotBeyondCutoff(dateStr, slot, ctx?.displayCutoff);
    if (held) candidates.push(slot);
    else skipped.push({ slot, reason: skipReason(slot, dateStr, ctx || {}) });
  }
  return {
    candidates: sortByTime(candidates, (s) => s.time, (s) => s.id),
    skipped: sortByTime(skipped, (x) => x.slot.time, (x) => x.slot.id),
  };
}

/**
 * 指定日に「その時間その先生・その教室が塞がっている」ものを集める。
 * 当日の通常コマ (移動・特別時程の時刻読み替えを反映) と、他日からこの日へ
 * 振り替えられてくるコマの両方を見る。合同で吸収されたコマと、この日から
 * 他日へ出ていくコマは塞がっていない扱い。
 *
 * @returns {{slot: object, time: string, teachers: string[], room: string,
 *            incoming: boolean, adj: object|null}[]}
 *   incoming = 他日から振り替えられてくるコマ (adj はその振替調整)。
 */
export function buildDayOccupancy({ slots, dateStr, adjustments = [], ctx }) {
  const day = dateToDay(dateStr);
  if (!dateStr) return [];
  const index = buildAdjustmentIndex(adjustments, dateStr, {
    slots: (slots || []).filter((s) => s.day === day),
    daySchedules: ctx?.daySchedules || [],
  });
  const out = [];
  const seen = new Set();
  const push = (slot, time, incoming, adj = null) => {
    if (!slot || seen.has(slot.id)) return;
    seen.add(slot.id);
    out.push({
      slot,
      time,
      teachers: activeTeachers(slot, dateStr, ctx),
      room: (slot.room || "").trim(),
      incoming,
      adj,
    });
  };
  for (const slot of slots || []) {
    if (!slot || slot.day !== day) continue;
    if (!isSlotHeldOnDate(slot, dateStr, ctx || {})) continue;
    if (isSlotBeyondCutoff(dateStr, slot, ctx?.displayCutoff)) continue;
    if (index.combineAbsorbedBySlot.has(slot.id)) continue; // 合同に吸収済み
    if (index.rescheduleOutBySlot.has(slot.id)) continue; // 他日へ出ていく
    push(slot, index.moveBySlot.get(slot.id) || slot.time, false);
  }
  // 他日からこの日へ入ってくる振替コマ (曜日が違うので上のループには出ない)
  const byId = new Map((slots || []).map((s) => [s.id, s]));
  for (const adj of index.rescheduleInBySlot.values()) {
    const slot = byId.get(adj.slotId);
    if (!slot) continue;
    push(slot, adj.targetTime || slot.time, true, adj);
  }
  return sortByTime(out, (x) => x.time, (x) => x.slot.id);
}

/**
 * 日まるごと振替のプランを組む (保存はしない)。プレビューと適用の両方から
 * 同じものを使う。
 *
 * @param {object} args
 * @param {Array} args.slots 全スロット
 * @param {Array} [args.adjustments] 既存の時間割調整
 * @param {string} args.sourceDate 振替元日 "YYYY-MM-DD"
 * @param {string} args.targetDate 振替先日 "YYYY-MM-DD"
 * @param {Array<number>|null} [args.selectedSlotIds] 対象を絞る場合の slot id
 *   (null / 未指定 = 候補すべて)
 * @param {object} args.ctx sessionCtx
 * @returns {{
 *   sourceDay: string|null, targetDay: string|null,
 *   candidates: Array, skipped: Array,
 *   entries: {slot: object, teachers: string[], existing: object|null,
 *             conflicts: {kind: string, label: string}[]}[],
 *   errors: string[], notes: string[],
 * }}
 */
export function buildDayReschedulePlan({
  slots,
  adjustments = [],
  sourceDate,
  targetDate,
  selectedSlotIds = null,
  ctx,
}) {
  const errors = [];
  const notes = [];
  const sourceDay = dateToDay(sourceDate);
  const targetDay = dateToDay(targetDate);
  const { candidates, skipped } = collectDayRescheduleCandidates({
    slots,
    dateStr: sourceDate,
    ctx,
  });

  if (!ISO_DATE_RE.test(sourceDate || "")) errors.push("振替元日を選んでください");
  if (!ISO_DATE_RE.test(targetDate || "")) errors.push("振替先日を選んでください");
  if (sourceDate && targetDate && sourceDate === targetDate) {
    errors.push("振替元と振替先が同じ日です");
  }

  const idFilter =
    selectedSlotIds == null ? null : new Set(selectedSlotIds.map(Number));
  const selected = candidates.filter((s) => !idFilter || idFilter.has(s.id));

  const empty = {
    sourceDay,
    targetDay,
    candidates,
    skipped,
    entries: [],
    errors,
    notes,
  };
  if (errors.length > 0) return empty;
  if (candidates.length === 0) {
    errors.push("振替元日に実施されるコマがありません");
    return empty;
  }
  if (selected.length === 0) {
    errors.push("振替するコマを 1 つ以上選んでください");
    return empty;
  }

  // 振替先の埋まり具合。「同じ振替元日から同じコマが既に振り替えられて
  // いる」ぶんだけは除く (今から上書きする自分自身の登録なので)。
  // 振替先が同じ曜日の別の週 (12/7 月 → 12/14 月) のときは、振替先にその
  // コマの通常授業があるので二重になる。これは除かずに重なりとして出す。
  const movingIds = new Set(selected.map((s) => s.id));
  const occupancy = buildDayOccupancy({
    slots,
    dateStr: targetDate,
    adjustments,
    ctx,
  }).filter(
    (o) =>
      !(o.incoming && o.adj?.date === sourceDate && movingIds.has(o.slot.id)),
  );

  const existingBySlot = new Map();
  for (const adj of adjustments || []) {
    if (adj?.type === "reschedule" && adj.date === sourceDate) {
      existingBySlot.set(adj.slotId, adj);
    }
  }

  const entries = selected.map((slot) => {
    const teachers = activeTeachers(slot, sourceDate, ctx);
    const range = timeRange(slot.time);
    const room = (slot.room || "").trim();
    const conflicts = [];
    for (const o of occupancy) {
      if (!rangesOverlap(range, timeRange(o.time))) continue;
      const label = `${o.time} ${o.slot.grade}${
        o.slot.cls && o.slot.cls !== "-" ? o.slot.cls : ""
      } ${o.slot.subj}${o.incoming ? " (振替)" : ""}`;
      const dupTeachers = teachers.filter((t) => o.teachers.includes(t));
      for (const t of dupTeachers) {
        conflicts.push({ kind: "teacher", label: `${t} / ${label}` });
      }
      if (room && room !== "-" && room === o.room) {
        conflicts.push({ kind: "room", label: `${room} / ${label}` });
      }
    }
    return {
      slot,
      teachers,
      existing: existingBySlot.get(slot.id) || null,
      conflicts,
    };
  });

  // ── 注意書き (エラーではない。人が見て判断する材料) ──
  const replaced = entries.filter((e) => e.existing);
  if (replaced.length > 0) {
    notes.push(
      `${replaced.length} コマはすでに振替登録済みです (振替先を上書きします)`,
    );
  }
  const normalOnTarget = occupancy.filter((o) => !o.incoming);
  if (normalOnTarget.length > 0) {
    notes.push(
      `振替先には通常の授業が ${normalOnTarget.length} コマあります (重ならないか確認してください)`,
    );
  }
  const conflictCount = entries.filter((e) => e.conflicts.length > 0).length;
  if (conflictCount > 0) {
    notes.push(`講師・教室の重なりが ${conflictCount} コマで見つかりました`);
  }
  if (sourceDate && targetDate && targetDate < sourceDate) {
    notes.push("振替先は振替元より前の日付です (前倒しの振替)");
  }
  const beyond = entries.filter((e) =>
    isSlotBeyondCutoff(targetDate, e.slot, ctx?.displayCutoff),
  );
  if (beyond.length > 0) {
    notes.push(
      `${beyond.length} コマは振替先が表示期間の外です (表示期間設定を確認してください)`,
    );
  }
  if (skipped.length > 0) {
    notes.push(`振替元日に実施されないコマ ${skipped.length} 件は対象外です`);
  }

  return { sourceDay, targetDay, candidates, skipped, entries, errors, notes };
}

/**
 * プランを adjustments 配列へ適用した結果を返す (保存はしない)。
 * 同じコマに対する振替元日つきの既存 reschedule は置き換える。
 *
 * @param {{adjustments: Array, plan: object, targetDate: string,
 *          sourceDate: string, memo?: string}} args
 * @returns {{next: Array, added: number, replaced: number}}
 */
export function applyDayReschedule({
  adjustments = [],
  plan,
  sourceDate,
  targetDate,
  memo = "",
}) {
  const entries = plan?.entries || [];
  if (entries.length === 0) {
    return { next: adjustments, added: 0, replaced: 0 };
  }
  const replacedIds = new Set(
    entries.filter((e) => e.existing).map((e) => e.existing.id),
  );
  const kept = adjustments.filter((a) => !replacedIds.has(a.id));
  const ts = new Date().toISOString();
  let id = nextNumericId(kept);
  const added = entries.map((e) => {
    const adj = {
      id: id++,
      date: sourceDate,
      type: "reschedule",
      slotId: e.slot.id,
      targetDate,
      createdAt: ts,
    };
    if (memo) adj.memo = memo;
    return adj;
  });
  return {
    next: [...kept, ...added],
    added: added.length,
    replaced: replacedIds.size,
  };
}

/**
 * 振替元日 (必要なら振替先日も) で既存の振替調整を引く。まとめて解除する
 * ボタン用。
 * @returns {Array} 該当する adjustment の配列 (時刻順)
 */
export function findDayRescheduleAdjustments(
  adjustments = [],
  sourceDate,
  targetDate = null,
) {
  if (!sourceDate) return [];
  return (adjustments || []).filter(
    (a) =>
      a?.type === "reschedule" &&
      a.date === sourceDate &&
      (!targetDate || a.targetDate === targetDate),
  );
}
