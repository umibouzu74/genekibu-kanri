// ─── テスト対策の振替・追加授業 (2026-10-15) ─────────────────────
// 高校部の授業は学校ごとのコース (「高松桜井 英語」) で、学校ごとにテストの
// 日程が違う。テストの前は「10/14 の高2 桜井 英語を 10/15 の 17:00-18:00 に
// 別の教室で」のような振替や、追加の授業が多い。それを「コースを選ぶ →
// 日付・時間・教室を選ぶ」だけで登録するための純粋関数
// (画面は components/TestPrepLessonDialog.jsx)。
//
// 決めごと:
//   - **モデルは足さない**。振替は adjustments の reschedule (振替先の教室
//     targetRoom だけ足した)、追加授業は extraLessons。表示・一覧・解除・
//     印刷は既存の振替 / 追加授業の経路にそのまま乗る
//   - 特訓 (examPrepSchedules = バイトの出勤シフト) とは別物
//   - 振替の扱いは日まるごと振替と同じ: 第N回は振替元の日付で数えたまま
//     (回数補正の skip は付けない)。振替先が休講日・振替元より前・今日より
//     前でも止めない。講師・教室の重なりは警告であって禁止ではない
//   - 振替元の日にそのコマの授業があるかは isSlotHeldOnDate +
//     isSlotBeyondCutoff に委ねる (画面側で実施判定を書き起こさない)。
//     合同に関わるコマは振替できない (欠勤組み換えと同じ排他)。同じ日の
//     コマ移動は振替と排他なので外す。代行は (日付, コマ) 参照で振替先へ
//     付いてこないので、注意書きで知らせるだけ (日まるごと振替と同じ)
//   - 学校は科目名の頭の語 (cohorts.firstSubjToken)。空白の無い科目名
//     (中学の「数学」など) は学校なし

import { ALL_GRADES, DAYS } from "../constants/schools";
import { activeTeachersOnDate } from "./absenceHelpers";
import { describeRescheduleTarget } from "./adjustmentDisplay";
import { splitTeacherField } from "./biweekly";
import { firstSubjToken } from "./cohorts";
import {
  dateToDay,
  fmtDate,
  fmtMDWeekday,
  isValidDateStr,
  normalizeTimeRange,
  parseLocalDate,
  timeRangeMinutes,
  timeStartToMin,
} from "./dateHelpers";
import {
  buildDayOccupancy,
  findOccupancyConflicts,
  rangesOverlap,
  skipReason,
  timeRange,
} from "./dayReschedule";
import { gradeToDept } from "./scheduleHelpers";
import { nextNumericId } from "./schema";
import { isSlotHeldOnDate } from "./sessionCount";
import { isSlotBeyondCutoff, isTimetableActiveForDate } from "./timetable";

/** 追加授業の種別ラベル / 振替のメモの既定値 */
export const TEST_PREP_LABEL = "テスト対策";

/** コースの候補・振替元の日の候補を探す期間 (今日から 9 週間) */
export const COURSE_HORIZON_DAYS = 63;

// 教室名・学校名は「亀21 / 亀3」「401 / 1001」を数として並べる
const collator = new Intl.Collator("ja", { numeric: true });
const GRADE_ORDER = new Map(ALL_GRADES.map((g, i) => [g, i]));
const DAY_ORDER = new Map(DAYS.map((d, i) => [d, i]));

function addDays(dateStr, n) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

const clsOf = (x) => (x?.cls && x.cls !== "-" ? String(x.cls).trim() : "");

/**
 * 学年の並び。高校部 → 中学部 → その他 (テスト対策の振替・追加授業の主役が
 * 高校部なので先に出す)。部の中は ALL_GRADES の順、無い学年は名前順。
 */
export function compareGrades(a, b) {
  const rank = (g) => {
    const dept = gradeToDept(String(g || ""));
    return dept === "高校部" ? 0 : dept === "中学部" ? 1 : 2;
  };
  const order = (g) => (GRADE_ORDER.has(g) ? GRADE_ORDER.get(g) : 99);
  return (
    rank(a) - rank(b) ||
    order(a) - order(b) ||
    collator.compare(String(a || ""), String(b || ""))
  );
}

/**
 * 科目名から学校を取り出す ("高松桜井 英語" → "高松桜井")。空白の無い
 * 科目名 ("数学" / "古文漢文") は学校なしの ""。
 */
export function schoolOfSubj(subj) {
  const s = String(subj || "").trim();
  if (!/\s/.test(s)) return "";
  return firstSubjToken(s);
}

