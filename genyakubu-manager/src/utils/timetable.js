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

/**
 * 所属する時間割の対象学年 (timetable.grades) に合わない学年のコマ。
 * こうしたコマは日付ベースの画面 (isTimetableActiveForDate) のどこにも出ない
 * (エラーにもならない)。範囲を絞った置き換え反映・コマの追加・対象学年を
 * 外したときに生まれるので、時間割管理とコマの編集画面で知らせる。
 * 対象学年が空 (= 全学年) の時間割は対象外。
 * @param {import("../types").Slot[]} slots
 * @param {import("../types").Timetable[]} timetables
 * @returns {Map<number, {grade: string, slotCount: number}[]>} 時間割 id → 学年ごとの件数
 */
export function findSlotsOutsideTimetableGrades(slots, timetables) {
  const out = new Map();
  if (!Array.isArray(timetables)) return out;
  const byId = new Map(timetables.map((t) => [t.id, t]));
  const counts = new Map();
  for (const s of slots || []) {
    if (!s || !s.grade) continue;
    const ttId = s.timetableId ?? 1;
    const tt = byId.get(ttId);
    if (!tt || !Array.isArray(tt.grades) || tt.grades.length === 0) continue;
    if (gradeMatchesTimetable(s.grade, tt.grades)) continue;
    let m = counts.get(ttId);
    if (!m) counts.set(ttId, (m = new Map()));
    m.set(s.grade, (m.get(s.grade) || 0) + 1);
  }
  for (const [ttId, m] of counts) {
    out.set(
      ttId,
      [...m.entries()].map(([grade, slotCount]) => ({ grade, slotCount }))
    );
  }
  return out;
}

/**
 * 学年の一覧のうち、時間割の対象学年に合わないもの (重複なし・出てきた順)。
 * 対象学年が空 (= 全学年) なら常に空。
 * @param {string[]} grades
 * @param {import("../types").Timetable | null | undefined} timetable
 * @returns {string[]}
 */
export function gradesOutsideTimetable(grades, timetable) {
  if (!timetable || !Array.isArray(timetable.grades) || timetable.grades.length === 0) return [];
  const out = [];
  for (const g of grades || []) {
    if (!g || out.includes(g)) continue;
    if (!gradeMatchesTimetable(g, timetable.grades)) out.push(g);
  }
  return out;
}

// ─── 「今の時間割」(日付を持たない画面の時間割) ─────────────────────
// サイドバーの講師ごとのコマ数・全講師一覧・講師の週計・タイムテーブルの
// 通常表示のように、特定の日付を持たない画面が使う時間割。
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
// 講師の名前を並べる一覧 (サイドバー・まとめて印刷) だけは、これから始まる
// 時間割の講師も入れる (filterSlotsCurrentOrUpcoming)。

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
 * 「今の時間割」のコマ。時間割が 1 つだけ (または無い) なら切り替わる相手が
 * 無いので絞らない (以前のセレクタと同じ)。2 つ以上あるとき、コマの時間割が
 * 見つからない (削除済み等) コマは、日付で見る画面 (filterSlotsForDate) と
 * 同じく出さない。
 * @param {import("../types").Slot[]} slots
 * @param {import("../types").Timetable[]} timetables
 * @param {string} dateStr
 * @returns {import("../types").Slot[]}
 */
