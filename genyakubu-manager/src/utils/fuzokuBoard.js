// ─── 附属の授業予定: 1 か月ぶんの組み立て (純関数) ─────────────────
// 附属コースの授業日 (水曜) を月ごとに並べ、各日の
//   時程 (通常 / 50分授業 / 1限カット / 個別の特別時程)
//   限 × 学年の科目 (読み替え後の時刻)・休み・カット
//   確認テストの科目 (ローテーション + 手動指定)
//   学校メモ (バス) と時程の提案
//   附属のコマが絡む講師・教室の重なり
// を 1 つのデータにまとめる。画面は components/views/FuzokuPlanView.jsx。
//
// **実施判定を書き起こさない。** コマが実施されるかは
// sessionCount.isSlotHeldOnDate + timetable.isSlotBeyondCutoff、休講の
// 理由は slotCancel.slotCancelReason、時刻は adjustmentDisplay の
// buildAdjustmentIndex (コマ移動 > 特別時程の読み替え) に委ねる。
// ダッシュボード・タイムテーブルと同じ経路なので、ここで 50分にした日は
// 他の画面でも 17:00 開始に見える。

import { dateToDay, eachDateStrInRange } from "./dateHelpers";
import { filterSlotsForDate, findGroupForGrade, isSlotBeyondCutoff } from "./timetable";
import { getSlotCountStartDate, isSlotHeldOnDate } from "./sessionCount";
import { slotCancelReason } from "./slotCancel";
import {
  buildAdjustmentIndex,
  collectIncomingReschedules,
  describeRescheduleTarget,
} from "./adjustmentDisplay";
import { examPeriodStopsClassesOn, isSlotCancelledByHoliday } from "./scheduleHelpers";
import { findNewConflicts, resolveSlotDaySchedule } from "./daySchedules";
import { collectTeacherAssignments, findTeacherConflicts } from "./teacherConflicts";
import { formatOffsiteTime, formatTravel } from "./offsiteLessons";
import { extraLessonsOnDate } from "./extraLessons";
import { migrateFuzokuPlan } from "./migrate";
import { cutoffShortText } from "../constants/cutoffMessages";
import {
  PATTERN,
  classifyDayPattern,
  collectLessonTimes,
  compareFuzokuGrades,
  isFuzokuGrade,
  isFuzokuLessonSlot,
  isFuzokuTestSlot,
  resolveTestChain,
  suggestPatternFromBus,
  testSlotAppliesToGrade,
} from "./fuzokuPlan";

const pad2 = (n) => String(n).padStart(2, "0");

