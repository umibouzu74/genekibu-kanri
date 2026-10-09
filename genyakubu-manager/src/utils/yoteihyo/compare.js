// ─── 予定表とシステムの突き合わせ ─────────────────────────────────
// 予定表の講座ごとに「授業がある日 / 無い日」を、システムが今の登録
// (休講日・テスト期間・コマ休講・特別時程・振替・表示期間・時間割の期間)
// で出している授業の有無と比べ、食い違う日だけを返す。
//
// 決めごと:
//   - **システム側の実施判定は既存の関数に任せる** (isSlotHeldOnDate /
//     isSlotBeyondCutoff / isTimetableActiveForDate)。ここで独自のルールを
//     書き起こさない。理由の文言だけ作る
//   - 比べるのは講座の「いつもの曜日」(予定表で 3 回以上ある曜日) だけ。
//     それ以外の曜日の授業 (振替で入る日) は、システムに振替・追加授業が
//     あるかを見る
//   - 予定表の学期のうち、システムの表示期間 (開講日〜終講日) と重なる学期
//     だけを比べる。前の期の日付まで比べると、表示期間外 (開講前) の日が
//     全部「システムでは休み」と出てしまうため。学期の前後の休み (夏休み
//     など) も一緒に見て、開講日・終講日のずれは拾う
//   - 自動では何も書き換えない。直す案 (休講日 / コマ休講) を作るだけ

import { isSlotHeldOnDate } from "../sessionCount";
import { findGroupForGrade, isSlotBeyondCutoff, isTimetableActiveForDate } from "../timetable";
import { examPeriodStopsClassesOn, gradeToDept, isSlotCancelledByHoliday } from "../scheduleHelpers";
import { slotCancelReason } from "../slotCancel";
import { findCohortCutoff } from "../cohorts";
import { findSameDayHolidays } from "../holidayDuplicates";
import { nextNumericId } from "../schema";
import { addDays, courseWeekdays, weekdayOf } from "./highSchoolSheet";
import { subjectKey } from "./courseMapping";

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
    const group = findGroupForGrade(slot.grade, sys.displayCutoff?.groups);
    const cohort = findCohortCutoff(slot, sys.displayCutoff?.cohorts);
    if (group?.startDate && date < group.startDate) {
      return { held: false, kind: "before-start", label: `開講前 (表示期間の開講日 ${md(group.startDate)})` };
    }
    const end = cohort?.date || group?.date;
    return { held: false, kind: "after-end", label: end ? `終講後 (終講日 ${md(end)})` : "表示期間外" };
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

/**
 * 予定表の学期のうち、システムの表示期間・時間割の期間と重なるもの。
 * 学期の前後の休み (次の学期までの間) も比べる日に含める。
 */
function compareDatesFor(course, family, courseSlots, sys) {
  const terms = family?.terms || [];
  if (!terms.length || !courseSlots.length) return { dates: [], skippedTerms: terms };
  const live = (d) =>
    courseSlots.some(
      (s) =>
        s.day === weekdayOf(d) &&
        isSlotTimetableActive(s, d, sys.timetables) &&
        !isSlotBeyondCutoff(d, s, sys.displayCutoff)
    );
  const overlap = terms.map((t) => dateRange(t.start, t.end).some(live));
  const dates = [];
  for (const r of course.ranges) {
    for (const d of dateRange(r.start, r.end)) {
      const i = terms.findIndex((t) => t.start <= d && d <= t.end);
      if (i >= 0) {
        if (overlap[i]) dates.push(d);
        continue;
      }
      const prev = terms.map((t, k) => (t.end < d ? k : -1)).filter((k) => k >= 0).pop();
      const next = terms.findIndex((t) => t.start > d);
      if ((prev != null && overlap[prev]) || (next >= 0 && overlap[next])) dates.push(d);
    }
  }
  return { dates: [...new Set(dates)].sort(), skippedTerms: terms.filter((_, i) => !overlap[i]) };
}

