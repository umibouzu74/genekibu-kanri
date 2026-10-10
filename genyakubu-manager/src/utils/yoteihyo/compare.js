// ─── 予定表とシステムの突き合わせ ─────────────────────────────────
// 予定表の講座ごとに「授業がある日 / 無い日」を、システムが今の登録
// (休講日・テスト期間・コマ休講・特別時程・振替・表示期間・時間割の期間)
// で出している授業の有無と比べ、食い違う日だけを返す。
//
// 決めごと:
//   - **システム側の実施判定は既存の関数に任せる** (isSlotHeldOnDate /
//     isSlotBeyondCutoff / isTimetableActiveForDate)。ここで独自のルールを
//     書き起こさない。理由の文言だけ作る。振替は adjustments の reschedule を
//     見る (出ていく側 = 同じ日・同じコマ。buildAdjustmentIndex と同じ条件。
//     入ってくる側 = collectIncomingReschedules)
//   - 比べるのは講座の「いつもの曜日」(予定表で 3 回以上、かつ最多の曜日の
//     4 分の 1 以上ある曜日) だけ。それ以外の曜日の授業 (振替で入る日・臨時の日)
//     は、システムに振替・追加授業・その曜日のコマがあるかを見る
//   - 比べる日は、システムの表示期間・時間割の期間の中と、その外側
//     OUTSIDE_MARGIN 日まで (開始日・終了日のずれを拾うため)。それより外は
//     「比べていない期間」として返す。前の期・次の期まで比べると、開講前・終講後の
//     日が全部「システムでは休み」と出てしまう (冬休みは短く、予定表の学期の
//     切れ目では分けられない)
//   - 自動では何も書き換えない。直す案 (休講日 / コマ休講) を作るだけ

import { isSlotHeldOnDate } from "../sessionCount";
import { findGroupForGrade, isSlotBeyondCutoff, isTimetableActiveForDate } from "../timetable";
import { examPeriodStopsClassesOn, gradeToDept, isSlotCancelledByHoliday } from "../scheduleHelpers";
import { slotCancelReason } from "../slotCancel";
import { findCohortCutoff } from "../cohorts";
import { findSameDayHolidays } from "../holidayDuplicates";
import { nextNumericId } from "../schema";
import { collectIncomingReschedules } from "../adjustmentDisplay";
import { addDays, courseWeekdays, weekdayOf } from "./highSchoolSheet";
import { mappingStatus, subjectDays, subjectKey } from "./courseMapping";

/** 表示期間・時間割の期間の外でも、境目からこの日数までは比べる */
export const OUTSIDE_MARGIN = 10;

/** 休講日の案の名前 (予定表の休校・祝日の行に文字が無いとき) */
export const DEFAULT_HOLIDAY_LABEL = "休講 (予定表)";

function timetableOf(slot, timetables) {
  if (!Array.isArray(timetables) || timetables.length === 0) return null;
  return timetables.find((t) => t.id === (slot.timetableId ?? 1)) || null;
}

/** そのコマの時間割がその日に有効か (時間割が無い = 有効) */
export function isSlotTimetableActive(slot, date, timetables) {
  if (!Array.isArray(timetables) || timetables.length === 0) return true;
  const tt = timetableOf(slot, timetables);
  return isTimetableActiveForDate(tt, date, slot.grade);
}

function md(date) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
}

/**
 * システム側: そのコマはその日に授業があるか。無ければ理由。
 * @param {object} slot
 * @param {string} date
 * @param {{ctx: object, adjustments?: Array, holidays?: Array, examPeriods?: Array,
 *          displayCutoff?: object, timetables?: Array}} sys
 * @returns {{ held: boolean, kind: string, label: string }}
 *   kind: held / timetable / rescheduled / before-start / after-end / holiday / exam /
 *         cancel / daySchedule / other
 */
