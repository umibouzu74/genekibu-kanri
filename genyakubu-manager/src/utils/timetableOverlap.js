// ─── 時間割の期間検証と重なり検出 ───────────────────────────────────
// 時間割管理の作成 / 編集 / 複製フォームで使う純関数。
//
// 「期切替で前の期に終了日を入れ忘れると、切替日以降どちらの時間割も有効に
// なってコマが二重に出る」(CLAUDE.md「期切替の運用」) の事故を、保存する前に
// 気付かせるための道具。判定は警告であって禁止ではない (講習中だけ別の
// 時間割を重ねる運用などは実在しうる)。
//
// 有効期間の意味は utils/timetable.isTimetableActiveForDate と同じ:
//   - startDate / endDate が空 (null) = その側は無制限
//   - grades が空 = 全学年
//   - 学年の照合は gradeMatchesTimetable (「中1-3」の複合学年も展開して比べる)

import { gradeMatchesTimetable } from "./timetable";

export const PERIOD_ERROR = "終了日は開始日以降にしてください";
export const NAME_REQUIRED_ERROR = "名前を入力してください";

/**
 * フォームの「対象学年（カンマ区切り）」を配列にする。
 * TimetableManagerView の保存処理と同じ区切り (",", "、", 空白)。
 * @param {string | string[] | null | undefined} input
 * @returns {string[]}
 */
export function parseGradesInput(input) {
  if (Array.isArray(input)) return input.map((g) => String(g).trim()).filter(Boolean);
  return String(input || "")
    .split(/[,、\s]+/)
    .map((g) => g.trim())
    .filter(Boolean);
}

/**
 * 開始日 ≤ 終了日 の検証。片方が空なら OK (無制限)。
 * @param {{startDate?: string | null, endDate?: string | null}} form
 * @returns {string | null} エラー文言 (問題なければ null)
 */
export function validateTimetablePeriod(form) {
  const start = form?.startDate || "";
  const end = form?.endDate || "";
  if (start && end && start > end) return PERIOD_ERROR;
  return null;
}

/**
 * 名前の検証。空なら NAME_REQUIRED_ERROR。
 * @param {{name?: string}} form
 * @returns {string | null}
 */
export function validateTimetableName(form) {
  return String(form?.name || "").trim() ? null : NAME_REQUIRED_ERROR;
}

/**
 * 同じ名前 (trim 後の完全一致) の別の時間割。無ければ null。
 * 名前の重複は禁止しない (ヘッダの時間割セレクタで見分けが付かなくなる
 * だけなので、警告に留める)。
 * @param {string} name
 * @param {import("../types").Timetable[]} timetables
 * @param {{excludeId?: number | string | null}} [opts]
 */
export function findDuplicateNameTimetable(name, timetables, opts = {}) {
  const n = String(name || "").trim();
  if (!n) return null;
  const excludeId = opts.excludeId ?? null;
  return (
    (timetables || []).find(
      (t) => t && t.id !== excludeId && String(t.name || "").trim() === n
    ) || null
  );
}

// 2 つの時間割の有効期間が交わる区間。交わらなければ null。
// 両側とも無制限なら {overlapStart: null, overlapEnd: null}。
function intersectPeriods(a, b) {
  const starts = [a.startDate, b.startDate].filter(Boolean);
  const ends = [a.endDate, b.endDate].filter(Boolean);
  // 文字列 "YYYY-MM-DD" は辞書順 = 日付順
  const overlapStart = starts.length ? starts.reduce((x, y) => (x > y ? x : y)) : null;
  const overlapEnd = ends.length ? ends.reduce((x, y) => (x < y ? x : y)) : null;
  if (overlapStart && overlapEnd && overlapStart > overlapEnd) return null;
  return { overlapStart, overlapEnd };
}

// 2 つの時間割が共に担当する学年。
//   - 両方が全学年 (空) → [] (= 全学年で重なる)
//   - 片方だけ空 → もう片方の学年すべて
//   - 両方指定 → 互いに gradeMatchesTimetable で当たるものの和集合
// 重ならなければ null。
function sharedGradesBetween(aGrades, bGrades) {
  const a = aGrades || [];
  const b = bGrades || [];
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [...b];
  if (b.length === 0) return [...a];
  const out = [];
  for (const g of a) if (gradeMatchesTimetable(g, b) && !out.includes(g)) out.push(g);
  for (const g of b) if (gradeMatchesTimetable(g, a) && !out.includes(g)) out.push(g);
  return out.length ? out : null;
}

/**
 * candidate の有効期間・対象学年が、他の時間割と重なるものを列挙する。
 * @param {{startDate?: string | null, endDate?: string | null, grades?: string[] | string}} candidate
 *   grades は配列でもフォームのカンマ区切り文字列でもよい
 * @param {import("../types").Timetable[]} timetables
 * @param {{excludeId?: number | string | null}} [opts] 編集中の自分自身を除く
 * @returns {{
 *   timetable: import("../types").Timetable,
 *   overlapStart: string | null,
 *   overlapEnd: string | null,
 *   sharedGrades: string[],
 * }[]} sharedGrades が空 = 全学年で重なる
 */
export function findOverlappingTimetables(candidate, timetables, opts = {}) {
  if (!candidate) return [];
  const excludeId = opts.excludeId ?? null;
  const cand = {
    startDate: candidate.startDate || null,
    endDate: candidate.endDate || null,
    grades: parseGradesInput(candidate.grades),
  };
  const out = [];
  for (const tt of timetables || []) {
    if (!tt || tt.id === excludeId) continue;
    const period = intersectPeriods(cand, tt);
    if (!period) continue;
    const sharedGrades = sharedGradesBetween(cand.grades, tt.grades);
    if (sharedGrades === null) continue;
    out.push({ timetable: tt, ...period, sharedGrades });
  }
  return out;
}

/**
 * 重なりの区間を人が読める形に。"4/1〜4/10" / "4/1〜" / "〜4/10" / "全期間"。
 * @param {{overlapStart: string | null, overlapEnd: string | null}} o
 */
export function formatOverlapRange(o) {
  const md = (s) => {
    const [, m, d] = String(s).split("-");
    return `${Number(m)}/${Number(d)}`;
  };
  if (!o.overlapStart && !o.overlapEnd) return "全期間";
  if (!o.overlapEnd) return `${md(o.overlapStart)}〜`;
  if (!o.overlapStart) return `〜${md(o.overlapEnd)}`;
  if (o.overlapStart === o.overlapEnd) return md(o.overlapStart);
  return `${md(o.overlapStart)}〜${md(o.overlapEnd)}`;
}

/**
 * 警告 1 行ぶんの文言: 「◯◯ と 4/1〜4/10 が重なります (中3)」
 * @param {ReturnType<typeof findOverlappingTimetables>[number]} o
 */
export function describeOverlap(o) {
  const grades = o.sharedGrades.length ? o.sharedGrades.join(", ") : "全学年";
  return `${o.timetable.name} と ${formatOverlapRange(o)} が重なります (${grades})`;
}
