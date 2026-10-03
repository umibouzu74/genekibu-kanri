// ─── 期間内の授業時間 (分) の集計 ─────────────────────────────────
// 給与を「コマ数」ではなく「分」で計算する講師のために、期間
// [startDate, endDate] に**実際に教えた**時間を講師ごとに合計する
// (講師比較の画面を置き換えた「授業時間の集計」ビュー)。
//
// 「その日に実際に教える人」は utils/teacherConflicts.collectTeacherAssignments
// と同じ決め方 (画面ごとに書き起こさない):
//   - 対象のコマ = 曜日・休講 / テスト期間 (isOffForGrade)・特別時程の部分休講と
//     コマ休講 (isSlotCancelledOnDate)・時間割の有効期間・表示期間で絞った後
//     (日別ダッシュボードと同じ絞り込み)
//   - 元講師は隔週 A/B を解決した後。代行 / 欠勤レコードのある人は外し、
//     代行者を足す (代行者が空の欠勤は誰にも付かない)
//   - 時刻は移動・特別時程を反映した実効時刻
//   - 振替で他日へ出るコマ・合同で吸収された側は数えない。振替で他日から
//     入ってくるコマは振替先の日に数える (担当は targetTeacher、無ければ
//     元の担当。月間カレンダーと同じ)
// 加えて、日付を明示して登録した追加授業・講習コマ (講習時間割作成から)・
// テスト期間の特訓シフト (校時ごとの開始・終了) も種別を分けて数える。
// 他校舎の授業は塾の授業ではないので数えない。
//
// 分は「開始-終了」の差。終了時刻の読めないコマは分を足さず件数だけ
// (noTime) 数えて画面で知らせる (黙って 0 分にしない)。代行が決まらない
// まま (代行未定) の欠勤は誰の時間にもならないので、これも一覧で知らせる。
//
// 「合計」に何を含めるかは呼び出し側が種別で選ぶ (講習・特訓を別の単価で
// 払う運用があるため)。種別ごとの分は選択に関係なく行に持っておき、合計・
// コマ数・出勤日数は summarizeTeacherRow で選んだ種別だけから出す。

import { activeTeachersOnDate } from "./absenceHelpers";
import { buildAdjustmentIndex, rescheduleTargetTeachers } from "./adjustmentDisplay";
import { splitTeacherField } from "./biweekly";
import { dateToDay, eachDateStrInRange, fmtDate } from "./dateHelpers";
import { getDaySchedulesForDate } from "./daySchedules";
import { buildCancelIndex, isSlotCancelledOnDate } from "./slotCancel";
import { hasSubstitute, needsSubstitute, SUB_STATE, subState } from "./substituteState";
import {
  getCutoffGroupLabelsWithSlots,
  getDayCutoffKind,
  isSlotBeyondCutoff,
  isTimetableActiveForDate,
} from "./timetable";

export const MINUTE_KINDS = ["own", "sub", "extra", "koshu", "prep"];
export const MINUTE_KIND_LABELS = {
  own: "通常授業",
  sub: "代行",
  extra: "追加授業",
  koshu: "講習",
  prep: "特訓",
};

const zeroByKind = () => Object.fromEntries(MINUTE_KINDS.map((k) => [k, 0]));

// 期間の上限 (日)。誤って何年分も指定したときに画面が固まらないように
export const MAX_RANGE_DAYS = 400;