/** 同じコースか (学年・クラス・科目) を比べるためのキー。コマにも追加授業にも使える */
export function courseKeyOf(x) {
  return `${String(x?.grade || "").trim()}|${clsOf(x)}|${String(x?.subj || "").trim()}`;
}

function compareCourseSlots(a, b) {
  return (
    compareGrades(a.grade, b.grade) ||
    collator.compare(schoolOfSubj(a.subj), schoolOfSubj(b.subj)) ||
    collator.compare(a.subj || "", b.subj || "") ||
    collator.compare(clsOf(a), clsOf(b)) ||
    (DAY_ORDER.get(a.day) ?? 9) - (DAY_ORDER.get(b.day) ?? 9) ||
    timeStartToMin(a.time) - timeStartToMin(b.time) ||
    a.id - b.id
  );
}

/**
 * コースの候補 = fromDate からの期間に、そのコマの時間割が有効な曜日がある
 * コマ。期切替で残してある旧期のコマ (終了日を入れた時間割) が二重に並ばない
 * ように時間割の有効期間で絞る。休講・テスト期間では絞らない (テスト期間の
 * 週でも追加授業の型には使う)。並びは 学年 → 学校 → 科目 → 曜日 → 時刻。
 *
 * @param {{slots: Array, timetables?: Array, fromDate: string, days?: number}} args
 * @returns {Array} コマ
 */
export function listCourseSlots({ slots, timetables = [], fromDate, days = COURSE_HORIZON_DAYS }) {
  if (!isValidDateStr(fromDate || "")) return [];
  const datesByDay = new Map();
  for (let i = 0; i < days; i++) {
    const d = addDays(fromDate, i);
    const dow = dateToDay(d);
    if (!dow) continue;
    if (!datesByDay.has(dow)) datesByDay.set(dow, []);
    datesByDay.get(dow).push(d);
  }
  const hasTimetables = Array.isArray(timetables) && timetables.length > 0;
  return (slots || [])
    .filter((s) => {
      if (!s || !datesByDay.has(s.day)) return false;
      if (!hasTimetables) return true;
      const tt = timetables.find((t) => t.id === (s.timetableId ?? 1));
      return datesByDay.get(s.day).some((d) => isTimetableActiveForDate(tt, d, s.grade));
    })
    .sort(compareCourseSlots);
}

/** コースの候補に出てくる学年 (compareGrades の順)。 */
export function listCourseGrades(courseSlots) {
  return [...new Set((courseSlots || []).map((s) => s.grade).filter(Boolean))].sort(
    compareGrades
  );
}

/** その学年のコースに出てくる学校 (名前順)。学校の無いコースは含めない。 */
export function listCourseSchools(courseSlots, grade) {
  const set = new Set();
  for (const s of courseSlots || []) {
    if (grade && s.grade !== grade) continue;
    const school = schoolOfSubj(s.subj);
    if (school) set.add(school);
  }
  return [...set].sort(collator.compare);
}

const normalizeQuery = (s) => String(s || "").normalize("NFKC").toLowerCase();

/**
 * 検索語 (空白区切りの AND) にコマが当たるか。学年・クラス・科目 (学校)・
 * 講師・教室・曜日を見る。全角の「高２」も受ける ("高2 桜井 英語")。
 */
