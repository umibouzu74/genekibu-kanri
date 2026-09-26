// ─── Timetable / display-cutoff filtering utilities ─────────────────
// All date strings are "YYYY-MM-DD".

import { findCohortCutoff } from "./cohorts";
import { DAYS } from "../constants/schools";

/**
 * Check if a slot's grade matches a timetable's grade list.
 * Handles combined grades like "中1-3" by checking if ANY of the
 * expanded grades match.
 * @param {string} slotGrade
 * @param {string[]} timetableGrades - empty array means "all grades"
 * @returns {boolean}
 */
export function gradeMatchesTimetable(slotGrade, timetableGrades) {
  if (!timetableGrades || timetableGrades.length === 0) return true;

  // Direct match
  if (timetableGrades.includes(slotGrade)) return true;

  // Expand combined grades like "中1-3" → ["中1","中2","中3"]
  const expanded = expandGradeRange(slotGrade);
  if (expanded.length > 1) {
    return expanded.some((g) => timetableGrades.includes(g));
  }

  return false;
}

/**
 * Expand a grade range like "中1-3" into ["中1","中2","中3"].
 * Returns [grade] as-is if no range pattern detected.
 * @param {string} grade
 * @returns {string[]}
 */
export function expandGradeRange(grade) {
  const m = grade.match(/^(.+?)(\d+)-(\d+)$/);
  if (!m) return [grade];
  const prefix = m[1];
  const lo = parseInt(m[2], 10);
  const hi = parseInt(m[3], 10);
  if (lo >= hi || hi - lo > 6) return [grade]; // sanity guard
  const result = [];
  for (let i = lo; i <= hi; i++) result.push(`${prefix}${i}`);
  return result;
}

/**
 * Check whether a timetable is active for a given date and grade.
 * @param {import("../types").Timetable | null | undefined} timetable
 * @param {string} dateStr
 * @param {string} grade
 * @returns {boolean}
 */
export function isTimetableActiveForDate(timetable, dateStr, grade) {
  if (!timetable) return false;
  if (timetable.startDate && dateStr < timetable.startDate) return false;
  if (timetable.endDate && dateStr > timetable.endDate) return false;
  return gradeMatchesTimetable(grade, timetable.grades);
}

/**
 * Return the list of active timetable IDs for a given date and grade.
 * @param {string} dateStr
 * @param {string} grade
 * @param {import("../types").Timetable[]} timetables
 * @returns {number[]}
 */
export function getActiveTimetableIds(dateStr, grade, timetables) {
  if (!Array.isArray(timetables)) return [];
  return timetables
    .filter((t) => isTimetableActiveForDate(t, dateStr, grade))
    .map((t) => t.id);
}

/**
 * Filter slots to only those belonging to an active timetable for the date.
 * Slots without timetableId are treated as belonging to timetable id 1 (default).
 * @param {import("../types").Slot[]} slots
 * @param {string} dateStr
 * @param {import("../types").Timetable[]} timetables
 * @returns {import("../types").Slot[]}
 */
export function filterSlotsForDate(slots, dateStr, timetables) {
  if (!Array.isArray(timetables) || timetables.length === 0) return slots;
  return slots.filter((s) => {
    const ttId = s.timetableId ?? 1;
    const tt = timetables.find((t) => t.id === ttId);
    return isTimetableActiveForDate(tt, dateStr, s.grade);
  });
}

/**
 * Filter slots to those belonging to the active timetable, used by aggregate
 * views (week/month/dashboard "現在の時間割") where no specific date applies.
 * Returns slots unchanged when there is only a single timetable (or none) —
 * the filter is a no-op in that case.
 * Slots without timetableId are treated as belonging to timetable id 1.
 */
export function filterSlotsByActiveTimetable(slots, timetables, activeTimetableId) {
  if (!Array.isArray(timetables) || timetables.length <= 1) return slots;
  const activeId = activeTimetableId || 1;
  return slots.filter((s) => (s.timetableId ?? 1) === activeId);
}

// ─── ヘッダの時間割セレクタ (集計ベースのビューの「現在の時間割」) ──────
// 選択は端末ごと (localStorage) なので、期切替のあと各端末が旧期を表示した
// まま気付かない、が起きる (CLAUDE.md「期切替の運用」の集計ベースの経路)。
// セレクタの選択肢に「今日有効 / 終了 / 開始前」を出し、表示中の時間割が
// 今日有効でないときは切り替えを促すための純関数。