const HM_RE = /^\s*(\d{1,2}):(\d{2})/;
function hmToMin(text) {
  const m = HM_RE.exec(String(text || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * "19:50-20:35" → 45。終了が無い / 読めない / 開始以前なら null。
 * @param {string} time
 * @returns {number|null}
 */
export function lessonMinutes(time) {
  const parts = String(time || "").split("-");
  const start = hmToMin(parts[0]);
  const end = hmToMin(parts[1]);
  if (start == null || end == null || end <= start) return null;
  return end - start;
}

/** 分 → "12時間30分" / "45分" / "0分"。 */
export function formatMinutes(min) {
  const n = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/** 分 → 時間 (小数 2 桁)。給与計算に写す用 */
export function minutesToHours(min) {
  return Math.round(((Number(min) || 0) / 60) * 100) / 100;
}

function describeLesson(grade, cls, subj) {
  const c = cls && cls !== "-" ? cls : "";
  return `${grade || ""}${c} ${subj || ""}`.trim();
}

function emptyRow(teacher) {
  return {
    teacher,
    // 種別ごとの分と件数 (合計に含めるかどうかに関係なく全種別)
    byKind: zeroByKind(),
    countByKind: zeroByKind(),
    entries: [],
  };
}

/**
 * 講師 1 人ぶんの合計。included に入っている種別だけから出す。
 * @param {ReturnType<typeof emptyRow>|undefined} row
 * @param {Iterable<string>} [included] 合計に含める種別 (既定 = 全種別)
 * @returns {{total: number, count: number, days: number, noTime: number, unconfirmed: number}}
 */
export function summarizeTeacherRow(row, included = MINUTE_KINDS) {
  const out = { total: 0, count: 0, days: 0, noTime: 0, unconfirmed: 0 };
  if (!row) return out;
  const inc = included instanceof Set ? included : new Set(included);
  const days = new Set();
  for (const e of row.entries) {
    if (!inc.has(e.kind)) continue;
    out.count += 1;
    days.add(e.date);
    if (e.minutes == null) out.noTime += 1;
    else out.total += e.minutes;
    if (e.unconfirmed) out.unconfirmed += 1;
  }
  out.days = days.size;
  return out;
}

/**
 * 期間内に講師ごとに教えた時間を集計する。
 *
 * @param {object} args
 * @param {string} args.startDate "YYYY-MM-DD"
 * @param {string} args.endDate "YYYY-MM-DD" (含む)
 * @param {Array} args.slots 全コマ (時間割で絞らない。有効期間は日付ごとに見る)
 * @param {Array} [args.subs]
 * @param {Array} [args.adjustments]
 * @param {Array} [args.daySchedules]
 * @param {Array} [args.timetables]
 * @param {object} [args.displayCutoff]
 * @param {(date: string, grade: string, subj: string) => boolean} [args.isOffForGrade]
 * @param {Array} [args.biweeklyAnchors]
 * @param {Array} [args.holidays]
 * @param {Array} [args.examPeriods]
 * @param {Array} [args.extraLessons]
 * @param {Array} [args.koshuLessons] buildKoshuLessons の結果 (kind="koshu" だけ数える)
 * @param {Array} [args.examPrepSchedules] 特訓シフト (テスト期間内の日だけ数える)
 * @returns {{
 *   rows: Map<string, ReturnType<typeof emptyRow>>,
 *   pendingAbsences: {date: string, time: string, label: string, teacher: string}[],
 *   days: number,
 *   truncated: boolean,
 * }}
 *   pendingAbsences = 代行未定のまま (誰の時間にもなっていない) 欠勤
 */
export function computeTeachingMinutes(args) {
  const {
    startDate,
    endDate,
    slots = [],
    subs = [],
    adjustments = [],
    daySchedules = [],
    timetables = [],
    displayCutoff,
    isOffForGrade = () => false,
    biweeklyAnchors = [],
    holidays = [],
    examPeriods = [],
    extraLessons = [],
    koshuLessons = [],
    examPrepSchedules = [],
  } = args || {};

  const rows = new Map();
  const pendingAbsences = [];
  let dates = eachDateStrInRange(startDate, endDate);
  const truncated = dates.length > MAX_RANGE_DAYS;
  if (truncated) dates = dates.slice(0, MAX_RANGE_DAYS);
  if (dates.length === 0) return { rows, pendingAbsences, days: 0, truncated };
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  const slotById = new Map(slots.map((s) => [s.id, s]));
  const byDay = new Map();
  for (const s of slots) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day).push(s);
  }
  // (日付, コマ) → 代行 / 欠勤レコード
  const subsByKey = new Map();
  for (const r of subs || []) {
    if (!r || !r.date || r.date < firstDate || r.date > lastDate) continue;
    const k = `${r.date}|${r.slotId}`;
    if (!subsByKey.has(k)) subsByKey.set(k, []);
    subsByKey.get(k).push(r);
  }
  const extraByDate = new Map();
  for (const l of extraLessons || []) {
    if (!l?.date) continue;
    if (!extraByDate.has(l.date)) extraByDate.set(l.date, []);
    extraByDate.get(l.date).push(l);
  }
  const koshuByDate = new Map();
  for (const l of koshuLessons || []) {
    if (!l?.date || l.kind !== "koshu") continue;
    if (!koshuByDate.has(l.date)) koshuByDate.set(l.date, []);
    koshuByDate.get(l.date).push(l);
  }
  const activeGroupLabels = getCutoffGroupLabelsWithSlots(slots, displayCutoff);
  // コマ休講の索引 (日付 × コマのループなので、毎回 adjustments を走査しない)
  const cancelCtx = { daySchedules, adjustments, _cancelIndex: buildCancelIndex(adjustments) };
  const teacherCtx = { biweeklyAnchors, holidays, examPeriods };
  const timetableById = new Map((timetables || []).map((t) => [t.id, t]));

  // 同じ講師・同じ日・同じ時刻・同じ授業の二重登録は 1 回だけ数える
  const seen = new Set();
  const add = (teacher, date, time, kind, label, extra = {}) => {
    const name = String(teacher || "").trim();
    if (!name) return;
    const key = `${name}|${date}|${time}|${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!rows.has(name)) rows.set(name, emptyRow(name));
    const row = rows.get(name);
    const min = lessonMinutes(time);
    row.countByKind[kind] += 1;
    if (min != null) row.byKind[kind] += min;
    row.entries.push({ date, time, minutes: min, kind, label, ...extra });
  };

  for (const date of dates) {
    const dow = dateToDay(date);
    const dayCutoff = getDayCutoffKind(date, displayCutoff, { activeGroupLabels }) != null;
    const daySlots =
      dayCutoff || !dow
        ? []
        : (byDay.get(dow) || []).filter(
            (s) =>
              !isOffForGrade(date, s.grade, s.subj) &&
              !isSlotCancelledOnDate(s, date, cancelCtx) &&
              (timetableById.size === 0 ||
                isTimetableActiveForDate(
                  timetableById.get(s.timetableId ?? 1),
                  date,
                  s.grade
                )) &&
              !isSlotBeyondCutoff(date, s, displayCutoff)
          );
    const adjIndex = buildAdjustmentIndex(adjustments, date, {
      slots: daySlots,
      daySchedules: getDaySchedulesForDate(daySchedules, date),
    });

    for (const slot of daySlots) {
      if (adjIndex.rescheduleOutBySlot.has(slot.id)) continue;
      if (adjIndex.combineAbsorbedBySlot.has(slot.id)) continue;
      const time = adjIndex.moveBySlot.get(slot.id) || slot.time || "";
      const label = describeLesson(slot.grade, slot.cls, slot.subj);
      // 代行者 = 元講師のレコードは「担当のまま」(teacherDayOff と同じ読み方)
      const recs = (subsByKey.get(`${date}|${slot.id}`) || []).filter(
        (r) => r.substitute !== r.originalTeacher
      );
      const away = new Set(recs.map((r) => r.originalTeacher).filter(Boolean));
      for (const t of activeTeachersOnDate(slot, date, teacherCtx)) {
        if (!t || away.has(t)) continue;
        add(t, date, time, "own", label, { slotId: slot.id });
      }
      for (const r of recs) {
        if (!hasSubstitute(r)) {
          // 代行未定 = 誰の時間にもなっていない。代行なしで確定 (残りの担当者で
          // 回す) は意図どおりなので知らせない
          if (needsSubstitute(r)) {
            pendingAbsences.push({ date, time, label, teacher: r.originalTeacher || "" });
          }
          continue;
        }
        add(r.substitute, date, time, "sub", label, {
          slotId: slot.id,
          originalTeacher: r.originalTeacher || "",
          unconfirmed: subState(r) === SUB_STATE.REQUESTED,
        });
      }
    }

    // 他日から振替で入ってくるコマ (休講日でも数える。日まるごと振替の
    // 受け先は休みの日が典型)。表示期間外の日は月間カレンダーと同じく出さない
    if (!dayCutoff) {
      for (const adj of adjIndex.rescheduleInBySlot.values()) {
        const slot = slotById.get(adj.slotId);
        if (!slot) continue;
        const time = adj.targetTime || slot.time || "";
        const label = describeLesson(slot.grade, slot.cls, slot.subj);
        for (const t of rescheduleTargetTeachers(adj, slot, teacherCtx)) {
          add(t, date, time, "own", label, { slotId: slot.id, rescheduledFrom: adj.date });
        }
      }
      for (const l of extraByDate.get(date) || []) {
        const label = describeLesson(l.grade, l.cls, l.subj);
        for (const t of splitTeacherField(l.teacher || "")) {
          add(t, date, l.time || "", "extra", label);
        }
      }
    }
    // 講習は通常の表示期間の外にあるのが常なのでカットオフでも数える
    for (const l of koshuByDate.get(date) || []) {
      add(l.teacher, date, l.time || "", "koshu", describeLesson(l.grade, l.cls, l.subj));
    }
  }

  // 特訓シフト。月間カレンダーと同じく、テスト期間の範囲内の日だけ
  // (assignments は名前 → 出勤する校時 no の配列)
  const examPeriodById = new Map((examPeriods || []).map((ep) => [ep.id, ep]));
  for (const sch of examPrepSchedules || []) {
    const ep = examPeriodById.get(sch?.examPeriodId);
    if (!ep?.startDate || !ep?.endDate) continue;
    for (const day of sch.days || []) {
      const d = day?.date;
      if (!d || d < firstDate || d > lastDate) continue;
      if (d < ep.startDate || d > ep.endDate) continue;
      const periodByNo = new Map((day.periods || []).map((p) => [p.no, p]));
      for (const [name, nos] of Object.entries(day.assignments || {})) {
        if (!Array.isArray(nos)) continue;
        for (const no of nos) {
          const p = periodByNo.get(no);
          if (!p) continue;
          const time = p.start && p.end ? `${p.start}-${p.end}` : p.start || "";
          add(name, d, time, "prep", `${ep.name || "テスト期間"} 特訓 ${no}校時`);
        }
      }
    }
  }

  for (const row of rows.values()) {
    row.entries.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (hmToMin(a.time) ?? 9999) - (hmToMin(b.time) ?? 9999)
    );
  }
  pendingAbsences.sort(
    (a, b) => a.date.localeCompare(b.date) || (hmToMin(a.time) ?? 9999) - (hmToMin(b.time) ?? 9999)
  );
  return { rows, pendingAbsences, days: dates.length, truncated };
}

/**
 * 給与計算に写す CSV の行 (講師ごとの合計)。teachers に並べた順で、
 * 期間内に授業の無い講師も 0 で出す (選んだ人が黙って消えないように)。
 * 合計・コマ数・出勤日数は included の種別だけ、種別ごとの列は全種別。
 */
export function teachingMinutesSummaryRows(rows, teachers, included = MINUTE_KINDS) {
  const headers = [
    "講師",
    "合計(分)",
    "合計(時間)",
    ...MINUTE_KINDS.map((k) => `${MINUTE_KIND_LABELS[k]}(分)`),
    "コマ数",
    "出勤日数",
    "時刻不明のコマ",
  ];
  const body = teachers.map((t) => {
    const r = rows.get(t);
    const sum = summarizeTeacherRow(r, included);
    return [
      t,
      sum.total,
      minutesToHours(sum.total),
      ...MINUTE_KINDS.map((k) => r?.byKind[k] ?? 0),
      sum.count,
      sum.days,
      sum.noTime,
    ];
  });
  return { headers, body };
}

/**
 * 明細の CSV の行 (1 コマ 1 行)。全種別を出し、最後の列で合計に含めたかを示す
 * (Excel で絞り込めば合計と突き合わせられる)。
 */
export function teachingMinutesDetailRows(rows, teachers, included = MINUTE_KINDS) {
  const inc = new Set(included);
  const headers = ["講師", "日付", "曜日", "時間帯", "分", "種別", "授業", "備考", "合計に含める"];
  const body = [];
  for (const t of teachers) {
    const r = rows.get(t);
    if (!r) continue;
    for (const e of r.entries) {
      body.push([
        r.teacher,
        e.date,
        dateToDay(e.date) || "日",
        e.time,
        e.minutes ?? "",
        MINUTE_KIND_LABELS[e.kind],
        e.label,
        describeEntryNotes(e).join(" / "),
        inc.has(e.kind) ? "○" : "",
      ]);
    }
  }
  return { headers, body };
}

/** 明細 1 行の備考 (代行元・未確定・振替元)。画面と CSV で共有する。 */
export function describeEntryNotes(e) {
  const notes = [];
  if (e.originalTeacher) notes.push(`${e.originalTeacher} の代行`);
  if (e.unconfirmed) notes.push("代行未確定");
  if (e.rescheduledFrom) notes.push(`${e.rescheduledFrom} から振替`);
  return notes;
}

/**
 * 締め日つきの月の期間。closingDay = 0 は末日締め (1 日〜末日)。
 * 20 なら「前月 21 日〜当月 20 日」(給与の締めに合わせる)。
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} [closingDay]
 * @returns {{startDate: string, endDate: string}}
 */
export function monthPeriod(year, month, closingDay = 0) {
  if (!closingDay) {
    return {
      startDate: fmtDate(new Date(year, month - 1, 1)),
      endDate: fmtDate(new Date(year, month, 0)),
    };
  }
  // 締め日が月の日数を超える月 (2 月の 30 日締め等) は末日で締める
  const lastOf = (y, m) => new Date(y, m, 0).getDate();
  const end = new Date(year, month - 1, Math.min(closingDay, lastOf(year, month)));
  const prevEnd = new Date(year, month - 2, Math.min(closingDay, lastOf(year, month - 1)));
  prevEnd.setDate(prevEnd.getDate() + 1);
  return { startDate: fmtDate(prevEnd), endDate: fmtDate(end) };
}

/**
 * その日を含む「◯月分」。締め日を過ぎていれば翌月分
 * (20 日締めの 10/25 は 11 月分 = 10/21〜11/20)。
 * @param {string} todayStr "YYYY-MM-DD"
 * @param {number} [closingDay]
 * @returns {{y: number, m: number}}
 */
export function currentPeriodYm(todayStr, closingDay = 0) {
  const [y, m, d] = String(todayStr || "").split("-").map(Number);
  if (!y || !m || !d) return { y: NaN, m: NaN };
  if (closingDay && d > Math.min(closingDay, new Date(y, m, 0).getDate())) {
    return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  }
  return { y, m };
}