export function matchesCourseQuery(slot, query) {
  const terms = normalizeQuery(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = normalizeQuery(
    [
      `${slot.grade || ""}${clsOf(slot)}`,
      slot.subj,
      slot.teacher,
      slot.note,
      slot.room,
      slot.day ? `${slot.day}曜` : "",
    ].join(" ")
  );
  return terms.every((t) => hay.includes(t));
}

/**
 * そのコマの授業がある日 (振替元の候補) を fromDate から count 件。
 * 実施判定は isSlotHeldOnDate + isSlotBeyondCutoff (日まるごと振替と同じ)。
 */
export function upcomingHeldDates(
  slot,
  { ctx, fromDate, count = 8, days = COURSE_HORIZON_DAYS } = {}
) {
  if (!slot || !isValidDateStr(fromDate || "")) return [];
  const out = [];
  for (let i = 0; i < days && out.length < count; i++) {
    const d = addDays(fromDate, i);
    if (dateToDay(d) !== slot.day) continue;
    if (!isSlotHeldOnDate(slot, d, ctx || {})) continue;
    if (isSlotBeyondCutoff(d, slot, ctx?.displayCutoff)) continue;
    out.push(d);
  }
  return out;
}

/**
 * 教室の候補 (時間割・追加授業・振替先に出てくる教室)。数を数として並べる。
 */
export function collectRoomNames(slots = [], extraLessons = [], adjustments = []) {
  const set = new Set();
  const add = (room) => {
    const r = String(room || "").trim();
    if (r && r !== "-") set.add(r);
  };
  for (const s of slots || []) add(s?.room);
  for (const l of extraLessons || []) add(l?.room);
  for (const a of adjustments || []) if (a?.type === "reschedule") add(a.targetRoom);
  return [...set].sort(collator.compare);
}

/**
 * 時間の候補。元のコマの時間を先頭に、その日 (曜日) に時間割が有効な同じ部の
 * コマの時間を開始時刻順で続ける。時刻をコードに固定しない (時程は時間割から)。
 */
export function suggestTimes({ slots, slot, dateStr, timetables = [] }) {
  const out = [];
  const add = (t) => {
    if (t && !out.includes(t)) out.push(t);
  };
  add(slot?.time);
  const dow = dateToDay(dateStr);
  if (!slot || !dow) return out;
  const dept = gradeToDept(String(slot.grade || ""));
  const hasTimetables = Array.isArray(timetables) && timetables.length > 0;
  const times = new Set();
  for (const s of slots || []) {
    if (!s || s.day !== dow || !s.time) continue;
    if (gradeToDept(String(s.grade || "")) !== dept) continue;
    if (hasTimetables) {
      const tt = timetables.find((t) => t.id === (s.timetableId ?? 1));
      if (!isTimetableActiveForDate(tt, dateStr, s.grade)) continue;
    }
    times.add(s.time);
  }
  [...times].sort((a, b) => timeStartToMin(a) - timeStartToMin(b)).forEach(add);
  return out;
}

/**
 * その時間に使われている教室 → 使っている授業のラベル。
 * occupancy は buildDayOccupancy の結果 (振替で入るコマは振替先の教室)。
 */
export function roomUsageAt(occupancy, time) {
  const usage = new Map();
  if (!time) return usage;
  const range = timeRange(time);
  for (const o of occupancy || []) {
    if (!o.room || o.room === "-") continue;
    if (!rangesOverlap(range, timeRange(o.time))) continue;
    if (!usage.has(o.room)) usage.set(o.room, o.label);
  }
  return usage;
}

/**
 * テスト対策の振替のプランを組む (保存はしない)。プレビューと保存の両方で使う。
 *
 * @param {object} args
 * @param {Array} args.slots 全コマ
 * @param {Array} [args.adjustments]
 * @param {Array} [args.extraLessons] 振替先の塞がりに数える
 * @param {Array} [args.subs] 振替元の日の代行 (注意書きに使う)
 * @param {object|null} args.slot 振り替えるコマ
 * @param {string} args.sourceDate 振替元の日
 * @param {string} args.targetDate 振替先の日
 * @param {string} [args.timeInput] 振替先の時間 (空 = 元の時間。開始だけなら元の長さ)
 * @param {string} [args.roomInput] 振替先の教室 (空 = 元の教室)
 * @param {string} [args.teacherInput] 振替先の担当 (空 = 振替元の日の担当)
 * @param {number|null} [args.editingAdjId] 一覧から直している振替 (保存で置き換える)
 * @param {string} [args.today] "YYYY-MM-DD" (注意書き用)
 * @param {object} args.ctx sessionCtx
 * @returns {{
 *   errors: string[], notes: string[],
 *   conflicts: {kind: string, label: string}[],
 *   record: object|null, editingAdjId: number|null,
 *   time: string, room: string, teachers: string[], occupancy: Array,
 * }}
 */
export function buildTestPrepReschedulePlan({
  slots,
  adjustments = [],
  extraLessons = [],
  subs = [],
  slot,
  sourceDate,
  targetDate,
  timeInput = "",
  roomInput = "",
  teacherInput = "",
  editingAdjId = null,
  today = "",
  ctx,
}) {
  const errors = [];
  const notes = [];
  const plan = {
    errors,
    notes,
    conflicts: [],
    record: null,
    editingAdjId,
    time: "",
    room: "",
    teachers: [],
    occupancy: [],
  };
  const c = ctx || {};
  if (!slot) {
    errors.push("コマを選んでください");
    return plan;
  }
  if (!isValidDateStr(sourceDate || "")) {
    errors.push("振替元の日を選んでください");
    return plan;
  }
  if (dateToDay(sourceDate) !== slot.day) {
    errors.push(`${fmtMDWeekday(sourceDate)} は${slot.day}曜ではありません`);
    return plan;
  }
  const held =
    isSlotHeldOnDate(slot, sourceDate, c) &&
    !isSlotBeyondCutoff(sourceDate, slot, c.displayCutoff);
  if (!held) {
    errors.push(
      `${fmtMDWeekday(sourceDate)} はこのコマの授業がありません (${skipReason(slot, sourceDate, c)})`
    );
    return plan;
  }
  const combined = (adjustments || []).some(
    (a) =>
      a?.type === "combine" &&
      a.date === sourceDate &&
      (a.slotId === slot.id || (a.combineSlotIds || []).includes(slot.id))
  );
  if (combined) {
    errors.push(
      `${fmtMDWeekday(sourceDate)} のこのコマは合同になっています (振り替えるなら、先に欠勤組み換えで合同を外してください)`
    );
    return plan;
  }
  if (!isValidDateStr(targetDate || "")) {
    errors.push("振替先の日を選んでください");
    return plan;
  }
  if (targetDate === sourceDate) {
    errors.push("振替先は振替元と別の日にしてください");
    return plan;
  }
  const normalized = normalizeTimeRange(timeInput, {
    durationMin: timeRangeMinutes(slot.time),
  });
  if (!normalized.ok) {
    errors.push(normalized.error);
    return plan;
  }

  const slotRoom = String(slot.room || "").trim();
  const time = normalized.time || slot.time;
  const room = String(roomInput || "").trim() || slotRoom;
  const fromTeachers = activeTeachersOnDate(slot, sourceDate, c);
  const named = splitTeacherField(teacherInput);
  const teachers = named.length > 0 ? named : fromTeachers;
  plan.time = time;
  plan.room = room;
  plan.teachers = teachers;

  const existing =
    (adjustments || []).find(
      (a) => a?.type === "reschedule" && a.date === sourceDate && a.slotId === slot.id
    ) || null;
  const editing =
    editingAdjId != null
      ? (adjustments || []).find((a) => a?.id === editingAdjId && a.type === "reschedule") ||
        null
      : null;
  // 置き換える振替 (同じ振替元の日の同じコマ / 直している振替) は振替先の
  // 塞がりに数えない (自分自身と重なって見えるので)
  const replacing = new Set([existing?.id, editing?.id].filter((id) => id != null));
  const occupancy = buildDayOccupancy({
    slots,
    dateStr: targetDate,
    adjustments: (adjustments || []).filter((a) => !replacing.has(a?.id)),
    extraLessons,
    ctx: c,
  });
  plan.occupancy = occupancy;
  plan.conflicts = findOccupancyConflicts(occupancy, { time, teachers, room });

  // ── 注意書き (止めない。人が見て判断する材料) ──
  if (existing && existing.id !== editing?.id) {
    notes.push(
      `${fmtMDWeekday(sourceDate)} のこのコマはすでに ${describeRescheduleTarget(existing, {
        originalTeacher: slot.teacher,
        originalRoom: slotRoom,
      })} へ振替登録済みです (上書きします)`
    );
  }
  const move = (adjustments || []).find(
    (a) => a?.type === "move" && a.date === sourceDate && a.slotId === slot.id
  );
  if (move) {
    notes.push(`${fmtMDWeekday(sourceDate)} のコマ移動 (→ ${move.targetTime}) は外します`);
  }
  const subsOnSource = (subs || []).filter(
    (s) => s?.date === sourceDate && s.slotId === slot.id
  );
  if (subsOnSource.length > 0) {
    notes.push(
      `${fmtMDWeekday(sourceDate)} にはこのコマの代行・欠勤が ${subsOnSource.length} 件あります (振替先には引き継がれません。要らなければ欠勤組み換えで外してください)`
    );
  }
  if (typeof c.isOffForGrade === "function" && c.isOffForGrade(targetDate, slot.grade, slot.subj)) {
    notes.push("振替先は休講日・テスト期間です (振替のコマは休講日でも表示されます)");
  }
  if (isSlotBeyondCutoff(targetDate, slot, c.displayCutoff)) {
    notes.push("振替先は表示期間の外です (表示期間設定を確認してください)");
  }
  if (targetDate < sourceDate) notes.push("振替先は振替元より前の日付です (前倒しの振替)");
  if (today && targetDate < today) notes.push("振替先は今日より前の日付です (済んだ振替の記録)");

  // 元と同じものは持たない (振替元の表示に時刻・教室・担当が増えないように)
  const record = { date: sourceDate, type: "reschedule", slotId: slot.id, targetDate };
  if (time !== slot.time) record.targetTime = time;
  if (room && room !== slotRoom) record.targetRoom = room;
  if (named.length > 0 && named.join("·") !== fromTeachers.join("·")) {
    record.targetTeacher = named.join("·");
  }
  plan.record = record;
  return plan;
}

/**
 * 振替のプランを adjustments へ適用した結果を返す (保存はしない)。
 * 同じ振替元の日の同じコマの振替・コマ移動と、直している振替は置き換える。
 * 書き込む時点の配列を渡すこと (保存の updater の中で呼ぶ)。
 *
 * @param {{adjustments: Array, plan: object, memo?: string, now?: string}} args
 * @returns {{next: Array, added: object|null, removed: Array}}
 */
export function applyTestPrepReschedule({
  adjustments = [],
  plan,
  memo = "",
  now = new Date().toISOString(),
}) {
  const record = plan?.record;
  if (!record || (plan.errors || []).length > 0) {
    return { next: adjustments, added: null, removed: [] };
  }
  const removed = adjustments.filter(
    (a) =>
      (a?.slotId === record.slotId &&
        a.date === record.date &&
        (a.type === "reschedule" || a.type === "move")) ||
      (plan.editingAdjId != null && a?.id === plan.editingAdjId && a.type === "reschedule")
  );
  const removedIds = new Set(removed.map((a) => a.id));
  // id は消したものも含めた最大 + 1 (消した振替の id を新しい振替に使い回さない)
  const added = {
    ...record,
    id: nextNumericId(adjustments),
    memo: String(memo || "").trim(),
    createdAt: now,
  };
  // 同じコマを同じ振替先へ登録し直すなら、振替先での合同 (combineWith) を
  // 引き継ぐ (時刻や教室を直しただけで合同が外れないように)
  const same = removed.find(
    (a) =>
      a.type === "reschedule" &&
      a.combineWith &&
      a.slotId === record.slotId &&
      a.targetDate === record.targetDate
  );
  if (same) added.combineWith = same.combineWith;
  return {
    next: [...adjustments.filter((a) => !removedIds.has(a.id)), added],
    added,
    removed,
  };
}

/**
 * テスト対策の追加授業のプランを組む (保存はしない)。コマを「型」にして、
 * 学年・クラス・科目・担当を写す。
 *
 * @param {object} args
 * @param {Array} args.slots
 * @param {Array} [args.adjustments]
 * @param {Array} [args.extraLessons]
 * @param {object|null} args.template 型にするコマ
 * @param {string[]} args.dates 実施日
 * @param {string} args.timeInput 時間 (必須。開始だけなら型のコマの長さ)
 * @param {string} [args.roomInput]
 * @param {string} [args.teacherInput]
 * @param {string} [args.label] 種別ラベル
 * @param {string} [args.note] メモ
 * @param {number|null} [args.editingId] 一覧から直している追加授業
 * @param {string} [args.today]
 * @param {object} args.ctx sessionCtx
 * @returns {{errors: string[], notes: string[],
 *   conflictsByDate: {date: string, conflicts: object[]}[],
 *   records: object[], editingId: number|null, time: string}}
 */
export function buildTestPrepExtraPlan({
  slots,
  adjustments = [],
  extraLessons = [],
  template,
  dates = [],
  timeInput = "",
  roomInput = "",
  teacherInput = "",
  label = "",
  note = "",
  editingId = null,
  today = "",
  ctx,
}) {
  const errors = [];
  const notes = [];
  const plan = { errors, notes, conflictsByDate: [], records: [], editingId, time: "" };
  if (!template) {
    errors.push("型にするコマを選んでください");
    return plan;
  }
  const ds = [...new Set((dates || []).filter((d) => isValidDateStr(d || "")))].sort();
  if (ds.length === 0) {
    errors.push("実施日を選んでください");
    return plan;
  }
  if (editingId != null && ds.length > 1) {
    errors.push("登録済みの追加授業を直すときは実施日を 1 日にしてください");
    return plan;
  }
  const normalized = normalizeTimeRange(timeInput, {
    durationMin: timeRangeMinutes(template.time),
  });
  if (!normalized.ok) {
    errors.push(normalized.error);
    return plan;
  }
  if (!normalized.time) {
    errors.push("時間を入れてください (例: 17:00-18:00)");
    return plan;
  }
  const time = normalized.time;
  plan.time = time;
  const room = String(roomInput || "").trim();
  const teachers = splitTeacherField(teacherInput);
  const base = {
    time,
    grade: String(template.grade || "").trim(),
    cls: clsOf(template),
    room,
    subj: String(template.subj || "").trim(),
    // 複数講師の区切りは正史の "·" に揃える (CLAUDE.md)
    teacher: teachers.join("·"),
    label: String(label || "").trim(),
    note: String(note || "").trim(),
  };
  plan.records = ds.map((date) => ({ date, ...base }));

  const key = courseKeyOf(template);
  const others = (extraLessons || []).filter((l) => l && l.id !== editingId);
  for (const date of ds) {
    const occupancy = buildDayOccupancy({
      slots,
      dateStr: date,
      adjustments,
      extraLessons: others,
      ctx: ctx || {},
    });
    const conflicts = findOccupancyConflicts(occupancy, { time, teachers, room });
    if (conflicts.length > 0) plan.conflictsByDate.push({ date, conflicts });
  }
  const sameDay = ds.filter((date) =>
    others.some((l) => l.date === date && courseKeyOf(l) === key)
  );
  if (sameDay.length > 0) {
    notes.push(
      `${sameDay.map(fmtMDWeekday).join("・")} にはこのコースの追加授業がすでにあります`
    );
  }
  if (today && ds.some((d) => d < today)) {
    notes.push("今日より前の日が入っています (済んだ授業の記録)");
  }
  return plan;
}

/**
 * 追加授業のプランを extraLessons へ適用した結果を返す (保存はしない)。
 * 直している追加授業はその 1 件を書き換える。書き込む時点の配列を渡すこと。
 *
 * @returns {{next: Array, added: Array, updated: object|null, before: object|null}}
 */
export function applyTestPrepExtra({ extraLessons = [], plan }) {
  const empty = { next: extraLessons, added: [], updated: null, before: null };
  if (!plan?.records?.length || (plan.errors || []).length > 0) return empty;
  if (plan.editingId != null) {
    const before = extraLessons.find((l) => l.id === plan.editingId);
    if (!before) return empty;
    const updated = { ...before, ...plan.records[0], id: before.id };
    return {
      next: extraLessons.map((l) => (l.id === before.id ? updated : l)),
      added: [],
      updated,
      before,
    };
  }
  let id = nextNumericId(extraLessons);
  const added = plan.records.map((r) => ({ id: id++, ...r }));
  return { next: [...extraLessons, ...added], added, updated: null, before: null };
}

/**
 * コース (または学校・学年) の振替・追加授業の一覧 (fromDate 以降に関わるもの)。
 * 振替は振替先の日、追加授業は実施日で並べる。
 *
 * @param {{adjustments?: Array, extraLessons?: Array, slots?: Array,
 *          matchCourse: (x: object) => boolean, fromDate?: string}} args
 *   matchCourse はコマ / 追加授業を受け取る (どちらも grade / cls / subj を持つ)
 * @returns {({kind: "reschedule", key: string, date: string, time: string, adj: object, slot: object}
 *          | {kind: "extra", key: string, date: string, time: string, lesson: object})[]}
 */
export function collectCourseChanges({
  adjustments = [],
  extraLessons = [],
  slots = [],
  matchCourse,
  fromDate = "",
}) {
  const slotById = new Map((slots || []).map((s) => [s.id, s]));
  const out = [];
  for (const adj of adjustments || []) {
    if (adj?.type !== "reschedule" || !adj.targetDate) continue;
    const slot = slotById.get(adj.slotId);
    if (!slot || !matchCourse(slot)) continue;
    if (fromDate && adj.targetDate < fromDate && adj.date < fromDate) continue;
    out.push({
      kind: "reschedule",
      key: `rs:${adj.id}`,
      date: adj.targetDate,
      time: adj.targetTime || slot.time,
      adj,
      slot,
    });
  }
  for (const lesson of extraLessons || []) {
    if (!lesson?.date || !matchCourse(lesson)) continue;
    if (fromDate && lesson.date < fromDate) continue;
    out.push({
      kind: "extra",
      key: `extra:${lesson.id}`,
      date: lesson.date,
      time: lesson.time,
      lesson,
    });
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      timeStartToMin(a.time) - timeStartToMin(b.time) ||
      a.key.localeCompare(b.key)
  );
}