export function systemSlotStatus(slot, date, sys) {
  if (!isSlotTimetableActive(slot, date, sys.timetables)) {
    return { held: false, kind: "timetable", label: "時間割の期間外" };
  }
  const moved = (sys.adjustments || []).find(
    (a) => a?.type === "reschedule" && a.date === date && a.slotId === slot.id
  );
  if (moved) {
    return { held: false, kind: "rescheduled", label: `振替で ${md(moved.targetDate)} へ`, adj: moved };
  }
  if (isSlotBeyondCutoff(date, slot, sys.displayCutoff)) {
    // isSlotBeyondCutoff と同じ順: 開始日 → コース別終講日 → 学年グループの終了日
    const group = findGroupForGrade(slot.grade, sys.displayCutoff?.groups);
    const cohort = findCohortCutoff(slot, sys.displayCutoff?.cohorts);
    if (group?.startDate && date < group.startDate) {
      return { held: false, kind: "before-start", label: `開講前 (表示期間設定の開始日 ${md(group.startDate)})` };
    }
    if (cohort?.date) {
      return { held: false, kind: "after-end", label: `終講後 (コース別終講日 ${md(cohort.date)})` };
    }
    if (group?.date) {
      return { held: false, kind: "after-end", label: `終講後 (表示期間設定の終了日 ${md(group.date)})` };
    }
    return { held: false, kind: "after-end", label: "表示期間外" };
  }
  // オリエン (開講日 1 限) は授業のある日として数える (予定表もその日は授業)
  const ctx = { ...(sys.ctx || {}), orientationOnFirstDay: false };
  if (isSlotHeldOnDate(slot, date, ctx)) return { held: true, kind: "held", label: "授業あり" };

  const hols = (sys.holidays || []).filter((h) => isSlotCancelledByHoliday(slot, date, [h]));
  if (hols.length) {
    return { held: false, kind: "holiday", label: `休講日「${hols.map((h) => h.label || "休講").join("・")}」`, holidays: hols };
  }
  const exams = (sys.examPeriods || []).filter((ep) => examPeriodStopsClassesOn(ep, date, slot.grade));
  if (exams.length) {
    return { held: false, kind: "exam", label: `テスト期間「${exams.map((e) => e.name).join("・")}」`, exams };
  }
  const cancel = slotCancelReason(slot, date, sys.ctx || {});
  if (cancel?.kind === "cancel") {
    return { held: false, kind: "cancel", label: cancel.adj.memo ? `コマ休講 (${cancel.adj.memo})` : "コマ休講", adj: cancel.adj };
  }
  if (cancel?.kind === "daySchedule") return { held: false, kind: "daySchedule", label: "特別時程で休講" };
  return { held: false, kind: "other", label: "実施なし (隔週など)" };
}

function dateRange(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    out.push(d);
    if (out.length > 800) break;
  }
  return out;
}

/** 並んだ日付 → 続いている区間 [{start, end}] */
function toRanges(sortedDates) {
  const out = [];
  for (const d of sortedDates) {
    const last = out[out.length - 1];
    if (last && addDays(last.end, 1) === d) last.end = d;
    else out.push({ start: d, end: d });
  }
  return out;
}

/**
 * 比べる日。予定表のその講座の期間のうち、コマが表示期間・時間割の期間の中に
 * ある日と、その外側 OUTSIDE_MARGIN 日まで。それより外の日は skipped (区間) で返す。
 */
function compareDatesFor(course, courseSlots, sys) {
  const live = (s, d) =>
    isSlotTimetableActive(s, d, sys.timetables) && !isSlotBeyondCutoff(d, s, sys.displayCutoff);
  const far = (d) => {
    const sameDay = courseSlots.filter((s) => s.day === weekdayOf(d));
    const pool = sameDay.length ? sameDay : courseSlots;
    return pool.every(
      (s) => !live(s, addDays(d, -OUTSIDE_MARGIN)) && !live(s, d) && !live(s, addDays(d, OUTSIDE_MARGIN))
    );
  };
  const dates = new Set();
  const skipped = new Set();
  for (const r of course.ranges) {
    for (const d of dateRange(r.start, r.end)) (far(d) ? skipped : dates).add(d);
  }
  for (const d of dates) skipped.delete(d);
  return { dates: [...dates].sort(), skipped: toRanges([...skipped].sort()) };
}

