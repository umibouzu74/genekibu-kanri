// ─── 玉突き代行 提案ロジック ──────────────────────────────────────
import { dateToDay, timeToMin } from "../data";
import { getSlotTeachers, getSlotWeekType, isBiweekly } from "./biweekly";
import { makeHolidayHelpers } from "../components/views/dashboardHelpers";
import { filterSlotsForDate } from "./timetable";
import { pickSubjectId, getTeacherSubjectIds } from "./subjectMatch";

// ─── 時間重複チェック ─────────────────────────────────────────────
function parseTimeRange(timeStr) {
  const [start, end] = timeStr.split("-");
  return { start: timeToMin(start), end: timeToMin(end) };
}

function timeOverlaps(t1, t2) {
  const a = parseTimeRange(t1);
  const b = parseTimeRange(t2);
  return a.start < b.end && b.start < a.end;
}

// ─── 空き講師の検出 ───────────────────────────────────────────────

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
 * @returns {Array<{
 *   name: string,
 *   isFreeAllDay: boolean,
 *   freeTimeSlots: string[],
 *   cancelledSlots: import("../types").Slot[],
 *   reason: string,
 *   subjectIds: number[],
 *   isPartTime: boolean
 * }>}
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
  biweeklyAnchors
) {
  const day = dateToDay(date);
  if (!day) return [];

  const staffNameSet = new Set(partTimeStaff.map((s) => s.name));

  // その日有効なスロットのみ (時間割フィルタ)
  const daySlots = filterSlotsForDate(allSlots, date, timetables).filter(
    (s) => s.day === day
  );

  const { isOffForGrade } = makeHolidayHelpers(holidays, examPeriods);

  // 各スロットが休講かどうかを判定
  const slotCancelled = new Map();
  for (const slot of daySlots) {
    slotCancelled.set(slot.id, isOffForGrade(date, slot.grade, slot.subj));
  }

  // 隔週スロットで、この日が担当でない場合もキャンセル扱い
  for (const slot of daySlots) {
    if (isBiweekly(slot.note) && !slotCancelled.get(slot.id)) {
      const wt = getSlotWeekType(date, slot, biweeklyAnchors);
      // B週ならメイン教師は休み (パートナーが担当)
      // ただし空き判定では、メイン教師がB週に空いていることを検出する
      // この情報は教師ごとの処理で使う
    }
  }

  // 既存の代行レコード (この日の確定分) で既に代行に入っている時間帯を取得
  const subsForDate = subs.filter((s) => s.date === date);
  const substituteAssignments = new Map(); // teacher -> [time strings]
  for (const sub of subsForDate) {
    if (!sub.substitute) continue;
    const slot = allSlots.find((s) => s.id === sub.slotId);
    if (!slot) continue;
    if (!substituteAssignments.has(sub.substitute)) {
      substituteAssignments.set(sub.substitute, []);
    }
    substituteAssignments.get(sub.substitute).push(slot.time);
  }

  // 全講師を収集 (スロットに出現する全講師)
  const teacherSlots = new Map(); // teacher -> Slot[]
  for (const slot of daySlots) {
    const teachers = getSlotTeachers(slot);
    for (const t of teachers) {
      if (!teacherSlots.has(t)) teacherSlots.set(t, []);
      teacherSlots.get(t).push(slot);
    }
    // 隔週パートナーも追加
    if (isBiweekly(slot.note)) {
      const m = slot.note.match(/隔週\(([^)]+)\)/);
      if (m) {
        const partner = m[1];
        if (!teacherSlots.has(partner)) teacherSlots.set(partner, []);
        teacherSlots.get(partner).push(slot);
      }
    }
  }

  const result = [];

  for (const [name, slots] of teacherSlots) {
    // 各スロットについて、この講師が実際に担当するかを判定
    const activeSlots = []; // 休講でない → 担当しなければならないスロット
    const cancelledSlots = []; // 休講 → この時間は空いている
    const reasons = new Set();

    for (const slot of slots) {
      const cancelled = slotCancelled.get(slot.id);

      // 隔週チェック: この日がB週なら、メイン教師は空き
      if (isBiweekly(slot.note)) {
        const wt = getSlotWeekType(date, slot, biweeklyAnchors);
        const mainTeachers = getSlotTeachers(slot);
        const m = slot.note.match(/隔週\(([^)]+)\)/);
        const partner = m ? m[1] : null;

        if (wt === "B" && mainTeachers.includes(name)) {
          // B週 → メイン教師は担当しない
          cancelledSlots.push(slot);
          reasons.add("隔週(B週)");
          continue;
        }
        if (wt === "A" && name === partner) {
          // A週 → パートナーは担当しない
          cancelledSlots.push(slot);
          reasons.add("隔週(A週)");
          continue;
        }
      }

      if (cancelled) {
        cancelledSlots.push(slot);
        // 休講理由を推定
        const dept = slot.grade.includes("高") ? "高校部" : "中学部";
        reasons.add(`${dept}休講`);
      } else {
        activeSlots.push(slot);
      }
    }

    // 既に代行に入っている時間帯を考慮
    const busyTimes = substituteAssignments.get(name) || [];

    if (cancelledSlots.length === 0) continue; // 空きコマなし

    const isFreeAllDay = activeSlots.length === 0 && busyTimes.length === 0;

    // 空いている時間帯 = キャンセルされたスロットの時間で、
    // 既存の代行アサインと重ならないもの
    const freeTimeSlots = cancelledSlots
      .map((s) => s.time)
      .filter((time) => !busyTimes.some((bt) => timeOverlaps(time, bt)));

    // 重複排除
    const uniqueFreeTimes = [...new Set(freeTimeSlots)];

    if (uniqueFreeTimes.length === 0 && !isFreeAllDay) continue;

    // 教科の判定
    const isPartTime = staffNameSet.has(name);
    let subjectIds;
    if (isPartTime) {
      const staff = partTimeStaff.find((s) => s.name === name);
      subjectIds = staff ? staff.subjectIds : [];
    } else {
      subjectIds = getTeacherSubjectIds(name, allSlots, subjects);
    }

    result.push({
      name,
      isFreeAllDay,
      freeTimeSlots: uniqueFreeTimes,
      cancelledSlots,
      reason: [...reasons].join("・"),
      subjectIds,
      isPartTime,
    });
  }

  return result;
}

