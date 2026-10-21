// ─── Timetable / display-cutoff filtering utilities ─────────────────
// All date strings are "YYYY-MM-DD".

import { findCohortCutoff } from "./cohorts";
import { isSlotScheduledOnDate } from "./slotDates";
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
  return slots.filter((s) => isSlotTimetableActiveOn(s, dateStr, timetables));
}

/**
 * コマの時間割がその日 (コマの学年にとって) 有効か。filterSlotsForDate の
 * 1 コマ版 (曜日ごとに日付が違う週間の列などで使う)。時間割が 1 つも無い
 * データは絞らない。
 * @param {import("../types").Slot} slot
 * @param {string} dateStr
 * @param {import("../types").Timetable[]} timetables
 * @returns {boolean}
 */
export function isSlotTimetableActiveOn(slot, dateStr, timetables) {
  if (!Array.isArray(timetables) || timetables.length === 0) return true;
  const ttId = slot.timetableId ?? 1;
  const tt = timetables.find((t) => t.id === ttId);
  return isTimetableActiveForDate(tt, dateStr, slot.grade);
}

/**
 * 指定した時間割のコマだけ (コースマスター管理で時間割を選んで見るとき)。
 * Slots without timetableId are treated as belonging to timetable id 1.
 * @param {import("../types").Slot[]} slots
 * @param {number} timetableId
 * @returns {import("../types").Slot[]}
 */
export function filterSlotsOfTimetable(slots, timetableId) {
  return slots.filter((s) => (s.timetableId ?? 1) === timetableId);
}

// ─── 「今の時間割」(日付を持たない画面の時間割) ─────────────────────
// 講師の一覧 (サイドバー)・全講師一覧・講師の週計・講師ごとのタグの導出・
// タイムテーブルの通常表示のように、特定の日付を持たない画面が使う時間割。
// **端末ごとの選択は持たず、日付 (既定は今日) から決める** (2026-10-21)。
// 以前はヘッダのセレクタで端末ごとに選んで localStorage に保存していたため、
// 期切替のあと閲覧用の端末だけ 1学期のまま、が起きた。
//
// 判定は学年ごと (時間割は学年を絞れるので):
//   - その日その学年に有効な時間割 (isTimetableActiveForDate) があれば全部。
//     学年を分けた時間割の並走 (附属・中3 だけ先に切り替え) もそのまま入る
//   - 無い日 (期と期の間) は次に始まる時間割、無ければ最後に終わった時間割。
//     前の期に早めの終了日を入れた夏休みに、講師一覧が空にならないように
// 日付を持つ画面 (ダッシュボード・月間・週間の各日・代行) はこれではなく
// filterSlotsForDate / isTimetableActiveForDate で日ごとに見る。

/**
 * 学年 grade のコマにとって dateStr の「今の時間割」の id。
 * @param {import("../types").Timetable[]} timetables
 * @param {string} grade
 * @param {string} dateStr
 * @returns {number[]} 時間割管理の並び順
 */
export function currentTimetableIdsForGrade(timetables, grade, dateStr) {
  if (!Array.isArray(timetables)) return [];
  const g = grade ?? "";
  const forGrade = timetables.filter((t) => t && gradeMatchesTimetable(g, t.grades));
  const active = forGrade.filter((t) => isTimetableActiveForDate(t, dateStr, g));
  if (active.length > 0) return active.map((t) => t.id);
  const upcoming = forGrade.filter((t) => t.startDate && t.startDate > dateStr);
  if (upcoming.length > 0) {
    const first = upcoming.reduce(
      (min, t) => (t.startDate < min ? t.startDate : min),
      upcoming[0].startDate
    );
    return upcoming.filter((t) => t.startDate === first).map((t) => t.id);
  }
  const ended = forGrade.filter((t) => t.endDate && t.endDate < dateStr);
  if (ended.length > 0) {
    const last = ended.reduce(
      (max, t) => (t.endDate > max ? t.endDate : max),
      ended[0].endDate
    );
    return ended.filter((t) => t.endDate === last).map((t) => t.id);
  }
  return [];
}

/**
 * 「今の時間割」のコマ。時間割が 1 つも無いデータ (時間割管理を使う前) は
 * 絞らない。コマの時間割が見つからない (削除済み等) コマは、日付で見る
 * 画面 (filterSlotsForDate) と同じく出さない。
 * @param {import("../types").Slot[]} slots
 * @param {import("../types").Timetable[]} timetables
 * @param {string} dateStr
 * @returns {import("../types").Slot[]}
 */
export function filterSlotsCurrentOn(slots, timetables, dateStr) {
  if (!Array.isArray(timetables) || timetables.length === 0) return slots;
  const byGrade = new Map();
  return slots.filter((s) => {
    const grade = s.grade ?? "";
    let ids = byGrade.get(grade);
    if (!ids) {
      ids = new Set(currentTimetableIdsForGrade(timetables, grade, dateStr));
      byGrade.set(grade, ids);
    }
    return ids.has(s.timetableId ?? 1);
  });
}

