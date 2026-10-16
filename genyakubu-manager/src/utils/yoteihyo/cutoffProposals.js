// ─── 予定表から終講日 (コース別終講日) を提案する ──────────────────
// 予定表の講座ごとの最後の授業日を、その講座に対応するシステムのコマの
// コース (utils/cohorts の id。displayCutoff.cohorts に保存する単位) の
// 終講日の案にする。37 コースの終講日を手で打ち込まずに済むように。
//
// 決めごと:
//   - 比べられる講座 (courseMapping.mappingStatus が ok) だけを使う
//   - 1 つのコースに予定表の講座がいくつも当たるときは、最後の授業日の遅い方
//     (どの講座の授業も表示期間の中に残るように)。画面にそう出す
//   - 今の終講日と同じ日は案にしない
//   - コースの無いコマ (高1・2 の英数以外) は案にできない。表示期間設定の
//     学年グループの終了日に従う (CohortCutoffEditor と同じ)
//   - 最後の授業日が読み込んだ予定表の期間の終わり近く (END_MARGIN 日以内) なら、
//     その後の予定表で授業が続くかもしれないので注意を付ける (既定では選ばない)。
//     予定表が年度末 (3/31) まであるなら続きは無いので付けない
//   - 中学部のコース (M|学年|曜日) も同じ。中学部のコースは学年の平日ぜんぶで
//     1 コース (utils/cohorts) なので、中3 の本科 火木 (12/17) と 水金 (12/16) は
//     遅い方の 12/17 が案になる (水金のコマは 12/17 (木) に無いので同じこと)

import { deriveCohortsFromSlots } from "../cohorts";
import { findGroupForGrade } from "../timetable";
import { mappingStatus, subjectDays, subjectKey } from "./courseMapping";
import { daysBetween } from "./highSchoolSheet";

/** 予定表の期間の終わりからこの日数以内の最後の授業日には注意を付ける */
export const END_MARGIN = 14;

// その日を含む年度の終わり (3/31)
function fiscalYearEnd(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${m >= 4 ? y + 1 : y}-03-31`;
}

/** 予定表の講座の最後の授業日 (休講の灰色は数えない)。無ければ null */
export function lastHeldDate(course) {
  let last = null;
  for (const [date, s] of course?.sessions || []) {
    if (s?.status === "held" && (!last || date > last)) last = date;
  }
  return last;
}

/**
 * @param {{ merged: object, mapping: Map, slots: Array, displayCutoff?: object }} args
 * @returns {{
 *   proposals: Array<{ cohortId, label, grade, current: string|null, groupDate: string|null,
 *                      proposed: string, courses: Array<{key, last}>, mayContinue: boolean }>,
 *   unchanged: number,
 *   noCohort: Array<{ key, subjects: string[] }>,
 * }}
 */
export function proposeCohortCutoffs({ merged, mapping, slots, displayCutoff }) {
  const cohorts = deriveCohortsFromSlots(slots);
  const cohortBySlot = new Map();
  for (const c of cohorts) for (const id of c.slotIds || []) cohortBySlot.set(id, c);
  const saved = new Map((displayCutoff?.cohorts || []).filter((c) => c?.id).map((c) => [c.id, c]));
  const days = subjectDays(slots);
  const byCohort = new Map();
  const noCohort = [];
  for (const course of merged?.courses?.values() || []) {
    const m = mapping.get(course.key);
    if (mappingStatus(course, m, days).status !== "ok") continue;
    const last = lastHeldDate(course);
    if (!last) continue;
    const keys = new Set(m.subjects);
    const mapped = (slots || []).filter((s) => keys.has(subjectKey(s.grade, s.subj)));
    const ids = new Set(mapped.map((s) => cohortBySlot.get(s.id)?.id).filter(Boolean));
    if (!ids.size) {
      noCohort.push({ key: course.key, subjects: [...keys] });
      continue;
    }
    // 予定表の期間の終わり (同じ学年の組のシートのうち最後の日)
    const family = merged.families?.get(course.family);
    const coverageEnd = (family?.ranges || []).map((r) => r.end).sort().pop() || last;
    for (const id of ids) {
      if (!byCohort.has(id)) byCohort.set(id, { cohort: cohorts.find((c) => c.id === id), courses: [] });
      byCohort.get(id).courses.push({ key: course.key, last, coverageEnd });
    }
  }
  const proposals = [];
  let unchanged = 0;
  for (const [id, { cohort, courses }] of byCohort) {
    const latest = courses.reduce((a, b) => (b.last > a.last ? b : a));
    const proposed = latest.last;
    const current = saved.get(id)?.date || null;
    if (current === proposed) {
      unchanged++;
      continue;
    }
    proposals.push({
      cohortId: id,
      label: cohort.label,
      grade: cohort.grade,
      current,
      groupDate: findGroupForGrade(cohort.grade, displayCutoff?.groups)?.date || null,
      proposed,
      courses: courses.map(({ key, last }) => ({ key, last })).sort((a, b) => a.key.localeCompare(b.key)),
      mayContinue:
        daysBetween(proposed, latest.coverageEnd) <= END_MARGIN && latest.coverageEnd < fiscalYearEnd(proposed),
    });
  }
  // 並びはコースの一覧 (CohortCutoffEditor) と同じ学年 → 名前の順
  proposals.sort((a, b) => a.grade.localeCompare(b.grade) || a.label.localeCompare(b.label));
  return { proposals, unchanged, noCohort };
}

/**
 * 選んだ案を displayCutoff に書いた形を返す (保存は呼び出し側が updater で)。
 * @returns {object} displayCutoff
 */
export function applyCohortCutoffs(displayCutoff, chosen) {
  const base = displayCutoff || { groups: [], cohorts: [] };
  const ids = new Set(chosen.map((p) => p.cohortId));
  const rest = (Array.isArray(base.cohorts) ? base.cohorts : []).filter((c) => !ids.has(c?.id));
  return {
    ...base,
    cohorts: [...rest, ...chosen.map((p) => ({ id: p.cohortId, label: p.label, grade: p.grade, date: p.proposed }))],
  };
}

/**
 * 「元に戻す」: ids のコースの終講日を previous (書き換える前のエントリ) に戻す。
 * 前に無かったコースは消す。
 */
export function restoreCohortCutoffs(displayCutoff, ids, previous = []) {
  const base = displayCutoff || { groups: [], cohorts: [] };
  const set = new Set(ids);
  const rest = (Array.isArray(base.cohorts) ? base.cohorts : []).filter((c) => !set.has(c?.id));
  return { ...base, cohorts: [...rest, ...previous.filter((c) => c && set.has(c.id))] };
}
