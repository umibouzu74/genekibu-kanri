// ─── 追加授業 (ExtraLesson) の表示用ヘルパ ─────────────────────────
// 追加授業は「特定日付にのみ実施する単発コマ」で、週次 Slot と違い
// 曜日ベースのグリッド配置には乗らない。各ビューは日付索引でこれを
// 引いて、通常コマとは別のカード (「追」バッジ付き) として描画する。
// teacher マッチングは Slot と同じ規則 (biweekly.isSlotForTeacher:
// "·" 区切りの複数講師 / note 内の名前も拾う) を使う。

import { isSlotForTeacher } from "./biweekly";

// "19:00-20:20" → 開始時刻の分数 (パース不能は 0 で末尾に落とさず先頭寄せ)。
function startMin(time) {
  const m = String(time || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

// 同日内の表示順: 開始時刻 → 学年 → id (安定)。
function compareLessons(a, b) {
  return (
    startMin(a.time) - startMin(b.time) ||
    String(a.grade).localeCompare(String(b.grade)) ||
    a.id - b.id
  );
}

// 指定日の追加授業を開始時刻順で返す。
export function extraLessonsOnDate(extraLessons, dateStr) {
  if (!Array.isArray(extraLessons) || !dateStr) return [];
  return extraLessons.filter((l) => l.date === dateStr).sort(compareLessons);
}

// 指定日の「この講師が担当する」追加授業。MonthView (講師別カレンダー) 用。
export function extraLessonsForTeacherOnDate(extraLessons, teacher, dateStr) {
  return extraLessonsOnDate(extraLessons, dateStr).filter((l) =>
    isSlotForTeacher(l, teacher)
  );
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
        (teacher == null || isSlotForTeacher(l, teacher))
    )
    .sort((a, b) => a.date.localeCompare(b.date) || compareLessons(a, b));
}

// 一覧表示用の短いラベル: "中3A 英語" (cls 無しなら "中3 英語")。
export function describeExtraLesson(lesson) {
  if (!lesson) return "";
  const cls = lesson.cls && lesson.cls !== "-" ? lesson.cls : "";
  return `${lesson.grade}${cls} ${lesson.subj}`;
}