/**
 * 時間割が指定日に有効か (学年を問わない版)。
 * isTimetableActiveForDate は (日付, 学年) で見るが、ここで知りたいのは
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
 * 「今の時間割」の内訳 (ヘッダの表示用)。
 *   - timetables: 今の時間割にコマを出している時間割 (並び順) と、指定日から
 *     見た状態 (期と期の間は upcoming / ended)
 *   - overlaps: 同じ学年のコマが 2 つ以上の時間割から出ている学年。前の期に
 *     終了日が入っていない等で、日付で見る画面でもコマが二重に出ている
 * @param {import("../types").Slot[]} slots
 * @param {import("../types").Timetable[]} timetables
 * @param {string} dateStr
 * @returns {{
 *   timetables: { timetable: import("../types").Timetable, status: "active" | "upcoming" | "ended" }[],
 *   overlaps: { grade: string, timetables: import("../types").Timetable[] }[],
 * }}
 */
export function describeCurrentTimetables(slots, timetables, dateStr) {
  if (!Array.isArray(timetables) || timetables.length === 0) {
    return { timetables: [], overlaps: [] };
  }
  const used = new Set();
  const idsByGrade = new Map();
  for (const s of filterSlotsCurrentOn(slots || [], timetables, dateStr)) {
    const id = s.timetableId ?? 1;
    used.add(id);
    const grade = s.grade ?? "";
    if (!idsByGrade.has(grade)) idsByGrade.set(grade, new Set());
    idsByGrade.get(grade).add(id);
  }
  const inOrder = (ids) => timetables.filter((t) => ids.has(t.id));
  return {
    timetables: inOrder(used).map((t) => ({
      timetable: t,
      status: getTimetableStatusOn(t, dateStr),
    })),
    overlaps: [...idsByGrade]
      .filter(([, ids]) => ids.size > 1)
      .map(([grade, ids]) => ({ grade, timetables: inOrder(ids) }))
      .sort((a, b) => a.grade.localeCompare(b.grade, "ja")),
  };
}

/**
 * 新しく作るコマの既定の時間割 (コマの追加フォーム・反映ダイアログの
 * 「前の時間割」)。今の時間割の先頭、無ければ指定日に有効な時間割の先頭、
 * それも無ければ従来どおり id=1 (無いときは先頭)。
 * @param {import("../types").Slot[]} slots
 * @param {import("../types").Timetable[]} timetables
 * @param {string} dateStr
 * @returns {number}
 */
export function defaultTimetableIdOn(slots, timetables, dateStr) {
  if (!Array.isArray(timetables) || timetables.length === 0) return 1;
  const current = describeCurrentTimetables(slots, timetables, dateStr).timetables;
  if (current.length > 0) return current[0].timetable.id;
  const inEffect = timetables.find((t) => isTimetableInEffectOn(t, dateStr));
  if (inEffect) return inEffect.id;
  return timetables.some((t) => t.id === 1) ? 1 : timetables[0].id;
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
 * Cohort-aware variant of isBeyondCutoff. 不定期のコマ (slot.irregular) は
 * 実施日の一覧 (slot.onlyDates) に無い日も窓の外 (utils/slotDates)。
 * Layers a per-cohort 終講日
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
  // 不定期のコマ (utils/slotDates) は実施日の一覧に無い日を窓の外として扱う。
  // 日付ベースの画面はどれもここを通すので、実施日でない日に並ばない
  if (!isSlotScheduledOnDate(slot, dateStr)) return true;
  const { startDate, endDate } = getSlotCutoffRange(slot, displayCutoff);
  if (startDate && dateStr < startDate) return true;
  if (endDate && dateStr > endDate) return true;
  return false;
}

/**
 * isSlotBeyondCutoff が見ている窓そのもの (コマ 1 つぶんの表示期間)。
 *   - startDate: 学年グループの開始日
 *   - endDate:   コース別終講日。無ければ学年グループの終了日
 * 未設定の端は null (その側には制限なし)。iCal 書き出しの DTSTART / UNTIL
 * のように「期間として」要るところはここから引き、窓の決め方を
 * 書き起こさない (isSlotBeyondCutoff と食い違わせない)。
 * @param {import("../types").Slot} slot
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @returns {{startDate: string | null, endDate: string | null}}
 */
export function getSlotCutoffRange(slot, displayCutoff) {
  if (!displayCutoff || !slot) return { startDate: null, endDate: null };
  const group = findGroupForGrade(slot.grade, displayCutoff.groups);
  const cohort = findCohortCutoff(slot, displayCutoff.cohorts);
  return {
    startDate: group?.startDate || null,
    endDate: (cohort && cohort.date) || group?.date || null,
  };
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
