// ─── 担当変更の登録 (コースマスター管理の「担当変更」タブ、A5 2026-10-31) ─────
// 「10/27 から 高1 桜井・第一の数学を 小見山 → 福江」のように、学期の途中から
// 担当が変わるコマに担当の切り替え (slot.teacherChanges。utils/biweekly) を
// まとめて付ける。純粋関数のみ (画面は TeacherChangeTab)。
//
//   - 対象は「開始日の時点で旧担当が担当しているコマ」(主担当・複数担当の 1 人・
//     隔週の B 週の相手のどれでも)。複数担当は旧担当の名前だけを新担当に置き換える
//   - 「◯日まで」を入れたら、その翌日に元の担当へ戻す行を足す (期間限定の変更)
//   - 第N回・隔週の週送りは担当を見ないので触らない
//   - 開始日以降に旧担当の代行・欠勤・振替があれば知らせる。代行者が新担当と
//     同じ代行は不要になる (仮に代行で入れていた分) ので、まとめて解除できる

import {
  biweeklyPartner,
  slotOnDate,
  splitTeacherField,
  withTeacherChanges,
} from "./biweekly";
import { firstSubjToken } from "./cohorts";
import { currentTimetableIdsForGrade, isTimetableActiveForDate } from "./timetable";
import { shiftDate } from "../components/views/dashboardHelpers";
import {
  buildDayOccupancy,
  collectDayRescheduleCandidates,
  findOccupancyConflicts,
  OUT_OF_TIMETABLE_REASON,
} from "./dayReschedule";
import { computeSessionNumber } from "./sessionCount";
import { timesOverlap } from "./teacherConflicts";

/** その日の担当 (主担当の名前の配列と隔週の相手) */
function teachersOn(slot, dateStr) {
  const d = slotOnDate(slot, dateStr);
  return { main: splitTeacherField(d.teacher), partner: biweeklyPartner(d.note), day: d };
}

/**
 * 担当変更の対象にできるコマ (開始日の時点で旧担当が担当しているコマ)。
 * @param {object[]} slots
 * @param {{oldTeacher: string, from: string, timetableId?: number|null,
 *          grade?: string, subj?: string, school?: string, day?: string}} filter
 *   subj は科目名に含む文字、school は科目名の頭の語 (学校名) と一致
 */
export function candidateSlotsForChange(slots, filter) {
  const old = (filter?.oldTeacher || "").trim();
  if (!old || !filter?.from) return [];
  const subj = (filter.subj || "").trim();
  const school = (filter.school || "").trim();
  return (slots || []).filter((s) => {
    if (!s) return false;
    if (filter.timetableId != null && (s.timetableId ?? 1) !== filter.timetableId) return false;
    if (filter.grade && s.grade !== filter.grade) return false;
    if (filter.day && s.day !== filter.day) return false;
    if (subj && !(s.subj || "").includes(subj)) return false;
    if (school && firstSubjToken(s.subj) !== school) return false;
    const { main, partner } = teachersOn(s, filter.from);
    return main.includes(old) || partner === old;
  });
}

/**
 * 担当変更の期間 (開始日〜◯日まで) に授業のある時間割のコマか (2026-11-19、P2-3)。
 * 期間の終わりは「◯日まで」、無ければ開始日の時点の時間割の終了日 (期間限定でない
 * 変更はその期のコマに付ける)。開始日が期と期の間なら、開始日の後で最初に始まる
 * 時間割を「その時点の時間割」とみなす (timetable.currentTimetableIdsForGrade)。
 * コマの時間割が期間のどこかで有効なら期間内 (isTimetableActiveForDate)。
 * 時間割が 1 つ以下なら全部期間内 (切り替わる相手が無い)。
 * @param {object} slot
 * @param {object[]} timetables
 * @param {string} from
 * @param {string|null} [until]
 * @returns {boolean}
 */