/**
 * @param {{
 *   merged: ReturnType<import("./highSchoolSheet").mergeHighSchoolSheets>,
 *   mapping: Map<string, {subjects: string[], skip: boolean}>,
 *   slots: Array,
 *   sys: object,             // systemSlotStatus の sys + extraLessons
 * }} args
 * @returns {{ findings: Finding[], courses: CourseSummary[] }}
 *
 * Finding = {
 *   date, courseKey, kind: "needOff" | "needOn" | "partial" | "missingExtra" | "noSlot",
 *   yt: { status: "held"|"cancelled"|"blank"|"closed", label },
 *   sys: { held: Array<{slot}>, off: Array<{slot, status}> },
 *   note?: string, sourceDate?: string,
 * }
 */
export function compareSchedules({ merged, mapping, slots, sys }) {
  const findings = [];
  const summaries = [];
  for (const course of merged.courses.values()) {
    const m = mapping.get(course.key);
    const { regular } = courseWeekdays(course);
    const family = merged.families.get(course.family);
    if (!m || m.skip || !m.subjects.length || !regular.length) {
      summaries.push({ key: course.key, compared: 0, skippedTerms: family?.terms || [], unmapped: !m?.skip });
      continue;
    }
    const subj = new Set(m.subjects);
    const mapped = (slots || []).filter((s) => subj.has(subjectKey(s.grade, s.subj)));
    const courseSlots = mapped.filter((s) => regular.includes(s.day));
    const { dates, skippedTerms } = compareDatesFor(course, family, courseSlots, sys);
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
        if (ytHeld) findings.push({ date, courseKey: course.key, kind: "noSlot", yt, sys: { held: [], off: [] } });
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
      if (sess.status !== "held" || regular.includes(weekdayOf(date))) continue;
      if (!dateSet.has(date)) continue;
      const incoming = (sys.adjustments || []).filter(
        (a) => a?.type === "reschedule" && a.targetDate === date && mapped.some((s) => s.id === a.slotId)
      );
      const extra = (sys.extraLessons || []).filter(
        (e) => e?.date === date && subj.has(subjectKey(e.grade, e.subj))
      );
      if (incoming.length || extra.length) continue;
      const day = merged.days.get(`${course.family}|${date}`);
      const notes = day?.notes || [];
      const sourceDate = parseSourceDate(notes, date);
      findings.push({
        date,
        courseKey: course.key,
        kind: "missingExtra",
        yt: { status: "held", label: sess.changed ? "授業あり (変更の印)" : "授業あり" },
        sys: { held: [], off: [] },
        notes,
        sourceDate,
      });
    }
    summaries.push({ key: course.key, compared, skippedTerms, unmapped: false });
  }
  findings.sort((a, b) => a.date.localeCompare(b.date) || a.courseKey.localeCompare(b.courseKey));
  // 表示期間設定のどの学年グループにも入っていない学年 (「高1高2」など) は
  // 開講日・終講日が効かず、夏休みや終講後もコマが出る。食い違いの元なので
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
 * @returns {Array<{ date, findings, offSlots, keepSlots, fix, extras, infos }>}
 *   fix: proposeFixes の結果 (予定表では休みなのにシステムで授業があるコマを止める案)
 *   extras: 予定表では授業があるのにシステムに無い「いつもの曜日以外」の授業
 *           (sourceDate があれば日まるごと振替の案内)
 *   infos: システムで休みになっている理由など (直す案は出さない)
 */
