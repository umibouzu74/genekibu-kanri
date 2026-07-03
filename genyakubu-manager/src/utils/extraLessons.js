// ─── 追加授業 (ExtraLesson) の表示用ヘルパ ─────────────────────────
// 追加授業は「特定日付にのみ実施する単発コマ」で、週次 Slot と違い
// 曜日ベースのグリッド配置には乗らない。各ビューは日付索引でこれを
// 引いて、通常コマとは別のカード (「追」バッジ付き) として描画する。
// teacher マッチングは Slot と同じ規則 (biweekly.isSlotForTeacher:
// "·" 区切りの複数講師 / note 内の名前も拾う) を使う。

import { isSlotForTeacher } from "./biweekly";
import { timeStartToMin } from "./dateHelpers";
import { describeSlot } from "./adjustmentDisplay";

// isSlotForTeacher は slot.teacher を文字列前提で読む (undefined だと
// `.includes` で throw)。UI / import 経路は文字列を保証するが、Firebase の
// 別クライアント書込や localStorage 手編集は無検証で state に届くため、
// ここで正規化してから渡す (校正レビュー 2026-07-03)。
function matchesTeacher(lesson, teacher) {
  return isSlotForTeacher(
    { teacher: lesson.teacher ?? "", note: lesson.note ?? "" },
    teacher
  );
}

// 同日内の表示順: 開始時刻 → 学年 → id (安定)。
function compareLessons(a, b) {
  return (
    timeStartToMin(a.time) - timeStartToMin(b.time) ||
    String(a.grade).localeCompare(String(b.grade)) ||
    a.id - b.id
  );
}

// 指定日の追加授業を開始時刻順で返す。
export function extraLessonsOnDate(extraLessons, dateStr) {
  if (!Array.isArray(extraLessons) || !dateStr) return [];
  return extraLessons.filter((l) => l.date === dateStr).sort(compareLessons);
}

// 指定日の「この講師が担当する」追加授業。
export function extraLessonsForTeacherOnDate(extraLessons, teacher, dateStr) {
  return extraLessonsOnDate(extraLessons, dateStr).filter((l) =>
    matchesTeacher(l, teacher)
  );
}

// 日付 → その講師の追加授業 (時刻順) の Map。MonthView のようにセル
// ごとに日付で引くビュー用 (毎セル全走査を避ける。examPrepByDate と同型)。
// teacher = null なら全講師分。
export function indexExtraLessonsByDate(extraLessons, teacher = null) {
  const m = new Map();
  if (!Array.isArray(extraLessons)) return m;
  for (const l of extraLessons) {
    if (teacher != null && !matchesTeacher(l, teacher)) continue;
    if (!m.has(l.date)) m.set(l.date, []);
    m.get(l.date).push(l);
  }
  for (const list of m.values()) list.sort(compareLessons);
  return m;
}

// 期間 [winStartStr, winEndStr] 内の追加授業 (日付順 → 時刻順)。
// teacher を渡すとその講師の担当分のみ。WeekView の直近バナー用。
export function upcomingExtraLessons(
  extraLessons,
  { teacher = null, winStartStr, winEndStr } = {}
) {
  if (!Array.isArray(extraLessons) || !winStartStr || !winEndStr) return [];
  return extraLessons
    .filter(
      (l) =>
        l.date >= winStartStr &&
        l.date <= winEndStr &&
        (teacher == null || matchesTeacher(l, teacher))
    )
    .sort((a, b) => a.date.localeCompare(b.date) || compareLessons(a, b));
}

// 一覧表示用の短いラベル: "中3A 英語" (cls 無しなら "中3 英語")。
// 整形規則は通常コマ / 調整カードと共通 (describeSlot に一元化)。
export function describeExtraLesson(lesson) {
  return describeSlot(lesson, "");
}