export function isSlotInChangePeriod(slot, timetables, from, until) {
  if (!slot || !from) return false;
  if (!Array.isArray(timetables) || timetables.length <= 1) return true;
  const tt = timetables.find((t) => t.id === (slot.timetableId ?? 1));
  if (!tt) return false;
  let end = until && until >= from ? until : null;
  if (!end) {
    const anchors = currentTimetableIdsForGrade(timetables, slot.grade, from)
      .map((id) => timetables.find((t) => t.id === id))
      .filter(Boolean);
    // 終了日の無い時間割があれば終わりなし
    end = anchors.length === 0 || anchors.some((t) => !t.endDate)
      ? null
      : anchors.reduce((max, t) => (t.endDate > max ? t.endDate : max), anchors[0].endDate);
  }
  // 期間のうち、コマの時間割が始まっている最初の日で有効かを見る
  const firstDay = tt.startDate && tt.startDate > from ? tt.startDate : from;
  if (end && firstDay > end) return false;
  return isTimetableActiveForDate(tt, firstDay, slot.grade);
}

/**
 * 担当変更の対象のコマを、期間に授業のあるコマ (既定でチェック) とそれ以外
 * (前の期・次の期のコマ。既定では外して畳む) に分ける。
 * @returns {{inPeriod: object[], outOfPeriod: object[]}}
 */
export function splitCandidatesByPeriod(candidates, timetables, from, until) {
  const inPeriod = [];
  const outOfPeriod = [];
  for (const s of candidates || []) {
    (isSlotInChangePeriod(s, timetables, from, until) ? inPeriod : outOfPeriod).push(s);
  }
  return { inPeriod, outOfPeriod };
}

/**
 * 選んだコマに担当の切り替えを付けた slots を返す (保存は呼び出し側が updater で)。
 * @param {object[]} slots
 * @param {number[]} slotIds
 * @param {{oldTeacher: string, newTeacher: string, from: string,
 *          until?: string|null, memo?: string}} change
 *   newTeacher は "·" / "・" 区切りで複数でもよい
 * @returns {{slots: object[], changedIds: number[]}}
 */
export function applyTeacherChange(slots, slotIds, change) {
  const old = (change?.oldTeacher || "").trim();
  const next = splitTeacherField(change?.newTeacher);
  const from = change?.from;
  if (!old || next.length === 0 || !from) return { slots, changedIds: [] };
  const until = change.until && change.until >= from ? change.until : null;
  const ids = new Set(slotIds);
  const changedIds = [];
  const out = (slots || []).map((s) => {
    if (!s || !ids.has(s.id)) return s;
    const { main, partner } = teachersOn(s, from);
    const isMain = main.includes(old);
    const isPartner = partner === old;
    if (!isMain && !isPartner) return s;
    const entry = { from };
    const replaced = isMain
      ? main.flatMap((t) => (t === old ? next : [t])).filter((t, i, a) => a.indexOf(t) === i)
      : main;
    entry.teacher = replaced.join("·");
    if (isPartner) entry.partner = next.join("·");
    else if (partner) entry.partner = partner;
    if (change.memo && change.memo.trim()) entry.memo = change.memo.trim();
    const list = [...(s.teacherChanges || []).filter((c) => c.from !== from), entry];
    if (until) {
      const back = shiftDate(until, 1);
      // 戻す日の時点で (この変更が無ければ) 担当していた人に戻す
      const before = teachersOn({ ...s, teacherChanges: list.filter((c) => c !== entry) }, back);
      const backEntry = { from: back, teacher: before.main.join("·") };
      if (before.partner) backEntry.partner = before.partner;
      // この変更の期間の中にあった切り替えは、この変更で置き換える
      const kept = list.filter((c) => c === entry || c.from <= from || c.from > back);
      list.length = 0;
      list.push(...kept.filter((c) => c.from !== back), backEntry);
    } else {
      // 期限なし = この日以降は新担当。後ろにあった切り替えは残す
    }
    changedIds.push(s.id);
    return withTeacherChanges(s, list);
  });
  return { slots: out, changedIds };
}

