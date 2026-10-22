// ─── Data migration helpers ─────────────────────────────────────────
// Pure data-transformation functions used during localStorage load
// (useSyncedStorage migrate option) and JSON import (useDataIO).

import { SPECIAL_EVENT_TYPES } from "../constants/specialEvents";
import { upgradeSpecialEventType } from "./specialEventTypes";
import { isValidDateStr } from "./dateHelpers";

const VALID_SPECIAL_EVENT_TYPES = new Set(SPECIAL_EVENT_TYPES.map((t) => t.key));

/** Add default `scope`, `id`, `targetGrades`, `subjKeywords` to legacy holidays. */
export const migrateHolidays = (arr) =>
  Array.isArray(arr)
    ? arr.map((x, i) => ({
        ...x,
        id: typeof x.id === "number" ? x.id : i + 1,
        scope: x.scope || ["全部"],
        targetGrades: Array.isArray(x.targetGrades) ? x.targetGrades : [],
        subjKeywords: Array.isArray(x.subjKeywords) ? x.subjKeywords : [],
      }))
    : arr;

/** Convert legacy string[] staff to PartTimeStaffObject[]. */
export const migratePartTimeStaff = (arr) =>
  Array.isArray(arr)
    ? arr.map((x) =>
        typeof x === "string"
          ? { name: x, subjectIds: [] }
          : { name: x?.name ?? "", subjectIds: Array.isArray(x?.subjectIds) ? x.subjectIds : [] }
      )
    : arr;

/** Rename legacy "completed" status to "confirmed". */
export const migrateSubs = (arr) =>
  Array.isArray(arr)
    ? arr.map((s) => (s?.status === "completed" ? { ...s, status: "confirmed" } : s))
    : arr;

/**
 * Restore `targetGrades: []` (全学年モード) dropped by Firebase RTDB.
 * Firebase RTDB discards empty arrays on write, so exam periods saved
 * with the "全学年" option come back missing `targetGrades` and cause
 * a render crash in ExamPeriodManager.
 */
export const migrateExamPeriods = (arr) =>
  Array.isArray(arr)
    ? arr.map((ep) => {
        const out = {
          ...ep,
          targetGrades: Array.isArray(ep?.targetGrades) ? ep.targetGrades : [],
        };
        // 考査日 (表示専用) は昇順・重複なし・期間内の正しい日付だけ。空なら
        // キーごと持たない (RTDB は空配列を消すので、空と未設定を区別しない)
        if ("examDates" in out) {
          const dates = normalizeExamDates(out.examDates, out.startDate, out.endDate);
          if (dates.length > 0) out.examDates = dates;
          else delete out.examDates;
        }
        return out;
      })
    : arr;

/**
 * テスト期間の考査日を整える: 文字列で正しい日付のものだけ、startDate〜endDate
 * (endDate が無ければ startDate) の範囲内、昇順・重複なし。冪等。
 */
export function normalizeExamDates(raw, startDate, endDate) {
  if (!Array.isArray(raw)) return [];
  const from = typeof startDate === "string" ? startDate : "";
  const to = typeof endDate === "string" && endDate ? endDate : from;
  const set = new Set();
  for (const d of raw) {
    if (typeof d !== "string" || !isValidDateStr(d)) continue;
    if (from && d < from) continue;
    if (to && d > to) continue;
    set.add(d);
  }
  return [...set].sort();
}

/**
 * Restore `targetGrades: []` dropped by Firebase RTDB and ensure each
 * special event has every required field (id, eventType, memo).
 * v23 までの種別・タグで仮置きした種別は v24 の種別へ寄せる
 * (utils/specialEventTypes。冪等なので毎回の読み込みで通してよい)。
 * 未知の eventType は "other" に落とす — 新しい種別を足すときは
 * SPECIAL_EVENT_TYPES に必ず入れること (古い版の端末は新しい種別を
 * "other" に潰すので、リリース後は全端末で再読み込みしてもらう)。
 */
export const migrateSpecialEvents = (arr) =>
  Array.isArray(arr)
    ? arr.map(upgradeSpecialEventType).map((ev, i) => ({
        ...ev,
        id: typeof ev?.id === "number" ? ev.id : i + 1,
        name: typeof ev?.name === "string" ? ev.name : "",
        startDate: typeof ev?.startDate === "string" ? ev.startDate : "",
        endDate:
          typeof ev?.endDate === "string" && ev.endDate
            ? ev.endDate
            : typeof ev?.startDate === "string"
              ? ev.startDate
              : "",
        eventType: VALID_SPECIAL_EVENT_TYPES.has(ev?.eventType)
          ? ev.eventType
          : "other",
        targetGrades: Array.isArray(ev?.targetGrades) ? ev.targetGrades : [],
        memo: typeof ev?.memo === "string" ? ev.memo : "",
      }))
    : arr;

