// ─── 予定表チェックの表示用の言い回し ──────────────────────────────

import { weekdayOf } from "./highSchoolSheet";

/** 講座の名前 (「高1 高松西高校」「高3 ● 共通テスト英語(ハイレベル)」) */
export function courseLabel(course) {
  if (!course) return "";
  const g = (course.grades || []).join("・");
  if (course.mode === "mark") {
    const wd = String(course.key || "").split("mark:")[1] || "";
    return `${g} マークテスト (${[wd && `${wd}曜`, course.campus].filter(Boolean).join("・")})`;
  }
  if (course.mode === "symbol") {
    return `${g} ${course.symbol || ""} ${course.name || "(凡例なし)"}`.replace(/\s+/g, " ").trim();
  }
  return `${g} ${course.name || ""}`.trim();
}

/** "高1|高松西 数学" → "高1 高松西 数学" */
export function subjectLabel(key) {
  return String(key || "").replace("|", " ");
}

/** "2026-10-09" → "10/9 (金)" (アプリの他の画面と同じ書き方) */
export function dateLabel(date) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))} (${weekdayOf(date)})`;
}