/**
 * @param {{
 *   merged: ReturnType<import("./highSchoolSheet").mergeHighSchoolSheets>,
 *   mapping: Map<string, {subjects: string[], skip: boolean}>,
 *   slots: Array,
 *   sys: object,             // systemSlotStatus の sys + extraLessons
 * }} args
 * @returns {{ findings: Finding[], courses: CourseSummary[], ungroupedGrades: string[] }}
 *
 * Finding = {
 *   date, courseKey, kind: "needOff" | "needOn" | "partial" | "missingExtra" | "noSlot",
 *   yt: { status: "held"|"cancelled"|"blank"|"closed", label },
 *   sys: { held: Array<{slot, status}>, off: Array<{slot, status}> },
 *   notes?: string[],
 *   // missingExtra だけ: 注記から読んだ振替元、振替元の日にまだ残っているコマ、
 *   // 振替元の日にシステムで休みのコマ (日まるごと振替では移せない)
 *   sourceDate?: string, pending?: Array, sourceOff?: Array<{slot, status}>,
 * }
 * CourseSummary = { key, status, compared, skipped: Array<{start, end}> }
 *   status は courseMapping.mappingStatus (ok のときだけ比べる)
 */
export function compareSchedules({ merged, mapping, slots, sys }) {
  const findings = [];
  const summaries = [];
  const days = subjectDays(slots);
  for (const course of merged.courses.values()) {
    const m = mapping.get(course.key);
    const { status } = mappingStatus(course, m, days);
    if (status !== "ok") {
      summaries.push({ key: course.key, status, compared: 0, skipped: [] });
      continue;
    }
    const { regular } = courseWeekdays(course);
    const subj = new Set(m.subjects);
    const mapped = (slots || []).filter((s) => subj.has(subjectKey(s.grade, s.subj)));
    const courseSlots = mapped.filter((s) => regular.includes(s.day));
    // 振替先で合同にした側も、その講座の授業はその日に行われている
    const incomingFor = (date) =>
      collectIncomingReschedules(sys.adjustments, date, mapped, { includeAbsorbed: true });
    const extraFor = (date) =>
      (sys.extraLessons || []).filter((e) => e?.date === date && subj.has(subjectKey(e.grade, e.subj)));
    const { dates, skipped } = compareDatesFor(course, courseSlots, sys);
    const dateSet = new Set(dates);
    let compared = 0;
    for (const date of dates) {
      const wd = weekdayOf(date);
      if (!regular.includes(wd)) continue;
      const sess = course.sessions.get(date);
      const day = merged.days.get(`${course.family}|${date}`);
      const yt = sess
        ? { status: sess.status, label: sess.status === "held" ? "授業あり" : "休講 (灰色)" }
        : day?.closed
          ? { status: "closed", label: day.closed.label || "休み" }
          : { status: "blank", label: "記載なし (空欄)" };
      const ytHeld = yt.status === "held";
      const active = courseSlots.filter((s) => s.day === wd && isSlotTimetableActive(s, date, sys.timetables));
      compared++;
      if (!active.length) {
        // その曜日のコマが無い日。振替・追加授業で入っていれば食い違いではない
        if (ytHeld && !incomingFor(date).length && !extraFor(date).length) {
          findings.push({ date, courseKey: course.key, kind: "noSlot", yt, sys: { held: [], off: [] } });
        }
        continue;
      }
      const st = active.map((slot) => ({ slot, status: systemSlotStatus(slot, date, sys) }));
      const held = st.filter((x) => x.status.held);
      const off = st.filter((x) => !x.status.held);
      if (ytHeld && !off.length) continue;
      if (!ytHeld && !held.length) continue;
      const kind = !ytHeld ? "needOff" : held.length ? "partial" : "needOn";
      findings.push({ date, courseKey: course.key, kind, yt, sys: { held, off }, notes: day?.notes || [] });
    }
    // いつもの曜日以外の授業 (振替で入る日・臨時の日)
    for (const [date, sess] of course.sessions) {
      const wd = weekdayOf(date);
      if (sess.status !== "held" || regular.includes(wd) || !dateSet.has(date)) continue;
      // その曜日にもシステムのコマがあって授業がある (学期の途中で曜日が変わった講座など)
      if (mapped.some((s) => s.day === wd && systemSlotStatus(s, date, sys).held)) continue;
      if (extraFor(date).length) continue;
      const incoming = incomingFor(date);
      const day = merged.days.get(`${course.family}|${date}`);
      const notes = day?.notes || [];
      const sourceDate = parseSourceDate(notes, date);
      let pending = [];
      let sourceOff = [];
      const srcSlots = sourceDate
        ? mapped.filter(
            (s) => s.day === weekdayOf(sourceDate) && isSlotTimetableActive(s, sourceDate, sys.timetables)
          )
        : [];
      if (srcSlots.length) {
        // 振替元の曜日のコマが全部この日へ振り替えてあるか (1 コマだけ振り替えて
        // 残りが振替元の日に残っているのを見逃さない)
        const movedIds = new Set(incoming.filter((x) => x.adj.date === sourceDate).map((x) => x.slot.id));
        const rest = srcSlots
          .filter((s) => !movedIds.has(s.id))
          .map((slot) => ({ slot, status: systemSlotStatus(slot, sourceDate, sys) }));
        if (!rest.length) continue;
        pending = rest.filter((x) => x.status.held).map((x) => x.slot);
        sourceOff = rest.filter((x) => !x.status.held);
      } else if (incoming.length) {
        continue;
      }
      findings.push({
        date,
        courseKey: course.key,
        kind: "missingExtra",
        yt: { status: "held", label: sess.changed ? "授業あり (変更の印)" : "授業あり" },
        sys: { held: [], off: [] },
        notes,
        sourceDate,
        pending,
        sourceOff,
      });
    }
    summaries.push({ key: course.key, status, compared, skipped });
  }
  findings.sort((a, b) => a.date.localeCompare(b.date) || a.courseKey.localeCompare(b.courseKey));
  // 表示期間設定のどの学年グループにも入っていない学年 (「高1高2」など) は
  // 表示期間も終講日も効かず、夏休みや終講後もコマが出る。食い違いの元なので
  // 別に知らせる (CLAUDE.md「表示期間設定 / 終講日の扱い」)
  const ungroupedGrades = [];
  if (sys.displayCutoff?.groups?.length) {
    for (const m of mapping.values()) {
      if (m.skip) continue;
      for (const key of m.subjects) {
        const grade = key.split("|")[0];
        if (!ungroupedGrades.includes(grade) && !findGroupForGrade(grade, sys.displayCutoff.groups)) {
          ungroupedGrades.push(grade);
        }
      }
    }
  }
  return { findings, courses: summaries, ungroupedGrades };
}

