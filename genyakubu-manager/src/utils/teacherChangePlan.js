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
import { shiftDate } from "../components/views/dashboardHelpers";

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