/**
 * 登録した切り替えを取り消す (from の切り替えと、until で足した戻す行)。
 * @returns {object[]} slots
 */
export function removeTeacherChange(slots, slotId, from) {
  return (slots || []).map((s) => {
    if (!s || s.id !== slotId || !Array.isArray(s.teacherChanges)) return s;
    return withTeacherChanges(
      s,
      s.teacherChanges.filter((c) => c.from !== from)
    );
  });
}

/** 「元に戻す」用: 指定したコマの teacherChanges を控えた値に戻す */
export function restoreTeacherChanges(slots, snapshot) {
  const byId = new Map(snapshot.map((x) => [x.id, x.teacherChanges]));
  return (slots || []).map((s) => {
    if (!s || !byId.has(s.id)) return s;
    return withTeacherChanges(s, byId.get(s.id) || []);
  });
}

/**
 * 開始日以降 (〜until) に、対象のコマで旧担当の代行・欠勤・振替があるか。
 * @returns {{redundantSubs: object[], otherSubs: object[], reschedules: object[]}}
 *   redundantSubs: 代行者が新担当と同じ代行 (担当変更で不要になる)
 */
export function findRecordsAfterChange({ subs, adjustments, slotIds, oldTeacher, newTeacher, from, until }) {
  const ids = new Set(slotIds);
  const inRange = (d) => d && d >= from && (!until || d <= until);
  const nextNames = splitTeacherField(newTeacher);
  const redundantSubs = [];
  const otherSubs = [];
  for (const sub of subs || []) {
    if (!sub || !ids.has(sub.slotId) || !inRange(sub.date)) continue;
    if (sub.originalTeacher !== oldTeacher) continue;
    if (sub.substitute && nextNames.includes(sub.substitute)) redundantSubs.push(sub);
    else otherSubs.push(sub);
  }
  const reschedules = (adjustments || []).filter(
    (a) =>
      a?.type === "reschedule" &&
      ids.has(a.slotId) &&
      inRange(a.date) &&
      (!a.targetTeacher || splitTeacherField(a.targetTeacher).includes(oldTeacher))
  );
  return { redundantSubs, otherSubs, reschedules };
}

/**
 * 担当の切り替えを持つコマの一覧 (登録済みの一覧と講師の月間のお知らせ用)。
 * 各切り替えに「前の担当」を添える。
 * @returns {{slot: object, change: object, prevTeacher: string, prevPartner: string|null}[]}
 */
export function listTeacherChanges(slots) {
  const out = [];
  for (const s of slots || []) {
    if (!Array.isArray(s?.teacherChanges)) continue;
    for (const c of s.teacherChanges) {
      if (!c?.from) continue;
      const prev = teachersOn(s, shiftDate(c.from, -1));
      out.push({
        slot: s,
        change: c,
        prevTeacher: prev.main.join("·"),
        prevPartner: prev.partner,
      });
    }
  }
  return out.sort((a, b) => (a.change.from < b.change.from ? -1 : a.change.from > b.change.from ? 1 : a.slot.id - b.slot.id));
}

/** 「10/27〜 福江（前：小見山）」 */
export function describeTeacherChange({ change, prevTeacher }) {
  const [, m, d] = change.from.split("-").map(Number);
  const to = change.partner ? `${change.teacher} / ${change.partner}` : change.teacher;
  return `${m}/${d}〜 ${to}${prevTeacher && prevTeacher !== change.teacher ? `（前：${prevTeacher}）` : ""}`;
}

// ─── 実際に変わる授業日と、新担当の重なり (2026-11-19、P2-4) ─────────────
// 「2 コマに担当変更を付ける」だけでは何日の授業が何回変わるのか分からず、
// 新担当がその時間に別の授業を持っていても何も出なかった。

/** 期限なしのときに並べる授業の回数 (コマごと)。以降は「以降毎週」 */
export const OPEN_ENDED_LESSON_LIMIT = 4;
const SCAN_DAY_LIMIT = 400;

