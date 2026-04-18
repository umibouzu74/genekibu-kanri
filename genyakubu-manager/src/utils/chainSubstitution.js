// ─── 玉突き代行 提案ロジック ──────────────────────────────────────
import { dateToDay, timeToMin } from "../data";
import { getSlotTeachers, getSlotWeekType, isBiweekly } from "./biweekly";
import { makeHolidayHelpers } from "../components/views/dashboardHelpers";
import { filterSlotsForDate } from "./timetable";
import { pickSubjectId, getTeacherSubjectIds } from "./subjectMatch";

// ─── Pure sub-functions (exported for unit testing) ─────────────────

function parseTimeRange(timeStr) {
  const [start, end] = timeStr.split("-");
  return { start: timeToMin(start), end: timeToMin(end) };
}

/** 半開区間 [start, end) で時間重複を判定する。 */
export function timeOverlaps(t1, t2) {
  const a = parseTimeRange(t1);
  const b = parseTimeRange(t2);
  return a.start < b.end && b.start < a.end;
}

/**
 * 代行候補講師のスコアを算定する。
 *   完全一致 +10 / 同カテゴリ +5 / isFreeAllDay +3 / 正社員 +2
 *
 * @param {{isFreeAllDay:boolean, isPartTime:boolean, subjectIds:number[]}} teacher
 * @param {number|null} slotSubjectId - pickSubjectId の結果
 * @param {Array<{id:number, categoryId?:number}>} subjects
 * @returns {number}
 */
export function scoreSubstituteCandidate(teacher, slotSubjectId, subjects) {
  let score = 0;
  if (slotSubjectId && teacher.subjectIds.includes(slotSubjectId)) {
    score += 10;
  } else if (slotSubjectId) {
    const slotSubject = subjects.find((s) => s.id === slotSubjectId);
    if (slotSubject) {
      const sameCategory = teacher.subjectIds.some((sid) => {
        const ts = subjects.find((s) => s.id === sid);
        return ts && ts.categoryId === slotSubject.categoryId;
      });
      if (sameCategory) score += 5;
    }
  }
  if (teacher.isFreeAllDay) score += 3;
  if (!teacher.isPartTime) score += 2;
  return score;
}

/**
 * 指定日に指定講師が担当すべき個別スロットを分類する。
 *   - 隔週 B 週のメイン教師 → cancelled (理由: 隔週(B週))
 *   - 隔週 A 週のパートナー → cancelled (理由: 隔週(A週))
 *   - slotCancelled が true → cancelled (理由: 中学部/高校部休講)
 *   - それ以外 → active
 *
 * @param {object} slot
 * @param {string} name - teacher name
 * @param {string} date - YYYY-MM-DD
 * @param {Array} biweeklyAnchors
 * @param {boolean} cancelledByHoliday - makeHolidayHelpers.isOffForGrade の結果
 * @returns {{status:"active"|"cancelled", reason:string|null}}
 */
export function classifySlotForTeacher(
  slot,
  name,
  date,
  biweeklyAnchors,
  cancelledByHoliday
) {
  if (isBiweekly(slot.note)) {
    const wt = getSlotWeekType(date, slot, biweeklyAnchors);
    const mainTeachers = getSlotTeachers(slot);
    const m = slot.note.match(/隔週\(([^)]+)\)/);
    const partner = m ? m[1] : null;
    if (wt === "B" && mainTeachers.includes(name)) {
      return { status: "cancelled", reason: "隔週(B週)" };
    }
    if (wt === "A" && name === partner) {
      return { status: "cancelled", reason: "隔週(A週)" };
    }
  }
  if (cancelledByHoliday) {
    const dept = slot.grade.includes("高") ? "高校部" : "中学部";
    return { status: "cancelled", reason: `${dept}休講` };
  }
  return { status: "active", reason: null };
}

/**
 * 講師が担当する教科 ID を、以下の優先順で解決する:
 *   1. teacherSubjects[name] (明示オーバーライド)
 *   2. partTimeStaff.subjectIds (バイトの場合)
 *   3. slots からの推定 (正社員)
 *
 * @param {string} name
 * @param {{
 *   teacherSubjects: Record<string, number[]>,
 *   partTimeStaff: Array<{name:string, subjectIds:number[]}>,
 *   staffNameSet: Set<string>,
 *   slots: Array,
 *   subjects: Array,
 * }} ctx
 * @returns {number[]}
 */
export function resolveTeacherSubjectIds(name, ctx) {
  const { teacherSubjects, partTimeStaff, staffNameSet, slots, subjects } = ctx;
  if (teacherSubjects[name] && teacherSubjects[name].length > 0) {
    return teacherSubjects[name];
  }
  if (staffNameSet.has(name)) {
    const staff = partTimeStaff.find((s) => s.name === name);
    return staff ? staff.subjectIds : [];
  }
  return getTeacherSubjectIds(name, slots, subjects);
}