// ─── チェーン提案アルゴリズム ─────────────────────────────────────

/**
 * 代行が必要なコマと空き講師から、最適な割り当てを提案する。
 * 玉突き (バイトのコマが代行されたら、そのバイトが別のコマに入れる) も考慮。
 *
 * @param {Array<{slotId: number, originalTeacher: string, date: string}>} uncoveredSubs
 * @param {Array} availableTeachers - computeAvailableTeachers の返り値
 * @param {import("../types").Slot[]} slots
 * @param {import("../types").Subject[]} subjects
 * @param {import("../types").SubjectCategory[]} subjectCategories
 * @param {import("../types").PartTimeStaffObject[]} partTimeStaff
 * @returns {Array<{
 *   slotId: number,
 *   originalTeacher: string,
 *   suggestedSubstitute: string,
 *   score: number,
 *   isChain: boolean,
 *   chainStep: number
 * }>}
 */
export function suggestChainSubstitutions(
  uncoveredSubs,
  availableTeachers,
  slots,
  subjects,
  subjectCategories,
  partTimeStaff
) {
  const slotMap = new Map(slots.map((s) => [s.id, s]));
  const staffNameSet = new Set(partTimeStaff.map((s) => s.name));

  // 作業用コピー
  const remaining = [...uncoveredSubs];
  const available = availableTeachers.map((t) => ({
    ...t,
    busyTimes: [], // 提案中に埋まる時間帯
  }));
  const result = [];
  let chainStep = 1;
  let madeProgress = true;

  while (madeProgress && remaining.length > 0) {
    madeProgress = false;

    // 時間順にソート
    remaining.sort((a, b) => {
      const sa = slotMap.get(a.slotId);
      const sb = slotMap.get(b.slotId);
      if (!sa || !sb) return 0;
      return timeToMin(sa.time.split("-")[0]) - timeToMin(sb.time.split("-")[0]);
    });

    const toRemove = [];
    const newlyFreed = [];

    for (let i = 0; i < remaining.length; i++) {
      const sub = remaining[i];
      const slot = slotMap.get(sub.slotId);
      if (!slot) continue;

      const slotSubjectId = pickSubjectId(slot.subj, subjects);

      // 候補を探す
      const candidates = [];
      for (const teacher of available) {
        // 自分自身には代行させない
        if (teacher.name === sub.originalTeacher) continue;

        // 時間が空いているか
        const isFree =
          teacher.isFreeAllDay && teacher.busyTimes.length === 0
            ? true
            : teacher.freeTimeSlots.some(
                (ft) => timeOverlaps(ft, slot.time)
              ) && !teacher.busyTimes.some((bt) => timeOverlaps(bt, slot.time));

        // 全日空きで、まだ busyTimes に重複がない場合も OK
        if (
          !isFree &&
          teacher.isFreeAllDay &&
          !teacher.busyTimes.some((bt) => timeOverlaps(bt, slot.time))
        ) {
          // 全日空きなのでOK
        } else if (!isFree) {
          continue;
        }

        // スコア計算
        let score = 0;
        if (slotSubjectId && teacher.subjectIds.includes(slotSubjectId)) {
          score += 10; // 教科完全一致
        } else if (slotSubjectId) {
          // 同カテゴリチェック
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

        candidates.push({ teacher, score });
      }

      if (candidates.length === 0) continue;

      // 最高スコアの候補を選択
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

      // この講師をこの時間帯ビジーにする
      best.teacher.busyTimes.push(slot.time);

      // 玉突き: バイト講師のコマが代行されたら、そのバイト講師を available に追加
      if (staffNameSet.has(sub.originalTeacher)) {
        const alreadyAvailable = available.some(
          (a) => a.name === sub.originalTeacher
        );
        if (!alreadyAvailable) {
          // このバイト講師の教科情報を取得
          const staffObj = partTimeStaff.find(
            (s) => s.name === sub.originalTeacher
          );
          newlyFreed.push({
            name: sub.originalTeacher,
            isFreeAllDay: false,
            freeTimeSlots: [slot.time], // 代行されたコマの時間が空く
            cancelledSlots: [slot],
            reason: "玉突き（代行により空き）",
            subjectIds: staffObj ? staffObj.subjectIds : [],
            isPartTime: true,
            busyTimes: [],
          });
        } else {
          // 既に available にいる場合、空き時間を追加
          const existing = available.find(
            (a) => a.name === sub.originalTeacher
          );
          if (existing) {
            existing.freeTimeSlots.push(slot.time);
          }
        }
      }

      toRemove.push(i);
      madeProgress = true;
    }

    // 処理済みを除去 (後ろから)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      remaining.splice(toRemove[i], 1);
    }

    // 新たに空いた講師を追加
    for (const freed of newlyFreed) {
      available.push(freed);
    }

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

  // 時間重複チェック
  const timeConflict = existingAssignments.some(
    (a) =>
      a.suggestedSubstitute === teacherName &&
      a.slotId !== slotId &&
      timeOverlaps(
        slot.time,
        (slots.find((s) => s.id === a.slotId) || {}).time || ""
      )
  );

  // 教科チェック
  const slotSubjectId = pickSubjectId(slot.subj, subjects);
  let subjectMismatch = false;
  if (slotSubjectId) {
    const staffNameSet = new Set(partTimeStaff.map((s) => s.name));
    if (staffNameSet.has(teacherName)) {
      const staff = partTimeStaff.find((s) => s.name === teacherName);
      subjectMismatch = staff
        ? !staff.subjectIds.includes(slotSubjectId)
        : true;
    } else {
      const teacherSubjects = getTeacherSubjectIds(teacherName, slots, subjects);
      subjectMismatch = !teacherSubjects.includes(slotSubjectId);
    }
  }

  return { timeConflict, subjectMismatch };
}