export function buildDayPlans({ findings, merged, slots, sys, subs = [] }) {
  const byDate = new Map();
  for (const f of findings) {
    if (!byDate.has(f.date)) byDate.set(f.date, []);
    byDate.get(f.date).push(f);
  }
  const plans = [];
  for (const [date, fs] of byDate) {
    const offMap = new Map();
    for (const f of fs) if (f.kind === "needOff") for (const x of f.sys.held) offMap.set(x.slot.id, x.slot);
    const offSlots = [...offMap.values()];
    let fix = { holidays: [], cancels: [], manual: [] };
    let keepSlots = [];
    if (offSlots.length) {
      const wd = weekdayOf(date);
      keepSlots = (slots || []).filter(
        (s) => s.day === wd && !offMap.has(s.id) && systemSlotStatus(s, date, sys).held
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
        label: closedLabel || "休講",
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

/**
 * その日の「システムでは授業ありだが予定表では休み」のコマを止める案。
 * 休講日 (高校部 × 学年 × 対象クラス) で表せるものは休講日に、表せない
 * もの (同じ学年・同じ頭の語で、残したいコマがある) はコマ休講にする。
 * 案は必ず「外したいコマにだけ当たる」ことを確かめてから返す。
 *
 * @param {{ date: string, offSlots: Array, keepSlots: Array, label?: string,
 *           adjustments?: Array, subs?: Array }} args
 *   keepSlots はその日にシステムで授業があり、そのまま残すコマ (中学部・
 *   予定表に無い講座も含める)
 * @returns {{ holidays: Array<{date, label, scope, targetGrades, subjKeywords}>,
 *             cancels: Array<{date, slotId, memo}>, manual: Array<{slot, reason}> }}
 */
export function proposeFixes({ date, offSlots, keepSlots, label = "休講", adjustments = [], subs = [] }) {
  const highKeep = keepSlots.filter((s) => gradeToDept(s.grade) === "高校部");
  const holidays = [];
  const cancelSlots = [];
  if (!offSlots.length) return { holidays, cancels: [], manual: [] };
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
    const adj = adjustments.find(
      (a) => a?.date === date && (a.slotId === s.id || (a.combineSlotIds || []).includes(s.id))
    );
    const sub = subs.find((x) => x?.date === date && x.slotId === s.id);
    if (adj || sub) {
      manual.push({ slot: s, reason: adj ? "時間割調整がある" : "代行・欠勤の登録がある" });
    } else {
      cancels.push({ date, slotId: s.id, memo: "予定表チェック" });
    }
  }
  return { holidays, cancels, manual };
}

/**
 * 直す案を登録する形 (id つきの休講日・コマ休講) にする。同じ日・同じ対象の
 * 休講日、同じ日・同じコマのコマ休講が既にあれば足さない。
 * @param {{ holidays: Array, adjustments: Array, plans: Array, now?: Date }} args
 * @returns {{ holidays: Array, adjustments: Array, skipped: number }}
 *   返すのは足す分だけ (呼び出し側が既存の後ろに足して保存する)
 */
export function applyFixes({ holidays = [], adjustments = [], plans = [], now = new Date() }) {
  let hid = nextNumericId(holidays);
  const addedH = [];
  let skipped = 0;
  for (const p of plans) {
    for (const h of p.fix?.holidays || []) {
      const { exact } = findSameDayHolidays([...holidays, ...addedH], [h.date], h);
      if (exact.length) {
        skipped++;
        continue;
      }
      addedH.push({
        id: hid++,
        date: h.date,
        label: h.label,
        scope: [...h.scope],
        targetGrades: [...h.targetGrades],
        subjKeywords: [...h.subjKeywords],
      });
    }
  }
  let aid = nextNumericId(adjustments);
  const ts = now.toISOString();
  const addedA = [];
  for (const p of plans) {
    for (const c of p.fix?.cancels || []) {
      const dup = [...adjustments, ...addedA].some(
        (a) => a?.type === "cancel" && a.date === c.date && a.slotId === c.slotId
      );
      if (dup) {
        skipped++;
        continue;
      }
      addedA.push({ id: aid++, type: "cancel", date: c.date, slotId: c.slotId, memo: c.memo, createdAt: ts });
    }
  }
  return { holidays: addedH, adjustments: addedA, skipped };
}
