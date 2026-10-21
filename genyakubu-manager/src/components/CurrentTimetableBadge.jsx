import { useMemo } from "react";
import { useToday } from "../hooks/useToday";
import { fmtMD } from "../utils/dateHelpers";
import { describeCurrentTimetables } from "../utils/timetable";

// ヘッダの「今の時間割」の表示 (読むだけ)。
// 講師の一覧・週計・全講師一覧・タイムテーブルなど日付を持たない画面は、
// 今日の日付で決まる時間割を表示する (utils/timetable.filterSlotsCurrentOn)。
// 以前はここが端末ごとのセレクタで、選んだ時間割を localStorage に覚えて
// いたため、期切替のあと閲覧用の端末だけ前の期のまま、が起きた (2026-10-21)。
// いまは切り替えの操作は無く、時間割の開始日・終了日で自動的に変わる。
//
// 同じ学年のコマが 2 つの時間割から出ている (前の期に終了日が入っていない)
// ときは目立たせる。日付で見る画面 (ダッシュボード・月間) でもコマが二重に
// 出ている状態なので、時間割管理で終了日を入れれば直る。

function statusSuffix(timetable, status) {
  if (status === "upcoming") return `（${fmtMD(timetable.startDate)}〜）`;
  if (status === "ended") {
    return timetable.endDate ? `（〜${fmtMD(timetable.endDate)} 終了）` : "（終了）";
  }
  return "";
}

const MAX_OVERLAP_GRADES = 3;

export function CurrentTimetableBadge({ slots, timetables, onOpenTimetables }) {
  // 「今日」はタブを開いたまま日付を跨いでも更新される (useToday)。
  // hooks は早期 return より前に呼ぶ (順序を変えない)。ヘッダは App の再描画の
  // たびに描かれるので、内訳はコマ・時間割・日付が変わったときだけ作り直す
  const today = useToday();
  const { timetables: current, overlaps } = useMemo(
    () => describeCurrentTimetables(slots, timetables, today),
    [slots, timetables, today]
  );
  // 時間割が 1 つだけなら切り替わることが無いので出さない (従来のセレクタと同じ)
  if (!timetables || timetables.length <= 1) return null;
  if (current.length === 0) return null;

  const label = current
    .map(({ timetable, status }) => `${timetable.name}${statusSuffix(timetable, status)}`)
    .join("・");
  const hasOverlap = overlaps.length > 0;
  const overlapNames = hasOverlap
    ? [...new Set(overlaps.flatMap((o) => o.timetables.map((t) => t.name)))].join("・")
    : "";
  const overlapGrades = overlaps.map((o) => o.grade);
  const gradeText =
    overlapGrades.slice(0, MAX_OVERLAP_GRADES).join("・") +
    (overlapGrades.length > MAX_OVERLAP_GRADES
      ? ` ほか ${overlapGrades.length - MAX_OVERLAP_GRADES} 学年`
      : "");
  const title =
    "週間・講師の一覧・全講師一覧・タイムテーブルなどは、今日の日付で決まる時間割を表示します" +
    "（時間割の開始日・終了日で自動的に切り替わります。端末ごとの設定はありません）" +
    (hasOverlap
      ? `\n⚠ ${gradeText} のコマが ${overlapNames} の両方から出ています。` +
        "前の時間割に終了日を入れてください（時間割管理 → 時間割一覧）"
      : "") +
    (onOpenTimetables ? "\nクリックで時間割管理を開きます" : "");

  const tone = hasOverlap
    ? { color: "#8a4a00", background: "#fff6e5", border: "1px solid #f0c070" }
    : { color: "#2a4a8e", background: "#f0f4ff", border: "1px solid #ccd6f0" };
  const content = (
    <>
      <span aria-hidden="true">🗓</span>
      <span>{label}</span>
      {hasOverlap && <span>⚠ {gradeText} が重複</span>}
    </>
  );
  const style = {
    display: "inline-flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    maxWidth: "100%",
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    ...tone,
  };
  // 読み上げ名は見た目と同じ中身 + 説明 (title は読み上げに頼れないので
  // 名前に入れる)
  const ariaLabel =
    `今の時間割: ${label}` + (hasOverlap ? `（${gradeText} が ${overlapNames} で重複）` : "");

  if (onOpenTimetables) {
    return (
      <button
        type="button"
        className="no-print"
        onClick={onOpenTimetables}
        title={title}
        aria-label={ariaLabel}
        style={{ ...style, cursor: "pointer" }}
      >
        {content}
      </button>
    );
  }
  return (
    <span className="no-print" role="status" title={title} aria-label={ariaLabel} style={style}>
      {content}
    </span>
  );
}
