// ─── コマの学年を変えたときの引き継ぎ (2026-11-28) ─────────────────
// 土曜の Speaking/Listening (本澤) を学年「高3」から共通学年「高1-3」に
// 変えたように、コマの学年を付け替えると、学年をキーにして持っている設定が
// そのコマから黙って外れる:
//   - コース別終講日 (displayCutoff.cohorts の id「H|高3|Speaking/Listening」)
//     → 12/19 の終講日が効かなくなり、学年グループの終了日まで出続ける
//   - 予定表チェックの講座の対応 (手で直したもの。「高3|Speaking/Listening」)
//     → 前の期の同じ名前のコマとだけ比べて、毎週「授業なし」と食い違う
// コマの編集で学年を変えて保存するときに、新しい学年へ引き継ぐ
// (useSlotsCrud.save が呼ぶ。引き継いだことは通知に出す)。
//
// 第N回はコマの id で数えるので学年を変えても数え直しにはならないが、学年が
// 変わると学年グループ (回数の起点)・休講・テスト期間・コース (束ね) の当たり方が
// 変わり、回数がずれることがある。保存の前に前後の回数を比べて知らせる
// (sessionNumberChanges。直すかどうかは人が決める = 自動では回数補正を入れない)。
//
// 引き継ぐのは**学年だけを変えた**とき (時間割も同じ)。科目名・曜日まで
// 変えた編集は別のコースになったとみなし、触らない。

import { buildSlotCohortIndex, cohortIdMatches, deriveCohortsFromSlots, findCohortCutoff } from "./cohorts";
import { migrateCourseMapping, subjectKey } from "./yoteihyo/courseMapping";
import { buildClassSetIndex, buildClassSetOwnerIndex } from "./classSets";
import { buildCancelIndex } from "./slotCancel";
import { buildSlotById, computeSessionNumber } from "./sessionCount";
import { makeEventHelpers, shiftDate } from "../components/views/dashboardHelpers";
import { dateToDay } from "./dateHelpers";

const ttOf = (s) => s?.timetableId ?? 1;

/** 学年だけを変えた編集か (時間割・曜日・科目名は同じ) */
export function isGradeOnlyChange(before, after) {
  if (!before || !after) return false;
  const g0 = String(before.grade || "").trim();
  const g1 = String(after.grade || "").trim();
  if (!g0 || !g1 || g0 === g1) return false;
  return ttOf(before) === ttOf(after) && before.day === after.day && before.subj === after.subj;
}

function replaceSlot(slots, after) {
  return (slots || []).map((s) => (s.id === after.id ? after : s));
}

/**
 * コース別終講日の引き継ぎ案。変更前のコマに効いていた終講日を、変更後の
 * コマのコースへ写す。前のコースにほかのコマが残らなければ付け替え (rename)、
 * 残れば写す (copy)。変更後のコースに終講日が既にあれば何もしない。
 * @param {{before: object, after: object, slots: object[], cohorts?: object[]}} args
 *   cohorts は読み込み後に時間割を補ったもの (App の displayCutoff.cohorts)
 * @returns {null | {mode: "rename"|"copy", from: object, to: object} | {mode: "none", from: object}}
 *   mode "none" = 前の終講日はあるが、変更後のコマがどのコースにも入らない (引き継げない)
 */
export function planCohortCarryOver({ before, after, slots, cohorts }) {
  if (!isGradeOnlyChange(before, after)) return null;
  const from = findCohortCutoff(before, cohorts);
  if (!from) return null;
  if (findCohortCutoff(after, cohorts)) return null;
  const nextSlots = replaceSlot(slots, after);
  const cohort = deriveCohortsFromSlots(nextSlots).find((c) => c.slotIds.includes(after.id));
  if (!cohort) return { mode: "none", from };
  if (cohort.id === from.id) return null;
  const others = nextSlots.filter(
    (s) =>
      s.id !== after.id &&
      cohortIdMatches(from.id, s) &&
      (from.timetableId == null || ttOf(s) === from.timetableId)
  );
  return { mode: others.length > 0 ? "copy" : "rename", from, to: { ...from, id: cohort.id } };
}

/**
 * 引き継ぎ案を保存値 (読み込みのまま = 時間割を補う前) に当てる。保存値の
 * 終講日は時間割の付いていない旧データのこともあるので、id が同じで時間割が
 * 同じか未設定のものを「前の終講日」とみなす。
 * @param {object | null | undefined} displayCutoff 保存値
 * @param {{mode: string, from: object, to: object}} plan
 */
export function applyCohortCarryOver(displayCutoff, plan) {
  if (!plan || (plan.mode !== "rename" && plan.mode !== "copy")) return displayCutoff;
  const cohorts = Array.isArray(displayCutoff?.cohorts) ? displayCutoff.cohorts : [];
  const sameScope = (c) => c.timetableId == null || plan.from.timetableId == null || c.timetableId === plan.from.timetableId;
  // 既に引き継ぎ済み (同じ id・同じ時間割) なら何もしない
  if (cohorts.some((c) => c && c.id === plan.to.id && (c.timetableId ?? null) === (plan.to.timetableId ?? null))) {
    return displayCutoff;
  }
  let next;
  const idx =
    plan.mode === "rename"
      ? (() => {
          const exact = cohorts.findIndex(
            (c) => c && c.id === plan.from.id && (c.timetableId ?? null) === (plan.from.timetableId ?? null)
          );
          return exact >= 0 ? exact : cohorts.findIndex((c) => c && c.id === plan.from.id && sameScope(c));
        })()
      : -1;
  if (idx >= 0) {
    next = cohorts.map((c, i) => (i === idx ? { ...plan.to } : c));
  } else {
    next = [...cohorts, { ...plan.to }];
  }
  return { ...(displayCutoff || {}), cohorts: next };
}