/**
 * 時間割が指定日に有効か (学年を問わない版)。
 * isTimetableActiveForDate は (日付, 学年) で見るが、セレクタで知りたいのは
 * 「その時間割が自分の対象学年にとって有効か」。学年を絞った時間割
 * (grades: ["中3"]) を別の学年で引くと日付の内側でも false になるので、
 * 対象学年の先頭 (grades が空 = 全学年なら何を渡しても一致) を渡して
 * 日付の判定だけを効かせる。日付の解釈 (空 = 無制限、境界日を含む) を
 * isTimetableActiveForDate と一本化するため、ここで日付を比べ直さない。
 * @param {import("../types").Timetable | null | undefined} timetable
 * @param {string} dateStr
 * @returns {boolean}
 */
export function isTimetableInEffectOn(timetable, dateStr) {
  if (!timetable) return false;
  const grades = Array.isArray(timetable.grades) ? timetable.grades : [];
  return isTimetableActiveForDate(timetable, dateStr, grades[0] ?? "");
}

/**
 * 指定日から見た時間割の状態。
 *   - "active":   有効 (期間の内側。開始日・終了日が空の側は無制限)
 *   - "upcoming": 開始前 (startDate > 日付)
 *   - "ended":    終了 (endDate < 日付)
 * @param {import("../types").Timetable} timetable
 * @param {string} dateStr
 * @returns {"active" | "upcoming" | "ended"}
 */
export function getTimetableStatusOn(timetable, dateStr) {
  if (isTimetableInEffectOn(timetable, dateStr)) return "active";
  // 学年は自分の対象学年で見ているので、有効でない理由は日付だけ。
  // 開始前か終了後かを出し分ける (有効かどうかの判定は上で済んでいる)
  if (timetable?.startDate && dateStr < timetable.startDate) return "upcoming";
  return "ended";
}

/**
 * この端末でまだ時間割を選んでいない (localStorage に保存が無い) ときの既定。
 * 今日有効な時間割があればその先頭 (並びは時間割管理の順 = セレクタの順)、
 * 無ければ従来どおり id=1 (デフォルト時間割。無いときは先頭)。
 * 期切替で前の期に終了日を入れてあれば今日有効なのは 1 つなので、複数が
 * 有効になるのは学年を分けた時間割を並走させている場合だけ。そのときに
 * 「どれが本命か」を推測する規則は足さず、並び順で決める。
 * @param {import("../types").Timetable[]} timetables
 * @param {string} dateStr
 * @returns {number}
 */
export function pickDefaultTimetableId(timetables, dateStr) {
  if (!Array.isArray(timetables) || timetables.length === 0) return 1;
  const inEffect = timetables.find((t) => isTimetableInEffectOn(t, dateStr));
  if (inEffect) return inEffect.id;
  return timetables.some((t) => t.id === 1) ? 1 : timetables[0].id;
}

/**
 * 集計ベースのビューに使う時間割 id を決める。
 * 保存された選択 (savedId) があればそれを使い、**勝手に切り替えない**
 * (今日有効でなくても。気付かせるのはセレクタの注意書きの役目)。
 * 保存が無い / 保存された時間割がもう無い (別の端末で削除された等) ときは
 * pickDefaultTimetableId。後者で空の画面を出さないため。
 * @param {import("../types").Timetable[]} timetables
 * @param {number | null | undefined} savedId
 * @param {string} dateStr
 * @returns {number}
 */
export function resolveActiveTimetableId(timetables, savedId, dateStr) {
  if (savedId != null) {
    if (!Array.isArray(timetables) || timetables.some((t) => t.id === savedId)) {
      return savedId;
    }
  }
  return pickDefaultTimetableId(timetables, dateStr);
}

/**
 * 表示中の時間割が今日有効でなく、かつ他に今日有効な時間割があるとき、
 * 切り替え先の候補を返す (それ以外は null)。候補が複数あるときは並び順の
 * 先頭を出し、残りの件数を otherCount で返す (どれが本命かは推測しない)。
 * @param {import("../types").Timetable[]} timetables
 * @param {number} activeId
 * @param {string} dateStr
 * @returns {{
 *   current: import("../types").Timetable,
 *   status: "upcoming" | "ended",
 *   suggestion: import("../types").Timetable,
 *   otherCount: number,
 * } | null}
 */
export function suggestTimetableSwitch(timetables, activeId, dateStr) {
  if (!Array.isArray(timetables)) return null;
  const current = timetables.find((t) => t.id === activeId);
  if (!current) return null;
  const status = getTimetableStatusOn(current, dateStr);
  if (status === "active") return null;
  const candidates = timetables.filter(
    (t) => t.id !== activeId && isTimetableInEffectOn(t, dateStr)
  );
  if (candidates.length === 0) return null;
  return { current, status, suggestion: candidates[0], otherCount: candidates.length - 1 };
}