/**
 * 食い違いを日ごとにまとめ、その日の直す案を付ける。
 * @returns {Array<{ date, findings, offSlots, keepSlots, fix, moves, extras, infos }>}
 *   fix: proposeFixes の結果 (予定表では休みなのにシステムで授業があるコマを止める案)
 *   moves: 予定表では他の日へ振り替えている講座のコマ ([{ targetDate, slots }])。
 *          休講日にはせず、日まるごと振替を案内する
 *   extras: 予定表では授業があるのにシステムに無い「いつもの曜日以外」の授業
 *           (sourceDate があれば日まるごと振替の案内)
 *   infos: システムで休みになっている理由など (直す案は出さない)
 */
export function buildDayPlans({ findings, merged, slots, sys, subs = [] }) {
  // 振替元の日 → 講座 → 振替先の日 (注記「←12/7(月)の振替→」から)。
  // 振替元の日のその講座のコマを休講日にすると、日まるごと振替の対象から外れ、
  // 第N回も振替元の日で数えられなくなる
  const movedOut = new Map();
  for (const f of findings) {
    if (f.kind !== "missingExtra" || !f.sourceDate) continue;
    if (!movedOut.has(f.sourceDate)) movedOut.set(f.sourceDate, new Map());
    const byCourse = movedOut.get(f.sourceDate);
    if (!byCourse.has(f.courseKey)) byCourse.set(f.courseKey, new Set());
    byCourse.get(f.courseKey).add(f.date);
  }
  const byDate = new Map();
  for (const f of findings) {
    if (!byDate.has(f.date)) byDate.set(f.date, []);
    byDate.get(f.date).push(f);
  }
  const plans = [];
  for (const [date, fs] of byDate) {
    const moving = movedOut.get(date);
    const moveMap = new Map(); // targetDate -> Map(slotId -> slot)
    const offMap = new Map();
    for (const f of fs) {
      if (f.kind !== "needOff") continue;
      const targets = moving?.get(f.courseKey);
      for (const x of f.sys.held) {
        if (!targets) {
          offMap.set(x.slot.id, x.slot);
          continue;
        }
        for (const t of targets) {
          if (!moveMap.has(t)) moveMap.set(t, new Map());
          moveMap.get(t).set(x.slot.id, x.slot);
        }
      }
    }
    for (const m of moveMap.values()) for (const id of m.keys()) offMap.delete(id);
    const offSlots = [...offMap.values()];
    let fix = { holidays: [], cancels: [], manual: [], cautions: [] };
    let keepSlots = [];
    if (offSlots.length) {
      const wd = weekdayOf(date);
      // 休講日の案が当たってはいけないコマ = その日に時間割が有効な同じ曜日の
      // コマ全部 (今たまたま休みのコマも含む)。隔週の B 週のコマに休講日が
      // 当たると A/B が入れ替わり、テスト期間・終講後のコマは後で期間を変えた
      // ときに休講日で黙って消える
      keepSlots = (slots || []).filter(
        (s) => s.day === wd && !offMap.has(s.id) && isSlotTimetableActive(s, date, sys.timetables)
      );
      // 休校・祝日の行の文字があれば休講日の名前に使う (シートで書き方が
      // 違えば長い方。「国民の日」より「国民の休日」)
      const closedLabel = [...(merged?.families?.keys() || [])]
        .map((fam) => merged.days.get(`${fam}|${date}`)?.closed?.label)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0];
      fix = proposeFixes({
        date,
        offSlots,
        keepSlots,
        label: closedLabel || DEFAULT_HOLIDAY_LABEL,
        adjustments: sys.adjustments || [],
        subs,
      });
    }
    plans.push({
      date,
      findings: fs,
      offSlots,
      keepSlots,
      fix,
      moves: [...moveMap].map(([targetDate, m]) => ({ targetDate, slots: [...m.values()] })),
      extras: fs.filter((f) => f.kind === "missingExtra"),
      infos: fs.filter((f) => f.kind === "needOn" || f.kind === "partial" || f.kind === "noSlot"),
    });
  }
  return plans.sort((a, b) => a.date.localeCompare(b.date));
}

