// ─── 不在期間の中の授業 (P2-6) ──────────────────────────────────────
// 講師の不在期間 (utils/teacherAway) を登録したとき、「その期間にまだその講師の
// 担当になっている授業」を並べる。担当変更 (期間限定) / 欠勤として登録 へ進む
// 前に、どの授業が残っているかを見るための一覧。
//
// **「その日に実際に教える人」は授業時間の集計と同じ computeTeachingMinutes に
// 委ねる** (代行・担当の切り替え・振替・休講・テスト期間・表示期間を反映した後)。
// だから代行を入れた日・担当変更で外した日は自然に消え、残りだけが出る。
// 代行未定の欠勤 (休むことは登録済みで代行がまだ) は別に数える。
//
// 遅延読み込みの画面からだけ使う (集計のモジュールを本体の最初の読み込みに
// 持ち込まないため、utils/teacherAway から分けてある)。

import { MINUTE_KIND_LABELS, computeTeachingMinutes } from "./teachingMinutes";
import { makeEventHelpers } from "../components/views/dashboardHelpers";

/**
 * @param {import("../types").TeacherAway} rec
 * @param {object} lessonData computeTeachingMinutes の引数 (期間と isOffForGrade 以外。
 *   App の授業データ = slots / subs / adjustments / … / specialEvents)
 * @returns {{
 *   lessons: {date: string, time: string, kind: string, kindLabel: string, label: string}[],
 *   pending: {date: string, time: string, label: string}[],
 *   truncated: boolean,
 * }}
 */
export function listAwayLessons(rec, lessonData) {
  if (!rec?.teacher || !rec.startDate) return { lessons: [], pending: [], truncated: false };
  const { holidays = [], examPeriods = [], specialEvents = [] } = lessonData || {};
  const { isOffForGrade } = makeEventHelpers(holidays, examPeriods, specialEvents);
  const { rows, issues, truncated } = computeTeachingMinutes({
    ...lessonData,
    isOffForGrade,
    startDate: rec.startDate,
    endDate: rec.endDate || rec.startDate,
  });
  const lessons = (rows.get(rec.teacher)?.entries || [])
    .map((e) => ({
      date: e.date,
      time: e.time || "",
      kind: e.kind,
      kindLabel: MINUTE_KIND_LABELS[e.kind] || e.kind,
      label: e.label,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const pending = (issues.pendingAbsences || [])
    .filter((p) => p.teacher === rec.teacher)
    .map((p) => ({ date: p.date, time: p.time || "", label: p.label }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return { lessons, pending, truncated: !!truncated };
}