/**
 * Check if a given grade matches any grade in a cutoff group.
 * @param {string} grade
 * @param {string[]} groupGrades
 * @returns {boolean}
 */
function gradeMatchesCutoffGroup(grade, groupGrades) {
  if (groupGrades.includes(grade)) return true;
  const expanded = expandGradeRange(grade);
  if (expanded.length > 1) {
    return expanded.some((g) => groupGrades.includes(g));
  }
  return false;
}

/**
 * Find the cutoff group whose grades include the given grade.
 * Handles combined grades ("中1-3") via range expansion.
 * @param {string} grade
 * @param {import("../types").CutoffGroup[] | undefined} groups
 * @returns {import("../types").CutoffGroup | null}
 */
export function findGroupForGrade(grade, groups) {
  if (!Array.isArray(groups)) return null;
  for (const group of groups) {
    if (gradeMatchesCutoffGroup(grade, group.grades)) return group;
  }
  return null;
}

/**
 * Check whether a date is outside the display range for a given grade.
 * Returns true when dateStr falls before startDate or after date (end).
 * Grade-group level only — see isSlotBeyondCutoff for cohort-aware checks.
 * @param {string} dateStr
 * @param {string} grade
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @returns {boolean}
 */
export function isBeyondCutoff(dateStr, grade, displayCutoff) {
  if (!displayCutoff || !displayCutoff.groups) return false;
  const group = findGroupForGrade(grade, displayCutoff.groups);
  if (!group) return false; // No matching group → no cutoff
  if (group.startDate && dateStr < group.startDate) return true;
  if (group.date && dateStr > group.date) return true;
  return false;
}

/**
 * Cohort-aware variant of isBeyondCutoff. Layers a per-cohort 終講日
 * (last-class date) over the grade-group range:
 *   - start: always the grade group's startDate (cohorts refine the END only)
 *   - end:   the matching cohort's date if set, otherwise the group's date
 * High-school cohorts split by school (subj prefix); middle-school cohorts
 * split by course (the days a track actually meets: 火金 / 月木 / 火木 /
 * 水金 / 土 …). See utils/cohorts.js. Matching is by day membership, so a
 * cohort's stored day list need not be a fixed pair.
 * @param {string} dateStr
 * @param {import("../types").Slot} slot
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @returns {boolean}
 */
export function isSlotBeyondCutoff(dateStr, slot, displayCutoff) {
  if (!displayCutoff || !slot) return false;
  const group = findGroupForGrade(slot.grade, displayCutoff.groups);
  const cohort = findCohortCutoff(slot, displayCutoff.cohorts);

  const startDate = group?.startDate || null;
  const endDate = (cohort && cohort.date) || group?.date || null;

  if (startDate && dateStr < startDate) return true;
  if (endDate && dateStr > endDate) return true;
  return false;
}

/**
 * 学年グループごとに、そのグループが担当するコマを集計する。
 * 表示期間設定の画面 (対象コマ数・実際の授業曜日) と、全日判定から
 * 「コマが 1 つも無いグループ」を外すために使う。
 * @param {import("../types").Slot[]} slots
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @returns {Map<string, {slotCount: number, days: string[], slotIds: number[]}>}
 *   key は group.label
 */
export function summarizeCutoffGroups(slots, displayCutoff) {
  const out = new Map();
  const groups = displayCutoff?.groups;
  if (!Array.isArray(groups)) return out;
  for (const g of groups) {
    out.set(g.label, { slotCount: 0, days: [], slotIds: [] });
  }
  const daySets = new Map();
  for (const s of slots || []) {
    if (!s || !s.grade) continue;
    const group = findGroupForGrade(s.grade, groups);
    if (!group) continue;
    const entry = out.get(group.label);
    if (!entry) continue;
    entry.slotCount += 1;
    entry.slotIds.push(s.id);
    if (s.day) {
      let set = daySets.get(group.label);
      if (!set) daySets.set(group.label, (set = new Set()));
      set.add(s.day);
    }
  }
  for (const [label, set] of daySets) {
    out.get(label).days = DAYS.filter((d) => set.has(d));
  }
  return out;
}