/** 与えられた日の全 Slot について、休講相当を isOffForGrade で一括判定する。 */
function buildSlotCancellationMap(daySlots, date, holidayHelpers) {
  const map = new Map();
  for (const slot of daySlots) {
    map.set(slot.id, holidayHelpers.isOffForGrade(date, slot.grade, slot.subj));
  }
  return map;
}

/**
 * その日に出現する全講師 (main + biweekly partner) を収集し、
 * teacher -> assigned Slot[] の Map を返す。
 */
function collectTeacherSlots(daySlots) {
  const teacherSlots = new Map();
  for (const slot of daySlots) {
    for (const t of getSlotTeachers(slot)) {
      if (!teacherSlots.has(t)) teacherSlots.set(t, []);
      teacherSlots.get(t).push(slot);
    }
    if (isBiweekly(slot.note)) {
      const m = slot.note.match(/隔週\(([^)]+)\)/);
      if (m) {
        const partner = m[1];
        if (!teacherSlots.has(partner)) teacherSlots.set(partner, []);
        teacherSlots.get(partner).push(slot);
      }
    }
  }
  return teacherSlots;
}

/** 指定日付の既存 sub レコードから講師別 busyTime を構築。 */
function buildSubstituteAssignments(subsForDate, allSlots) {
  const m = new Map();
  for (const sub of subsForDate) {
    if (!sub.substitute) continue;
    const slot = allSlots.find((s) => s.id === sub.slotId);
    if (!slot) continue;
    if (!m.has(sub.substitute)) m.set(sub.substitute, []);
    m.get(sub.substitute).push(slot.time);
  }
  return m;
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * 指定日に空いている講師を検出する。
 *
 * @param {string} date - "YYYY-MM-DD"
 * @param {import("../types").Slot[]} allSlots
 * @param {import("../types").Holiday[]} holidays
 * @param {Array} examPeriods
 * @param {import("../types").Substitute[]} subs - 既存の代行レコード
 * @param {import("../types").PartTimeStaffObject[]} partTimeStaff
 * @param {import("../types").Subject[]} subjects
 * @param {import("../types").Timetable[]} timetables
 * @param {Array} biweeklyAnchors - グローバル隔週基準
 */
export function computeAvailableTeachers(
  date,
  allSlots,
  holidays,
  examPeriods,
  subs,
  partTimeStaff,
  subjects,
  timetables,
  biweeklyAnchors,
  teacherSubjects = {}
) {
  const day = dateToDay(date);
  if (!day) return [];

  const staffNameSet = new Set(partTimeStaff.map((s) => s.name));
  const daySlots = filterSlotsForDate(allSlots, date, timetables).filter(
    (s) => s.day === day
  );
  const holidayHelpers = makeHolidayHelpers(holidays, examPeriods);
  const slotCancelled = buildSlotCancellationMap(daySlots, date, holidayHelpers);

  const subsForDate = subs.filter((s) => s.date === date);
  const substituteAssignments = buildSubstituteAssignments(subsForDate, allSlots);

  const teacherSlots = collectTeacherSlots(daySlots);
  const result = [];

  for (const [name, slots] of teacherSlots) {
    const activeSlots = [];
    const cancelledSlots = [];
    const reasons = new Set();

    for (const slot of slots) {
      const classification = classifySlotForTeacher(
        slot,
        name,
        date,
        biweeklyAnchors,
        slotCancelled.get(slot.id)
      );
      if (classification.status === "cancelled") {
        cancelledSlots.push(slot);
        if (classification.reason) reasons.add(classification.reason);
      } else {
        activeSlots.push(slot);
      }
    }

    if (cancelledSlots.length === 0) continue;

    const busyTimes = substituteAssignments.get(name) || [];
    const isFreeAllDay = activeSlots.length === 0 && busyTimes.length === 0;

    const freeTimeSlots = cancelledSlots
      .map((s) => s.time)
      .filter((time) => !busyTimes.some((bt) => timeOverlaps(time, bt)));
    const uniqueFreeTimes = [...new Set(freeTimeSlots)];

    if (uniqueFreeTimes.length === 0 && !isFreeAllDay) continue;

    const subjectIds = resolveTeacherSubjectIds(name, {
      teacherSubjects,
      partTimeStaff,
      staffNameSet,
      slots: allSlots,
      subjects,
    });

    result.push({
      name,
      isFreeAllDay,
      freeTimeSlots: uniqueFreeTimes,
      cancelledSlots,
      reason: [...reasons].join("・"),
      subjectIds,
      isPartTime: staffNameSet.has(name),
    });
  }

  return result;
}

/** 1 ループ分: remaining を時間順にソートし、候補があれば assign する。 */
function assignOnePass(
  remaining,
  available,
  slotMap,
  subjects,
  staffNameSet,
  partTimeStaff,
  chainStep,
  result
) {
  remaining.sort((a, b) => {
    const sa = slotMap.get(a.slotId);
    const sb = slotMap.get(b.slotId);
    if (!sa || !sb) return 0;
    return timeToMin(sa.time.split("-")[0]) - timeToMin(sb.time.split("-")[0]);
  });

  const toRemove = [];
  const newlyFreed = [];
  let madeProgress = false;

  for (let i = 0; i < remaining.length; i++) {
    const sub = remaining[i];
    const slot = slotMap.get(sub.slotId);
    if (!slot) continue;

    const slotSubjectId = pickSubjectId(slot.subj, subjects);
    const candidates = [];
    for (const teacher of available) {
      if (teacher.name === sub.originalTeacher) continue;
      const hasTimeAvailable =
        teacher.isFreeAllDay ||
        teacher.freeTimeSlots.some((ft) => timeOverlaps(ft, slot.time));
      const notBusy = !teacher.busyTimes.some((bt) =>
        timeOverlaps(bt, slot.time)
      );
      if (!hasTimeAvailable || !notBusy) continue;
      candidates.push({
        teacher,
        score: scoreSubstituteCandidate(teacher, slotSubjectId, subjects),
      });
    }

    if (candidates.length === 0) continue;

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    result.push({
      slotId: sub.slotId,
      originalTeacher: sub.originalTeacher,
      suggestedSubstitute: best.teacher.name,
      score: best.score,
      isChain: chainStep > 1,
      chainStep,
    });
    best.teacher.busyTimes.push(slot.time);

    // 玉突き: バイト講師のコマが代行されたら次ラウンドの候補に
    if (staffNameSet.has(sub.originalTeacher)) {
      const existing = available.find((a) => a.name === sub.originalTeacher);
      if (existing) {
        existing.freeTimeSlots.push(slot.time);
      } else {
        const staffObj = partTimeStaff.find(
          (s) => s.name === sub.originalTeacher
        );
        newlyFreed.push({
          name: sub.originalTeacher,
          isFreeAllDay: false,
          freeTimeSlots: [slot.time],
          cancelledSlots: [slot],
          reason: "玉突き（代行により空き）",
          subjectIds: staffObj ? staffObj.subjectIds : [],
          isPartTime: true,
          busyTimes: [],
        });
      }
    }

    toRemove.push(i);
    madeProgress = true;
  }

  for (let i = toRemove.length - 1; i >= 0; i--) {
    remaining.splice(toRemove[i], 1);
  }
  for (const freed of newlyFreed) available.push(freed);
  return madeProgress;
}

/**
 * 代行が必要なコマと空き講師から、最適な割り当てを提案する。
 * 玉突き (バイトのコマが代行されたら、そのバイトが別のコマに入れる) も考慮。
 *
 * @param {Array<{slotId:number, originalTeacher:string, date:string}>} uncoveredSubs
 * @param {Array} availableTeachers - computeAvailableTeachers の返り値
 * @param {import("../types").Slot[]} slots
 * @param {import("../types").Subject[]} subjects
 * @param {import("../types").SubjectCategory[]} subjectCategories
 * @param {import("../types").PartTimeStaffObject[]} partTimeStaff
 */
export function suggestChainSubstitutions(
  uncoveredSubs,
  availableTeachers,
  slots,
  subjects,
  // subjectCategories is accepted for API compatibility; scoring uses subjects[].categoryId directly.
  _subjectCategories,
  partTimeStaff
) {
  const slotMap = new Map(slots.map((s) => [s.id, s]));
  const staffNameSet = new Set(partTimeStaff.map((s) => s.name));
  const remaining = [...uncoveredSubs];
  const available = availableTeachers.map((t) => ({ ...t, busyTimes: [] }));
  const result = [];
  let chainStep = 1;
  let madeProgress = true;

  while (madeProgress && remaining.length > 0) {
    madeProgress = assignOnePass(
      remaining,
      available,
      slotMap,
      subjects,
      staffNameSet,
      partTimeStaff,
      chainStep,
      result
    );
    if (madeProgress) chainStep++;
  }

  return result;
}

/**
 * 代行者の変更が妥当かどうかを検証する。
 * @returns {{ timeConflict: boolean, subjectMismatch: boolean }}
 */
export function validateSubstituteChange(
  teacherName,
  slotId,
  slots,
  existingAssignments,
  subjects,
  partTimeStaff
) {
  const slot = slots.find((s) => s.id === slotId);
  if (!slot) return { timeConflict: false, subjectMismatch: false };

  const timeConflict = existingAssignments.some((a) => {
    if (a.suggestedSubstitute !== teacherName || a.slotId === slotId) return false;
    const otherSlot = slots.find((s) => s.id === a.slotId);
    if (!otherSlot) return false;
    return timeOverlaps(slot.time, otherSlot.time);
  });

  const slotSubjectId = pickSubjectId(slot.subj, subjects);
  let subjectMismatch = false;
  if (slotSubjectId) {
    const staffNameSet = new Set(partTimeStaff.map((s) => s.name));
    if (staffNameSet.has(teacherName)) {
      const staff = partTimeStaff.find((s) => s.name === teacherName);
      subjectMismatch = staff ? !staff.subjectIds.includes(slotSubjectId) : true;
    } else {
      const teacherSubjects = getTeacherSubjectIds(teacherName, slots, subjects);
      subjectMismatch = !teacherSubjects.includes(slotSubjectId);
    }
  }

  return { timeConflict, subjectMismatch };
}