/**
 * Restore array/string fields dropped by Firebase RTDB for 特別時程.
 * RTDB discards empty arrays on write (targetGrades / timeMap /
 * cancelTimes が空のまま保存され得る) ので、読み込み時に必ず配列へ
 * 戻す。id / date / label / memo も型を揃える。
 */
export const migrateDaySchedules = (arr) =>
  Array.isArray(arr)
    ? arr.map((d, i) => ({
        ...d,
        id: typeof d?.id === "number" ? d.id : i + 1,
        date: typeof d?.date === "string" ? d.date : "",
        label: typeof d?.label === "string" ? d.label : "",
        targetGrades: Array.isArray(d?.targetGrades) ? d.targetGrades : [],
        timeMap: Array.isArray(d?.timeMap) ? d.timeMap : [],
        cancelTimes: Array.isArray(d?.cancelTimes) ? d.cancelTimes : [],
        memo: typeof d?.memo === "string" ? d.memo : "",
      }))
    : arr;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/**
 * 確認テスト 1 件 (その日・その学年) を整える。形にならないものは null。
 * 「なし」は none: true (空配列は RTDB が消すので意味を持たせない)。
 * none と subjects が両方あるときは none を採る (明示的に「なし」と
 * 決めたものを、残骸の科目で上書きしない)。
 */
export const normalizeFuzokuTestEntry = (e) => {
  if (!isPlainObject(e)) return null;
  if (e.none === true) return { none: true };
  const list = Array.isArray(e.subjects) ? e.subjects : [];
  const subjects = [];
  for (const s of list) {
    const v = typeof s === "string" ? s.trim() : "";
    if (v && !subjects.includes(v)) subjects.push(v);
  }
  return subjects.length > 0 ? { subjects } : null;
};

/**
 * 附属の授業予定 (fuzokuPlan: 学校メモ + 確認テストの手動指定) を整える。
 * RTDB は空の map を消して返すので notes / tests を必ず補う。日付でない
 * キー・中身の空なメモ・形にならない科目指定は捨てる (冪等)。
 * undefined を含めない (Firebase の set() が例外を投げる)。
 */
export const migrateFuzokuPlan = (raw) => {
  const src = isPlainObject(raw) ? raw : {};
  const notes = {};
  if (isPlainObject(src.notes)) {
    for (const [date, n] of Object.entries(src.notes)) {
      if (!ISO_DATE_RE.test(date) || !isPlainObject(n)) continue;
      const bus = typeof n.bus === "string" ? n.bus.trim() : "";
      const memo = typeof n.memo === "string" ? n.memo.trim() : "";
      if (!bus && !memo) continue;
      notes[date] = { ...(bus ? { bus } : {}), ...(memo ? { memo } : {}) };
    }
  }
  const tests = {};
  if (isPlainObject(src.tests)) {
    for (const [date, byGrade] of Object.entries(src.tests)) {
      if (!ISO_DATE_RE.test(date) || !isPlainObject(byGrade)) continue;
      const out = {};
      for (const [grade, e] of Object.entries(byGrade)) {
        const entry = normalizeFuzokuTestEntry(e);
        if (grade && entry) out[grade] = entry;
      }
      if (Object.keys(out).length > 0) tests[date] = out;
    }
  }
  return { notes, tests };
};

/**
 * Ensure displayCutoff carries a `cohorts` array. Firebase RTDB discards
 * empty arrays on write, and data saved before v14 predates the field, so
 * displayCutoff comes back with `cohorts` missing. Backfill `[]` so the
 * loaded shape matches DEFAULT_DISPLAY_CUTOFF and the v14 schema.
 * Returns the value unchanged when it is not a well-formed cutoff object
 * (consumers / the default value handle that case).
 */
export const migrateDisplayCutoff = (dc) =>
  dc && typeof dc === "object" && Array.isArray(dc.groups)
    ? { ...dc, cohorts: Array.isArray(dc.cohorts) ? dc.cohorts : [] }
    : dc;

/**
 * Restore `assignments: {}` dropped by Firebase RTDB.
 * Firebase RTDB discards empty objects/arrays on write, so days
 * initialized via `blankDay` come back missing `assignments` (and
 * potentially `periods` if somehow emptied), crashing the editor.
 */
export const migrateExamPrepSchedules = (arr) =>
  Array.isArray(arr)
    ? arr.map((s) => ({
        ...s,
        days: Array.isArray(s?.days)
          ? s.days.map((d) => ({
              ...d,
              periods: Array.isArray(d?.periods) ? d.periods : [],
              assignments: d?.assignments ?? {},
            }))
          : [],
      }))
    : arr;