/**
 * 担当変更で担当が変わる授業日。実施の判定は日まるごと振替と同じ
 * (dayReschedule.collectDayRescheduleCandidates = isSlotHeldOnDate + 表示期間)。
 * 実施されない日は理由つきで別に返す。コマの時間割の期間外の日 (前の期・次の期) は
 * 並べない (その期のコマではないので)。期限なしならコマごとに最初の数回だけ。
 * @param {{slots: object[], from: string, until?: string|null, ctx: object,
 *          limit?: number}} args slots は対象のコマ
 * @returns {{lessons: {date: string, slot: object, sessionNo: number}[],
 *            skipped: {date: string, slot: object, reason: string}[],
 *            openEnded: boolean}}
 */
export function listChangeLessonDates({ slots, from, until = null, ctx, limit = OPEN_ENDED_LESSON_LIMIT }) {
  const lessons = [];
  const skipped = [];
  if (!from || !Array.isArray(slots) || slots.length === 0) return { lessons, skipped, openEnded: !until };
  const end = until && until >= from ? until : null;
  for (const slot of slots) {
    let held = 0;
    let date = from;
    for (let i = 0; i < SCAN_DAY_LIMIT && (!end || date <= end); i++, date = shiftDate(date, 1)) {
      if (!end && held >= limit) break;
      const r = collectDayRescheduleCandidates({ slots: [slot], dateStr: date, ctx });
      if (r.candidates.length > 0) {
        held += 1;
        lessons.push({ date, slot, sessionNo: computeSessionNumber(slot, date, ctx) });
      } else if (r.skipped.length > 0 && r.skipped[0].reason !== OUT_OF_TIMETABLE_REASON) {
        skipped.push({ date, slot, reason: r.skipped[0].reason });
      }
    }
  }
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.slot.id - b.slot.id);
  return { lessons: lessons.sort(byDate), skipped: skipped.sort(byDate), openEnded: !end };
}

/**
 * 新担当がその授業の時間に塞がっているもの (警告。適用は止めない)。見るのは
 * 日まるごと振替と同じ塞がり (dayReschedule.buildDayOccupancy: 本体の通常授業
 * (代行・欠勤を入れた後)・振替で入るコマ・追加授業・他校舎の授業) と、講習
 * (講習時間割作成の仮確定・確定のコマ。builderLessons の KoshuLesson)。
 * 担当を変えるそのコマ自身は数えない。
 * @returns {{date: string, slot: object, label: string}[]}
 */
export function findNewTeacherConflicts({
  lessons,
  newTeacher,
  slots,
  adjustments = [],
  extraLessons = [],
  subs = [],
  offsiteLessons = [],
  koshuLessons = [],
  ctx,
}) {
  const names = splitTeacherField(newTeacher);
  if (names.length === 0) return [];
  const out = [];
  const occupancyByDate = new Map();
  for (const { date, slot } of lessons || []) {
    let occ = occupancyByDate.get(date);
    if (!occ) {
      occ = buildDayOccupancy({ slots, dateStr: date, adjustments, extraLessons, subs, offsiteLessons, ctx });
      occupancyByDate.set(date, occ);
    }
    const time = slot.time;
    const others = occ.filter((o) => !(o.kind === "normal" && o.slot?.id === slot.id));
    for (const c of findOccupancyConflicts(others, { time, teachers: names })) {
      if (c.kind === "teacher") out.push({ date, slot, label: c.label });
    }
    for (const k of koshuLessons || []) {
      if (!k || k.date !== date || !names.includes(k.teacher) || !k.time) continue;
      if (!timesOverlap(k.time, time)) continue;
      const what = [k.frameName || k.projectName, k.grade, k.cls, k.subj].filter(Boolean).join(" ");
      out.push({ date, slot, label: `${k.teacher} / ${k.time} ${what} (講習)` });
    }
  }
  return out;
}