/**
 * 予定表チェックの講座の対応 (手で直したもの) の引き継ぎ。「旧学年|科目名」を
 * 選んでいる講座に「新学年|科目名」を入れる。旧学年のまま残るコマ (前の期の
 * 同じ名前のコマ) があれば両方を残し、無ければ置き換える。
 * @returns {{oldKey: string, newKey: string, keepOld: boolean, courses: string[]} | null}
 */
export function planMappingCarryOver({ before, after, slots, mapping }) {
  if (!isGradeOnlyChange(before, after)) return null;
  const oldKey = subjectKey(before.grade, before.subj);
  const newKey = subjectKey(after.grade, after.subj);
  const courses = migrateCourseMapping(mapping)
    .filter((e) => !e.skip && (e.subjects || []).includes(oldKey) && !(e.subjects || []).includes(newKey))
    .map((e) => e.course);
  if (courses.length === 0) return null;
  const keepOld = replaceSlot(slots, after).some(
    (s) => s.id !== after.id && subjectKey(s.grade, s.subj) === oldKey
  );
  return { oldKey, newKey, keepOld, courses };
}

/** planMappingCarryOver の案を保存値に当てる (書き込む時点の値から) */
export function applyMappingCarryOver(mapping, plan) {
  const list = migrateCourseMapping(mapping);
  if (!plan) return list;
  return list.map((e) => {
    if (e.skip || !plan.courses.includes(e.course)) return e;
    const subjects = e.subjects || [];
    if (!subjects.includes(plan.oldKey) || subjects.includes(plan.newKey)) return e;
    const nextSubjects = plan.keepOld
      ? [...subjects, plan.newKey]
      : subjects.map((k) => (k === plan.oldKey ? plan.newKey : k));
    return { ...e, subjects: [...new Set(nextSubjects)].sort() };
  });
}

/**
 * 回数計算の ctx (useSessionCtx と同じ形)。コマの一覧を差し替えて前後を比べる。
 * @param {object[]} slots
 * @param {object} base { classSets, displayCutoff, timetables, holidays, examPeriods,
 *   specialEvents, biweeklyAnchors, sessionOverrides, daySchedules, adjustments }
 */
export function buildSessionCtxFor(slots, base = {}) {
  const helpers = makeEventHelpers(base.holidays || [], base.examPeriods || [], base.specialEvents || []);
  const classSets = base.classSets || [];
  return {
    classSets,
    allSlots: slots,
    _cohortIndex: buildSlotCohortIndex(slots),
    _slotById: buildSlotById(slots),
    _classSetIndex: buildClassSetIndex(classSets, slots),
    _classSetOwnerIndex: buildClassSetOwnerIndex(classSets, slots),
    _cancelIndex: buildCancelIndex(base.adjustments || []),
    displayCutoff: base.displayCutoff,
    timetables: base.timetables || [],
    isOffForGrade: helpers.isOffForGrade,
    biweeklyAnchors: base.biweeklyAnchors || [],
    holidays: base.holidays || [],
    examPeriods: base.examPeriods || [],
    sessionOverrides: base.sessionOverrides || [],
    daySchedules: base.daySchedules || [],
    adjustments: base.adjustments || [],
    orientationOnFirstDay: true,
  };
}

/**
 * 学年を変える前と後で、そのコマの第N回が変わる日 (今日の前後 weeks 週の、そのコマの曜日)。
 * @param {{before: object, after: object, slots: object[], base: object, afterDisplayCutoff?: object,
 *   today: string, weeks?: number}} args
 *   base は useSessionCtx に渡すのと同じ材料 (displayCutoff は読み込み後に補ったもの)
 * @returns {{date: string, before: number, after: number}[]}
 */
export function sessionNumberChanges({ before, after, slots, base, afterDisplayCutoff, today, weeks = 8 }) {
  if (!isGradeOnlyChange(before, after) || !today) return [];
  const ctxBefore = buildSessionCtxFor(slots || [], base);
  const nextSlots = replaceSlot(slots, after);
  // 変更後は終講日を引き継いだ後の設定で数える (引き継ぐ前の設定だと、終講日の
  // 後の日まで「回数が変わる」に出る)
  const ctxAfter = buildSessionCtxFor(nextSlots, {
    ...base,
    displayCutoff: afterDisplayCutoff === undefined ? base?.displayCutoff : afterDisplayCutoff,
  });
  const out = [];
  for (let i = -7 * weeks; i <= 7 * weeks; i++) {
    const d = shiftDate(today, i);
    if (dateToDay(d) !== before.day) continue;
    const nb = computeSessionNumber(before, d, ctxBefore);
    const na = computeSessionNumber(after, d, ctxAfter);
    if (nb !== na) out.push({ date: d, before: nb, after: na });
  }
  return out;
}