/**
 * どの学年グループにも属さない学年を、コマ数付きで返す。
 * 学年は自由入力なので「附中」「高1高2」のような表記ゆれが生まれる。
 * これらは表示期間・終講日のフィルタが一切効かず (常に表示される)、
 * 回数の起点も引けない (第N回が出ない) ため、設定画面で気付けるようにする。
 * @param {import("../types").Slot[]} slots
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @returns {{grade: string, slotCount: number}[]} コマ数の多い順
 */
export function findUngroupedGrades(slots, displayCutoff) {
  const groups = displayCutoff?.groups;
  if (!Array.isArray(groups) || groups.length === 0) return [];
  const counts = new Map();
  for (const s of slots || []) {
    if (!s || !s.grade) continue;
    if (findGroupForGrade(s.grade, groups)) continue;
    counts.set(s.grade, (counts.get(s.grade) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([grade, slotCount]) => ({ grade, slotCount }))
    .sort((a, b) => b.slotCount - a.slotCount || (a.grade < b.grade ? -1 : 1));
}

/**
 * 実際にコマを持っている学年グループの label 集合。
 * getDayCutoffKind / isEntireDayBeyondCutoff の opts.activeGroupLabels に渡す。
 * @param {import("../types").Slot[]} slots その運用の全コマ (講師で絞らない)
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @returns {Set<string>}
 */
export function getCutoffGroupLabelsWithSlots(slots, displayCutoff) {
  const out = new Set();
  for (const [label, info] of summarizeCutoffGroups(slots, displayCutoff)) {
    if (info.slotCount > 0) out.add(label);
  }
  return out;
}

/**
 * その日が「全学年グループの表示期間外」かを判定し、期間外なら理由を返す。
 *   - "before" : どのグループもまだ開講していない (開始日より前)
 *   - "after"  : どのグループも終講済み (終了日より後)
 *   - "mixed"  : 未開講のグループと終講済みのグループが混在
 *   - null     : 1 つでも期間内のグループがある
 * 「未確定 (終講後)」と「開講前」は紙面・画面の文言が逆になるので分けている。
 *
 * opts.activeGroupLabels を渡すと、その label に含まれないグループ (=
 * コマが 1 つも無いグループ) を判定から除く。運用していない学年グループの
 * 終了日が空のままだと、他が全部終わってもバナーが出ないため。
 * ただし 1 つも残らないときは絞り込みを無かったことにして全グループで
 * 判定する (grades を空にした「全学年」1 グループ運用を壊さないため)。
 * @param {string} dateStr
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @param {{activeGroupLabels?: Set<string>}} [opts]
 * @returns {"before" | "after" | "mixed" | null}
 */
export function getDayCutoffKind(dateStr, displayCutoff, opts = {}) {
  const groups = displayCutoff?.groups;
  if (!Array.isArray(groups) || groups.length === 0) return null;
  const active = opts.activeGroupLabels;
  // コマを持つグループだけに絞る。ただし 1 つも該当しないとき (コマ未登録、
  // grades を空にした「全学年」1 グループ運用など) は判定材料が無くなるので
  // 絞り込み自体を無かったことにする。
  const scoped = active ? groups.filter((g) => active.has(g.label)) : groups;
  const list = scoped.length > 0 ? scoped : groups;
  let before = 0;
  let after = 0;
  for (const group of list) {
    if (group.startDate && dateStr < group.startDate) {
      before += 1;
      continue;
    }
    if (group.date && dateStr > group.date) {
      after += 1;
      continue;
    }
    return null; // 期間内のグループがある
  }
  if (before && after) return "mixed";
  return before ? "before" : "after";
}

/**
 * Check whether ALL grades on a given date are outside their display range.
 * Used to show "未確定" banners / blank an entire day.
 *
 * Grade-group level only — deliberately cohort-free. The group end date is the
 * OUTER display bound: a per-cohort 終講日 (isSlotBeyondCutoff) can only shorten
 * a cohort's visibility WITHIN that window, never push a day past the group end.
 * To display a cohort beyond its group end, raise the group's end date (the
 * CohortCutoffEditor warns when a cohort date exceeds it). Keeping this gate
 * cohort-free avoids leaking one cohort's extension into count-based paths
 * (e.g. findNextSessionMap) that don't re-apply per-slot cutoffs, and avoids a
 * grade-matching mismatch for combined grades ("中1-3").
 * @param {string} dateStr
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @param {{activeGroupLabels?: Set<string>}} [opts] getDayCutoffKind と同じ
 * @returns {boolean}
 */
export function isEntireDayBeyondCutoff(dateStr, displayCutoff, opts = {}) {
  return getDayCutoffKind(dateStr, displayCutoff, opts) != null;
}