// その月の初日・末日 ("YYYY-MM-DD")
export function monthRange(year, month) {
  const last = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad2(month)}-01`, end: `${year}-${pad2(month)}-${pad2(last)}` };
}

// 休み・カット・振替で「その日は授業が無い」扱いの状態
const ABSENT = new Set(["off", "cancelled", "moved"]);
// その学年がその日に来ている (確認テストを受ける) 扱いの状態。
// 合同で吸収されたコマの生徒は相手のクラスで授業を受けているので来ている
const ATTENDS = new Set(["held", "orientation", "combined"]);

/**
 * バス欄からの提案と、実際の時程が食い違っているか。
 * 1限カット (2限 17:35 から) は遅い便への対処としてもあり得るので、
 * 提案が 50分でも食い違い扱いにしない。個別の特別時程は判断しない。
 */
export function isPatternAtOddsWithBus(suggestionKind, patternKind) {
  if (suggestionKind === PATTERN.NORMAL) {
    return patternKind === PATTERN.COMPRESS || patternKind === PATTERN.CUT_FIRST;
  }
  if (suggestionKind === PATTERN.COMPRESS) return patternKind === PATTERN.NORMAL;
  return false;
}

/**
 * 1 か月ぶんの附属の授業予定を組み立てる。
 * @param {{
 *   year: number, month: number,          // month は 1-12
 *   slots: object[],                      // 全コマ (学年を問わない。講師の重なりを見るため)
 *   ctx: object,                          // useSessionCtx の sessionCtx
 *   subs?: object[],                      // 代行・欠勤 (講師の重なりは代行を入れた後で見る)
 *   specialEvents?: object[],
 *   extraLessons?: object[],
 *   offsiteLessons?: object[],            // 他校舎の授業 (講師の重なりに入れる)
 *   fuzokuPlan?: object,
 * }} args
 *   ctx から timetables / displayCutoff / daySchedules / adjustments /
 *   holidays / examPeriods / isOffForGrade を読む (画面と同じ判定材料)。
 */
export function buildFuzokuMonth({
  year,
  month,
  slots = [],
  ctx = {},
  specialEvents = [],
  extraLessons = [],
  offsiteLessons = [],
  subs = [],
  fuzokuPlan,
}) {
  const timetables = ctx.timetables || [];
  const displayCutoff = ctx.displayCutoff || null;
  const daySchedules = ctx.daySchedules || [];
  const adjustments = ctx.adjustments || [];
  const holidays = ctx.holidays || [];
  const examPeriods = ctx.examPeriods || [];
  const plan = migrateFuzokuPlan(fuzokuPlan);
  // 開講日 1 限のオリエンを「来ている」と見分けるための ctx
  // (isSlotHeldOnDate はオリエンのコマを「実施なし」と返す)
  const ctxNoOrientation = { ...ctx, orientationOnFirstDay: false };

  // ── 日付ごとのキャッシュ ─────────────────────────────────────────
  const daySlotsCache = new Map();
  // その日に有効な時間割の、その曜日のコマ (全学年)
  const allDaySlots = (d) => {
    let v = daySlotsCache.get(d);
    if (!v) {
      const dow = dateToDay(d);
      v = dow ? filterSlotsForDate(slots, d, timetables).filter((s) => s.day === dow) : [];
      daySlotsCache.set(d, v);
    }
    return v;
  };
  const fuzokuDaySlots = (d) => allDaySlots(d).filter((s) => isFuzokuGrade(s.grade));

  const indexCache = new Map();
  const indexFor = (d) => {
    let v = indexCache.get(d);
    if (!v) {
      v = buildAdjustmentIndex(adjustments, d, { slots: allDaySlots(d), daySchedules });
      indexCache.set(d, v);
    }
    return v;
  };

  const cutoffReason = (s, d) => {
    const group = findGroupForGrade(s.grade, displayCutoff?.groups);
    return cutoffShortText(group?.startDate && d < group.startDate ? "before" : "after");
  };

  const offReason = (s, d) => {
    const hols = holidays
      .filter((h) => isSlotCancelledByHoliday(s, d, [h]))
      .map((h) => h.label || "休講");
    if (hols.length > 0) return [...new Set(hols)].join("・");
    const eps = examPeriods
      .filter((ep) => examPeriodStopsClassesOn(ep, d, s.grade))
      .map((ep) => ep.name || "テスト期間");
    if (eps.length > 0) return [...new Set(eps)].join("・");
    return "休講";
  };

  // コマ × 日付 → その日の状態。判定の順は dayReschedule.skipReason と同じ
  // (期間 → 休講・テスト期間 → カット / コマ休講 → 振替・合同 → その他)
  const statusCache = new Map();
  const slotStatus = (s, d) => {
    const key = `${s.id}|${d}`;
    const hit = statusCache.get(key);
    if (hit) return hit;
    let v;
    const idx = indexFor(d);
    const time = idx.moveBySlot.get(s.id) || s.time;
    if (isSlotBeyondCutoff(d, s, displayCutoff)) {
      v = { status: "off", reason: cutoffReason(s, d) };
    } else if (ctx.isOffForGrade && ctx.isOffForGrade(d, s.grade, s.subj)) {
      v = { status: "off", reason: offReason(s, d) };
    } else {
      const cancel = slotCancelReason(s, d, ctx);
      const out = idx.rescheduleOutBySlot.get(s.id);
      if (cancel?.kind === "daySchedule") {
        v = { status: "cancelled", reason: "カット", detail: cancel.schedule?.label || "" };
      } else if (cancel?.kind === "cancel") {
        v = { status: "cancelled", reason: "休講", detail: cancel.adj?.memo || "" };
      } else if (out) {
        v = {
          status: "moved",
          reason: `振替 → ${describeRescheduleTarget(out, { short: true, originalTeacher: s.teacher })}`,
        };
      } else if (idx.combineAbsorbedBySlot.has(s.id)) {
        v = { status: "combined", reason: "合同" };
      } else if (isSlotHeldOnDate(s, d, ctx)) {
        v = { status: "held", time, remapped: time !== s.time };
      } else if (isSlotHeldOnDate(s, d, ctxNoOrientation)) {
        v = { status: "orientation", time, remapped: time !== s.time };
      } else {
        v = { status: "off", reason: "実施なし" };
      }
    }
    statusCache.set(key, v);
    return v;
  };

  // ── 附属のコマが絡む重なり ───────────────────────────────────────
  // 講師は本体共通の utils/teacherConflicts (代行・欠勤を入れた後の「その日に
  // 実際に教える人」) で見る。教室は特別時程の読み替えで新たに重なるものだけ
  // (daySchedules.findNewConflicts。元から同じ部屋を使う並列・合同は拾わない)。
  // 時刻はどちらもセルと同じ実効時刻 (コマ移動 > 特別時程の読み替え)
  const subsBySlotOn = (d) => {
    const m = new Map();
    for (const r of subs || []) {
      if (!r || r.date !== d) continue;
      if (!m.has(r.slotId)) m.set(r.slotId, []);
      m.get(r.slotId).push(r);
    }
    return m;
  };
  const conflictsOn = (d) => {
    // 休み・カット・振替で出る・合同で吸収された側は講師も教室も使わない
    const occupying = allDaySlots(d).filter((s) => {
      const st = slotStatus(s, d).status;
      return st === "held" || st === "orientation";
    });
    const timeBySlot = new Map();
    for (const s of occupying) timeBySlot.set(s.id, slotStatus(s, d).time || s.time);
    const out = [];
    const seen = new Set();
    const byTeacher = findTeacherConflicts(
      collectTeacherAssignments(occupying, d, {
        subsBySlot: subsBySlotOn(d),
        timeBySlot,
        biweeklyAnchors: ctx.biweeklyAnchors || [],
        holidays,
        examPeriods,
        // 他校舎の授業 (その日に行く分。附属のコマと重なるものだけ下で残る)
        offsiteLessons,
      })
    );
    for (const s of occupying) {
      if (!isFuzokuGrade(s.grade)) continue;
      for (const c of byTeacher.get(s.id) || []) {
        // 他校舎の予定の仮のコマは id が文字列 ("offsite:3") なので文字列で並べる
        const key = [c.teacher, ...[String(s.id), String(c.other.id)].sort()].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          kind: "teacher",
          value: c.teacher,
          a: s,
          aTime: timeBySlot.get(s.id),
          aRole: c.role,
          b: c.other,
          // 他校舎の予定は終了未定を「13:30〜 (終了未定)」と書く
          bTime: c.otherRole === "offsite" ? formatOffsiteTime(c.otherTime) : c.otherTime,
          bRole: c.otherRole,
          // 時間帯は重ならないが他校舎との移動が間に合わない
          travel: !!c.travel,
          bTravel: c.travel ? formatTravel(c.otherOffsite) : "",
        });
      }
    }
    const rooms = findNewConflicts(occupying, (s) => {
      const st = slotStatus(s, d);
      return st.remapped ? { time: st.time } : null;
    }).filter((c) => c.kind === "room" && (isFuzokuGrade(c.a.grade) || isFuzokuGrade(c.b.grade)));
    for (const c of rooms) {
      out.push({
        kind: "room",
        value: c.value,
        a: c.a,
        aTime: timeBySlot.get(c.a.id) || c.a.time,
        b: c.b,
        bTime: timeBySlot.get(c.b.id) || c.b.time,
      });
    }
    return out;
  };

  // ── 対象の日付と学年 ─────────────────────────────────────────────
  const { start: monthStart, end: monthEnd } = monthRange(year, month);
  const dates = eachDateStrInRange(monthStart, monthEnd).filter((d) =>
    fuzokuDaySlots(d).some(isFuzokuLessonSlot)
  );
  const gradeSet = new Set();
  for (const d of dates) {
    for (const s of fuzokuDaySlots(d)) if (isFuzokuLessonSlot(s)) gradeSet.add(s.grade);
  }
  const grades = [...gradeSet].sort(compareFuzokuGrades);

  // ── 確認テスト (学年ごとに日付順でたどる) ─────────────────────────
  // 確認テストのコマの状態。学年共通のテスト (学年 "附中") は、その学年の
  // コマが自分 1 つしか無いので、"附中" を学年グループに入れると開講日に
  // 「1 限 = オリエン」と判定される。テストはオリエンにならないので実施扱い
  const testStatus = (t, d) => {
    const st = slotStatus(t, d);
    return st.status === "orientation" ? { ...st, status: "held" } : st;
  };
  const testHeld = (g, d) => {
    const ds = fuzokuDaySlots(d);
    const attends = ds.some(
      (s) => isFuzokuLessonSlot(s) && s.grade === g && ATTENDS.has(slotStatus(s, d).status)
    );
    if (!attends) return false;
    return ds.some(
      (s) =>
        isFuzokuTestSlot(s) &&
        testSlotAppliesToGrade(s, g) &&
        testStatus(s, d).status === "held"
    );
  };
  // 期の識別子: 時間割 + 回数の数え直しの起点 (第N回と同じ区切り)。
  // 起点 (学年グループの開始日と時間割の開始日の遅い方) は設定の値で日付に
  // よらないので、**起点より前の日は別の期**として扱う。同じ時間割のまま
  // 2学期の開始日を入れたときも、1学期の続きで自動に回さない
  const scopeKeyOf = (g) => (d) => {
    const s = fuzokuDaySlots(d).find((x) => isFuzokuLessonSlot(x) && x.grade === g);
    if (!s) return null;
    const start = getSlotCountStartDate(s, ctx) || "";
    return `${s.timetableId ?? 1}|${start && d < start ? "before" : start}`;
  };
  const lessonDaysOf = (g) =>
    new Set(slots.filter((s) => isFuzokuLessonSlot(s) && s.grade === g).map((s) => s.day));

  const chains = new Map();
  for (const g of grades) {
    const entries = {};
    for (const [date, byGrade] of Object.entries(plan.tests)) {
      if (byGrade[g] && date <= monthEnd) entries[date] = byGrade[g];
    }
    // 手で決めた最初の週までさかのぼってたどる (無ければ今月だけ)
    const firstEntry = Object.keys(entries).sort()[0];
    const from = firstEntry && firstEntry < monthStart ? firstEntry : monthStart;
    const days = lessonDaysOf(g);
    const chainDates = eachDateStrInRange(from, monthEnd).filter(
      (d) =>
        days.has(dateToDay(d)) &&
        fuzokuDaySlots(d).some((s) => isFuzokuLessonSlot(s) && s.grade === g)
    );
    chains.set(
      g,
      resolveTestChain({
        dates: chainDates,
        isHeld: (d) => testHeld(g, d),
        entries,
        scopeKeyOf: scopeKeyOf(g),
      })
    );
  }

  // ── 日ごと ───────────────────────────────────────────────────────
  const weeks = dates.map((d) => {
    const ds = fuzokuDaySlots(d);
    const lessons = ds.filter(isFuzokuLessonSlot);
    const tests = ds.filter(isFuzokuTestSlot);
    const dayGrades = [...new Set(ds.map((s) => s.grade))].sort(compareFuzokuGrades);
    const lessonGrades = [...new Set(lessons.map((s) => s.grade))].sort(compareFuzokuGrades);
    const lessonTimes = collectLessonTimes(ds);
    const pattern = classifyDayPattern({
      date: d,
      daySchedules,
      grades: dayGrades,
      lessonGrades,
      lessonTimes,
    });

    const entry = (s) => ({ slot: s, ...slotStatus(s, d) });
    const rows = lessonTimes.map((base, i) => {
      const rowSlots = lessons.filter((s) => (s.time || "").trim() === base);
      const r = rowSlots[0] ? resolveSlotDaySchedule(rowSlots[0], d, daySchedules) : null;
      const time = r && !r.cancelled && r.time ? r.time : base;
      const cells = {};
      for (const g of grades) cells[g] = rowSlots.filter((s) => s.grade === g).map(entry);
      return { key: base, label: `${i + 1}限`, baseTime: base, time, cells };
    });

    // 学年まるごとの休み (その学年のコマが全部休みで、理由が 1 つ)
    const gradeOff = {};
    for (const g of grades) {
      const es = lessons.filter((s) => s.grade === g).map(entry);
      if (es.length === 0) continue;
      if (es.every((e) => ABSENT.has(e.status))) {
        const reasons = [...new Set(es.map((e) => e.reason))];
        if (reasons.length === 1) gradeOff[g] = reasons[0];
      }
    }
    const offGrades = lessonGrades.filter((g) => gradeOff[g]);
    const allOffReason =
      lessonGrades.length > 0 &&
      offGrades.length === lessonGrades.length &&
      new Set(offGrades.map((g) => gradeOff[g])).size === 1
        ? gradeOff[lessonGrades[0]]
        : null;
    const anyHeld = lessons.some((s) => ATTENDS.has(slotStatus(s, d).status));

    let testRow = null;
    if (tests.length > 0) {
      const t = tests[0];
      const st = testStatus(t, d);
      const cells = {};
      for (const g of grades) {
        const res = chains.get(g)?.get(d);
        if (!res) continue;
        cells[g] = { ...res, applies: tests.some((x) => testSlotAppliesToGrade(x, g)) };
      }
      testRow = { slot: t, time: st.time || t.time, status: st.status, reason: st.reason, cells };
    }

    const note = plan.notes[d] || {};
    const suggestion = suggestPatternFromBus(note.bus);
    const busAtOdds =
      !!suggestion && anyHeld && isPatternAtOddsWithBus(suggestion.kind, pattern.kind);

    const touchesFuzoku = (targetGrades) =>
      !targetGrades?.length || targetGrades.some((g) => dayGrades.includes(g));
    const exams = examPeriods
      .filter((ep) => ep.startDate <= d && d <= ep.endDate && touchesFuzoku(ep.targetGrades))
      .map((ep) => ({
        id: ep.id,
        name: ep.name || "テスト期間",
        stops: lessonGrades.some((g) => examPeriodStopsClassesOn(ep, d, g)),
      }));
    const events = (specialEvents || [])
      .filter((ev) => ev.startDate <= d && d <= ev.endDate && touchesFuzoku(ev.targetGrades))
      .map((ev) => ({ id: ev.id, name: ev.name }));
    const extras = extraLessonsOnDate(extraLessons, d).filter((l) => isFuzokuGrade(l.grade));
    const incoming = collectIncomingReschedules(adjustments, d, slots).filter(({ slot }) =>
      isFuzokuGrade(slot?.grade)
    );

    const conflicts = conflictsOn(d);

    return {
      date: d,
      dayGrades,
      lessonGrades,
      lessonTimes,
      pattern,
      rows,
      testRow,
      gradeOff,
      allOffReason,
      anyHeld,
      note,
      suggestion,
      busAtOdds,
      exams,
      events,
      extras,
      incoming,
      conflicts,
    };
  });

  const summary = {
    total: weeks.length,
    compress: weeks.filter((w) => w.anyHeld && w.pattern.kind === PATTERN.COMPRESS).length,
    cutFirst: weeks.filter((w) => w.anyHeld && w.pattern.kind === PATTERN.CUT_FIRST).length,
    custom: weeks.filter((w) => w.anyHeld && w.pattern.kind === PATTERN.CUSTOM).length,
    noClass: weeks.filter((w) => !w.anyHeld).length,
    busAtOdds: weeks.filter((w) => w.busAtOdds).length,
    busUnknown: weeks.filter((w) => w.anyHeld && w.suggestion?.kind === "unknown").length,
    testUnset: weeks.filter(
      (w) => w.testRow && Object.values(w.testRow.cells).some((c) => c.kind === "unset")
    ).length,
    // 休みの日に手で決めた確認テスト (後から休講などを入れた週)。ローテーションを
    // 進めてしまうので、気付けるように数える
    testOnOffDay: weeks.filter(
      (w) =>
        w.testRow &&
        Object.values(w.testRow.cells).some((c) => c.kind === "manual" && !c.held)
    ).length,
  };

  return { year, month, dates, grades, weeks, summary };
}