// 注記「←12/7(月)の振替→」から振替元の日付 (年は振替先と同じ年度で近い方)
export function parseSourceDate(notes, targetDate) {
  for (const n of notes || []) {
    if (!/振替/.test(n)) continue;
    const m = /(\d{1,2})\s*\/\s*(\d{1,2})/.exec(n.normalize("NFKC"));
    if (!m) continue;
    const [ty] = targetDate.split("-").map(Number);
    let best = null;
    for (const y of [ty - 1, ty, ty + 1]) {
      const iso = `${y}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
      const diff = Math.abs(Date.parse(iso) - Date.parse(targetDate));
      if (Number.isFinite(diff) && (!best || diff < best.diff)) best = { iso, diff };
    }
    if (best) return best.iso;
  }
  return null;
}

// ─── 直す案 ───────────────────────────────────────────────────────

function firstToken(subj) {
  return String(subj || "").trim().split(/\s+/)[0] || "";
}

// 休講日の対象クラス (キーワード) を学年ごとに選ぶ。外したいコマには当たり、
// 残したいコマには当たらない語。候補は読みやすい順に:
//   1. 科目名の頭の語 (「高松西 数学」→「高松西」、1 語の科目名は頭の 2 文字
//      「共テ英語(Hi)」→「共テ」/ 括弧の前「共テ英語」)
//   2. 科目名そのもの (「高松一 英語」— 同じ頭の語で残したいコマがあるとき)
// どれも残したいコマに当たるなら null (= コマ休講にする)。
// 休講日の照合は「科目名にその語を含む」なので、他の語を含む語は外す
// (「東大京大」があれば「東大京大医進」は要らない)。
function keywordsFor(offSlots, keepSlots) {
  const hits = (kw) => keepSlots.some((k) => (k.subj || "").includes(kw));
  const out = [];
  for (const s of offSlots) {
    const subj = (s.subj || "").trim();
    if (!subj) return null;
    if (out.some((kw) => subj.includes(kw))) continue;
    const cands = /\s/.test(subj)
      ? [firstToken(subj), subj]
      : [[...subj].slice(0, 2).join(""), subj.split("(")[0], subj];
    const kw = cands.find((c) => c && !hits(c));
    if (!kw) return null;
    out.push(kw);
  }
  return out.filter((kw) => !out.some((other) => other !== kw && kw.includes(other)));
}

// その日にそのコマへの登録 (合同・移動 / 代行・欠勤) があるか
function registrationOn(slot, date, adjustments, subs) {
  const adj = adjustments.some(
    (a) => a?.date === date && (a.slotId === slot.id || (a.combineSlotIds || []).includes(slot.id))
  );
  if (adj) return "adjustment";
  if (subs.some((x) => x?.date === date && x.slotId === slot.id)) return "sub";
  return null;
}

/**
 * その日の「システムでは授業ありだが予定表では休み」のコマを止める案。
 * 休講日 (高校部 × 学年 × 対象クラス) で表せるものは休講日に、表せない
 * もの (残すコマと同じ学年で、科目名の語で分けられない) はコマ休講にする。
 * 案は必ず「外したいコマにだけ当たる」ことを確かめてから返す。
 *
 * @param {{ date: string, offSlots: Array, keepSlots: Array, label?: string,
 *           adjustments?: Array, subs?: Array }} args
 *   keepSlots は休講日が当たってはいけないコマ (その日に時間割が有効な同じ曜日の
 *   コマのうち offSlots 以外。中学部・予定表に無い講座・今は休みのコマも含める)
 * @returns {{ holidays: Array<{date, label, scope, targetGrades, subjKeywords}>,
 *             cancels: Array<{date, slotId, memo}>,
 *             manual: Array<{slot, reason: "adjustment" | "sub"}>,
 *             cautions: Array<{slot, reason: "adjustment" | "sub"}> }}
 *   manual: コマ休講にしたいが、合同・移動 / 代行・欠勤があって置けないコマ
 *   cautions: 休講日で止めるコマのうち、合同・移動 / 代行・欠勤があるもの
 *             (休講日を登録した後に外す必要がある)
 */
export function proposeFixes({
  date,
  offSlots,
  keepSlots,
  label = DEFAULT_HOLIDAY_LABEL,
  adjustments = [],
  subs = [],
}) {
  const highKeep = keepSlots.filter((s) => gradeToDept(s.grade) === "高校部");
  const holidays = [];
  const cancelSlots = [];
  if (!offSlots.length) return { holidays, cancels: [], manual: [], cautions: [] };
  if (!highKeep.length) {
    holidays.push({ date, label, scope: ["高校部"], targetGrades: [], subjKeywords: [] });
  } else {
    const grades = [...new Set(offSlots.map((s) => s.grade))].sort();
    const plain = grades.filter((g) => !highKeep.some((k) => k.grade === g));
    if (plain.length) holidays.push({ date, label, scope: ["高校部"], targetGrades: plain, subjKeywords: [] });
    const byKeywords = new Map();
    for (const g of grades.filter((x) => !plain.includes(x))) {
      const off = offSlots.filter((s) => s.grade === g);
      const kws = keywordsFor(off, highKeep.filter((k) => k.grade === g));
      if (!kws) {
        cancelSlots.push(...off);
        continue;
      }
      const k = [...kws].sort().join("\u0000");
      if (!byKeywords.has(k)) byKeywords.set(k, { kws: [...kws].sort(), grades: [] });
      byKeywords.get(k).grades.push(g);
    }
    for (const { kws, grades: gs } of byKeywords.values()) {
      holidays.push({ date, label, scope: ["高校部"], targetGrades: gs, subjKeywords: kws });
    }
  }
  // 確かめ: 休講日が残したいコマに当たらないこと / 外したいコマに当たること
  const asHolidays = holidays.map((h, i) => ({ id: -1 - i, ...h }));
  const wrong = keepSlots.filter((s) => isSlotCancelledByHoliday(s, date, asHolidays));
  if (wrong.length) {
    // 安全側: 休講日をやめて全部コマ休講にする
    holidays.length = 0;
    cancelSlots.length = 0;
    cancelSlots.push(...offSlots);
  } else {
    for (const s of offSlots) {
      if (!isSlotCancelledByHoliday(s, date, asHolidays) && !cancelSlots.includes(s)) cancelSlots.push(s);
    }
  }
  // コマ休講は代行・振替・合同・移動とは同時に置けない (欠勤組み換えと同じ決まり)
  const cancels = [];
  const manual = [];
  for (const s of cancelSlots) {
    const reason = registrationOn(s, date, adjustments, subs);
    if (reason) manual.push({ slot: s, reason });
    else cancels.push({ date, slotId: s.id, memo: "予定表チェック" });
  }
  // 休講日で止めるコマに代行・欠勤・合同・移動が残っていれば知らせる
  const cautions = [];
  for (const s of offSlots) {
    if (cancelSlots.includes(s)) continue;
    const reason = registrationOn(s, date, adjustments, subs);
    if (reason) cautions.push({ slot: s, reason });
  }
  return { holidays, cancels, manual, cautions };
}

/**
 * 直す案のうち、まだ無い休講日を id つきで返す (同じ日・同じ対象の休講日が
 * 既にあれば足さない)。返すのは足す分だけ。
 * @returns {{ added: Array, skipped: number }}
 */
export function newHolidaysFor(holidays = [], plans = []) {
  let hid = nextNumericId(holidays);
  const added = [];
  let skipped = 0;
  for (const p of plans) {
    for (const h of p.fix?.holidays || []) {
      const { exact } = findSameDayHolidays([...holidays, ...added], [h.date], h);
      if (exact.length) {
        skipped++;
        continue;
      }
      added.push({
        id: hid++,
        date: h.date,
        label: h.label,
        scope: [...h.scope],
        targetGrades: [...h.targetGrades],
        subjKeywords: [...h.subjKeywords],
      });
    }
  }
  return { added, skipped };
}

/**
 * 直す案のうち、まだ無いコマ休講を id つきで返す (同じ日・同じコマの
 * コマ休講が既にあれば足さない)。返すのは足す分だけ。
 * @returns {{ added: Array, skipped: number }}
 */
export function newCancelsFor(adjustments = [], plans = [], now = new Date()) {
  let aid = nextNumericId(adjustments);
  const ts = now.toISOString();
  const added = [];
  let skipped = 0;
  for (const p of plans) {
    for (const c of p.fix?.cancels || []) {
      const dup = [...adjustments, ...added].some(
        (a) => a?.type === "cancel" && a.date === c.date && a.slotId === c.slotId
      );
      if (dup) {
        skipped++;
        continue;
      }
      added.push({ id: aid++, type: "cancel", date: c.date, slotId: c.slotId, memo: c.memo, createdAt: ts });
    }
  }
  return { added, skipped };
}

/**
 * 直す案を登録する形 (id つきの休講日・コマ休講) にする (newHolidaysFor + newCancelsFor)。
 * @param {{ holidays: Array, adjustments: Array, plans: Array, now?: Date }} args
 * @returns {{ holidays: Array, adjustments: Array, skipped: number }}
 *   返すのは足す分だけ (呼び出し側が既存の後ろに足して保存する)
 */
export function applyFixes({ holidays = [], adjustments = [], plans = [], now = new Date() }) {
  const h = newHolidaysFor(holidays, plans);
  const a = newCancelsFor(adjustments, plans, now);
  return { holidays: h.added, adjustments: a.added, skipped: h.skipped + a.skipped };
}