export function filterSlotsCurrentOn(slots, timetables, dateStr) {
  if (!Array.isArray(timetables) || timetables.length <= 1) return slots;
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
 * 今の時間割のコマ + これから始まる時間割 (開始日が指定日より後) のコマ。
 * 講師の名前を並べる一覧 (サイドバー・まとめて印刷の講師・講師ごとのタグの
 * 導出) に使う。期切替の反映は切替日より前に行うので、その間も次の期から
 * 入る講師の月間を開いたり、翌月の予定を刷ったりできるように。終わった
 * 時間割の講師は出さない。コマ数を数える用途 (週計など) には使わない
 * (切替前は今の期と次の期の両方を数えてしまう)。
 * @param {import("../types").Slot[]} slots
 * @param {import("../types").Timetable[]} timetables
 * @param {string} dateStr
 * @returns {import("../types").Slot[]}
 */
export function filterSlotsCurrentOrUpcoming(slots, timetables, dateStr) {
  if (!Array.isArray(timetables) || timetables.length <= 1) return slots;
  const current = new Set(filterSlotsCurrentOn(slots, timetables, dateStr));
  const upcomingIds = new Set(
    timetables.filter((t) => t && t.startDate && t.startDate > dateStr).map((t) => t.id)
  );
  const byId = new Map(timetables.map((t) => [t?.id, t]));
  return slots.filter((s) => {
    if (current.has(s)) return true;
    const id = s.timetableId ?? 1;
    return upcomingIds.has(id) && gradeMatchesTimetable(s.grade ?? "", byId.get(id).grades);
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
 *     見た状態 (期と期の間は upcoming / ended)、今の時間割に出ているコマ数
 *   - overlaps: 同じ学年のコマが 2 つ以上の時間割から出ている学年。前の期に
 *     終了日が入っていない等で、日付で見る画面でもコマが二重に出ている
 * @param {import("../types").Slot[]} slots
 * @param {import("../types").Timetable[]} timetables
 * @param {string} dateStr
 * @returns {{
 *   timetables: {
 *     timetable: import("../types").Timetable,
 *     status: "active" | "upcoming" | "ended",
 *     slotCount: number,
 *   }[],
 *   overlaps: { grade: string, timetables: import("../types").Timetable[] }[],
 * }}
 */
export function describeCurrentTimetables(slots, timetables, dateStr) {
  if (!Array.isArray(timetables) || timetables.length === 0) {
    return { timetables: [], overlaps: [] };
  }
  const countById = new Map();
  const idsByGrade = new Map();
  for (const s of filterSlotsCurrentOn(slots || [], timetables, dateStr)) {
    const id = s.timetableId ?? 1;
    countById.set(id, (countById.get(id) || 0) + 1);
    const grade = s.grade ?? "";
    if (!idsByGrade.has(grade)) idsByGrade.set(grade, new Set());
    idsByGrade.get(grade).add(id);
  }
  const inOrder = (ids) => timetables.filter((t) => ids.has(t.id));
  return {
    timetables: timetables
      .filter((t) => countById.has(t.id))
      .map((t) => ({
        timetable: t,
        status: getTimetableStatusOn(t, dateStr),
        slotCount: countById.get(t.id),
      })),
    overlaps: [...idsByGrade]
      .filter(([, ids]) => ids.size > 1)
      .map(([grade, ids]) => ({ grade, timetables: inOrder(ids) }))
      .sort((a, b) => a.grade.localeCompare(b.grade, "ja")),
  };
}

/**
 * 新しく作るコマの既定の時間割 (コマの追加フォーム・反映ダイアログの期切替で
 * 終わらせる「前の時間割」)。今の時間割のうちコマの多いもの (同数なら並び順の
 * 先頭)、無ければ指定日に有効な時間割の先頭、それも無ければ従来どおり id=1
 * (無いときは先頭)。学年を分けた時間割 (附属など) を並走させていても、
 * 期切替の既定が小さい方の時間割にならないように、コマ数で選ぶ。
 * @param {import("../types").Slot[]} slots
 * @param {import("../types").Timetable[]} timetables
 * @param {string} dateStr
 * @returns {number}
 */
export function defaultTimetableIdOn(slots, timetables, dateStr) {
  if (!Array.isArray(timetables) || timetables.length === 0) return 1;
  const current = describeCurrentTimetables(slots, timetables, dateStr).timetables;
  if (current.length > 0) {
    return current.reduce((best, x) => (x.slotCount > best.slotCount ? x : best)).timetable.id;
  }
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

// ─── 学年グループと時間割 (期) の結び付き (2026-11-19) ─────────────
// 学年グループ (表示期間設定) は時間割に結び付けて持てる (CutoffGroup.timetableId)。
//   - 結び付いたグループは、その時間割のコマにだけ効く
//   - 時間割に 1 つでも結び付いたグループがあれば、その時間割のコマは
//     結び付いたグループだけで見る (共通のグループには落ちない)
//   - 結び付いたグループが無い時間割のコマは、結び付いていないグループ
//     (= 共通の設定。この仕組みより前のデータはこれだけ) で見る
// 次の期に合わせて共通の開始日を動かすと、前の期の月がまるごと「開講前」に
// なっていた (2026-11-19 の P1-1)。前の期は自分の設定 (結び付いたグループ) を
// 持つので、共通の開始日で落ちない。旧データは resolveCutoffGroupTimetables が
// 読み込みのたびに補う。

const groupsByTimetableCache = new WeakMap();

/**
 * その時間割のコマに効く学年グループの一覧。結び付いたグループがあれば
 * それだけ、無ければ結び付いていない (共通の) グループ。timetableId が
 * null / undefined なら共通のグループ。
 * @param {import("../types").CutoffGroup[] | undefined} groups
 * @param {number | null | undefined} timetableId
 * @returns {import("../types").CutoffGroup[]}
 */
export function groupsForTimetable(groups, timetableId) {
  if (!Array.isArray(groups)) return [];
  let byTimetable = groupsByTimetableCache.get(groups);
  if (!byTimetable) {
    byTimetable = new Map();
    groupsByTimetableCache.set(groups, byTimetable);
  }
  const key = timetableId ?? null;
  let list = byTimetable.get(key);
  if (!list) {
    const bound = key == null ? [] : groups.filter((g) => g && g.timetableId === key);
    list = bound.length > 0 ? bound : groups.filter((g) => g && g.timetableId == null);
    byTimetable.set(key, list);
  }
  return list;
}

/**
 * 結び付いていない (共通の) 学年グループ。
 * @param {import("../types").CutoffGroup[] | undefined} groups
 */
export function sharedCutoffGroups(groups) {
  return groupsForTimetable(groups, null);
}

/**
 * その時間割に結び付いた学年グループがあるか。
 * @param {import("../types").CutoffGroup[] | undefined} groups
 * @param {number} timetableId
 */
export function hasTimetableCutoffGroups(groups, timetableId) {
  return Array.isArray(groups) && groups.some((g) => g && g.timetableId === timetableId);
}

/**
 * コマに効く学年グループ (コマの時間割の結び付きを見る)。表示期間・第N回の
 * 起点・オリエンはどれもこれで引く。学年だけで引く findGroupForGrade を
 * コマの判定に使わない (前の期のコマに今の期の開始日が当たる)。
 * @param {import("../types").Slot} slot
 * @param {import("../types").CutoffGroup[] | undefined} groups
 * @returns {import("../types").CutoffGroup | null}
 */
export function findGroupForSlot(slot, groups) {
  if (!slot || !slot.grade) return null;
  return findGroupForGrade(slot.grade, groupsForTimetable(groups, slot.timetableId ?? 1));
}

/**
 * 学年グループを区別するキー。共通のグループは名前、結び付いたグループは
 * 名前 + 時間割 (同じ名前のグループが期ごとに並ぶため)。
 * @param {import("../types").CutoffGroup} group
 * @returns {string}
 */
export function cutoffGroupKey(group) {
  if (!group) return "";
  return group.timetableId != null ? `${group.label}@${group.timetableId}` : group.label;
}

/**
 * 時間割を消したときに、その時間割に結び付いた学年グループとコース別終講日を
 * 外す。時間割の id は最大 + 1 で振るので、残すと後から作った時間割に黙って
 * 効く。何も外さなければ同じオブジェクトを返す。
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @param {number} timetableId
 */
export function dropTimetableFromCutoff(displayCutoff, timetableId) {
  if (!displayCutoff || typeof displayCutoff !== "object") return displayCutoff;
  const groups = Array.isArray(displayCutoff.groups) ? displayCutoff.groups : null;
  const cohorts = Array.isArray(displayCutoff.cohorts) ? displayCutoff.cohorts : null;
  const keptGroups = groups ? groups.filter((g) => !g || g.timetableId !== timetableId) : groups;
  const keptCohorts = cohorts ? cohorts.filter((c) => !c || c.timetableId !== timetableId) : cohorts;
  if (keptGroups?.length === groups?.length && keptCohorts?.length === cohorts?.length) {
    return displayCutoff;
  }
  return {
    ...displayCutoff,
    ...(groups ? { groups: keptGroups } : {}),
    ...(cohorts ? { cohorts: keptCohorts } : {}),
  };
}

/**
 * 時間割に結び付いていない学年グループ (この仕組みより前のデータ) を読む。
 * 共通のグループは「その開始日の時点で有効な時間割とそれ以降の期」の設定と
 * みなし、**その開始日より前に終わっている時間割**には、その時間割の期間
 * (開始日〜終了日) を表示期間とするグループを補う。当時の開始日・終了日・
 * オリエンの設定は残っていないので、時間割の期間とコース別終講日だけで
 * 決まる (オリエンは未設定 = 既定)。共通の開始日より前に終わっていない
 * グループは、そのまま写す (結び付いたグループがある時間割は、結び付いた
 * グループだけで見るため)。
 *
 * **保存はしない** (読み込みのたびに補う。cohorts.resolveCohortTimetables と
 * 同じ)。表示期間設定の画面で保存したときに補った値ごと書かれる。
 * 何も補わなければ同じオブジェクトを返す。
 * @param {import("../types").DisplayCutoff | null | undefined} displayCutoff
 * @param {import("../types").Timetable[]} timetables
 * @param {import("../types").Slot[]} slots
 * @returns {import("../types").DisplayCutoff | null | undefined}
 */
export function resolveCutoffGroupTimetables(displayCutoff, timetables, slots) {
  const groups = displayCutoff?.groups;
  if (!Array.isArray(groups) || groups.length === 0) return displayCutoff;
  if (!Array.isArray(timetables) || timetables.length === 0) return displayCutoff;
  const shared = groups.filter((g) => g && g.timetableId == null);
  if (!shared.some((g) => g.startDate)) return displayCutoff;
  const gradesByTimetable = new Map();
  for (const s of slots || []) {
    if (!s || !s.grade) continue;
    const id = s.timetableId ?? 1;
    let set = gradesByTimetable.get(id);
    if (!set) gradesByTimetable.set(id, (set = new Set()));
    set.add(s.grade);
  }
  const added = [];
  for (const tt of timetables) {
    if (!tt || !tt.endDate || hasTimetableCutoffGroups(groups, tt.id)) continue;
    const grades = gradesByTimetable.get(tt.id);
    if (!grades) continue;
    const endedBefore = (g) => !!g.startDate && tt.endDate < g.startDate;
    const hit = [...grades].some((grade) => {
      const g = findGroupForGrade(grade, shared);
      return !!g && endedBefore(g);
    });
    if (!hit) continue;
    for (const g of shared) {
      added.push(
        endedBefore(g)
          ? {
              label: g.label,
              grades: [...(g.grades || [])],
              startDate: tt.startDate || null,
              date: tt.endDate,
              timetableId: tt.id,
            }
          : { ...g, timetableId: tt.id }
      );
    }
  }
  return added.length > 0 ? { ...displayCutoff, groups: [...groups, ...added] } : displayCutoff;
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
 *   - startDate: 学年グループ (コマの時間割に効くもの、findGroupForSlot) の開始日
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
  // 学年グループはコマの時間割に効くもの (前の期のコマに今の期の開始日を
  // 当てない。findGroupForSlot)
  const group = findGroupForSlot(slot, displayCutoff.groups);
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
 *   key は cutoffGroupKey (共通のグループは label、時間割に結び付いたグループは
 *   label@時間割 id)。コマはコマの時間割に効くグループ (findGroupForSlot) に数える
 */
export function summarizeCutoffGroups(slots, displayCutoff) {
  const out = new Map();
  const groups = displayCutoff?.groups;
  if (!Array.isArray(groups)) return out;
  for (const g of groups) {
    out.set(cutoffGroupKey(g), { slotCount: 0, days: [], slotIds: [] });
  }
  const daySets = new Map();
  for (const s of slots || []) {
    if (!s || !s.grade) continue;
    const group = findGroupForSlot(s, groups);
    if (!group) continue;
    const key = cutoffGroupKey(group);
    const entry = out.get(key);
    if (!entry) continue;
    entry.slotCount += 1;
    entry.slotIds.push(s.id);
    if (s.day) {
      let set = daySets.get(key);
      if (!set) daySets.set(key, (set = new Set()));
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
    if (findGroupForSlot(s, groups)) continue;
    counts.set(s.grade, (counts.get(s.grade) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([grade, slotCount]) => ({ grade, slotCount }))
    .sort((a, b) => b.slotCount - a.slotCount || (a.grade < b.grade ? -1 : 1));
}

/**
 * 実際にコマを持っている学年グループのキー (cutoffGroupKey) の集合。
 * getDayCutoffKind / isEntireDayBeyondCutoff の opts.activeGroupLabels に渡す。
 * 共通のグループのキーは label なので、時間割に結び付いたグループが無ければ
 * 従来どおり label の集合。
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
 * opts.activeGroupLabels を渡すと、そのキー (cutoffGroupKey) に含まれないグループ (=
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
  const scoped = active ? groups.filter((g) => active.has(cutoffGroupKey(g))) : groups;
  const list = scoped.length > 0 ? scoped : groups;
  // 同じ名前のグループ (中1・2 など) は期ごとに窓が並ぶ (時間割に結び付いた
  // グループ)。1 つのグループとして、どれかの窓の中なら期間内、どの窓の外でも
  // これから始まる窓があれば「開講前」、無ければ「終講後」とみなす。前の期の
  // 窓が終わっていることで、期と期の間が「混在」にならないように
  const kindByLabel = new Map();
  for (const group of list) {
    const isBefore = !!group.startDate && dateStr < group.startDate;
    const isAfter = !isBefore && !!group.date && dateStr > group.date;
    if (!isBefore && !isAfter) return null; // 期間内のグループがある
    if (kindByLabel.get(group.label) !== "before") {
      kindByLabel.set(group.label, isBefore ? "before" : "after");
    }
  }
  let before = 0;
  let after = 0;
  for (const kind of kindByLabel.values()) {
    if (kind === "before") before += 1;
    else after += 1;
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
