// ─── Event kind constants ───────────────────────────────────────────
// 休講・テスト期間・特別イベントを横断的に扱う UI (EventCalendarView,
// EventSummaryCards, CommandPalette など) で共有するキーとメタデータ。
// 特別イベントの細分化された type メタは constants/specialEvents.js を
// 参照する。

import { EXTRA_LESSON_COLOR } from "./colors";

export const EVENT_KIND = Object.freeze({
  HOLIDAY: "holiday",
  EXAM: "exam",
  SPECIAL: "special",
  // 追加授業 (単発コマ)。イベントカレンダーでの表示用 (H1b)。
  // データ実体は ExtraLesson (schema v15) で、イベント系とは別リソース。
  EXTRA_LESSON: "extraLesson",
  // 特別時程 (日単位の時刻読み替え + 部分休講)。データ実体は DaySchedule
  // (schema v16)。休講と同様に常時表示 (visibility トグル対象外)。
  DAY_SCHEDULE: "daySchedule",
});

export const EVENT_KIND_LABELS = Object.freeze({
  [EVENT_KIND.HOLIDAY]: "休講",
  [EVENT_KIND.EXAM]: "テスト期間",
  [EVENT_KIND.SPECIAL]: "特別イベント",
  [EVENT_KIND.EXTRA_LESSON]: "追加授業",
  [EVENT_KIND.DAY_SCHEDULE]: "特別時程",
});

// チップ・バッジで使う色 (背景・前景・アクセント)。特別イベントの
// 種別ごとの色は specialEventTypeMeta() で別個に取得する。
export const HOLIDAY_META = Object.freeze({
  bg: "#f5dada",
  fg: "#a02020",
  accent: "#c44040",
});

export const EXAM_META = Object.freeze({
  bg: "#fde8c8",
  fg: "#7a4a10",
  accent: "#e0a030",
  icon: "📝",
});

// テスト期間のタグ ("桜井" 等) の表示色。チップ・バッジ用で複数箇所から参照する。
export const TAG_META = Object.freeze({
  bg: "#e6eef9",
  fg: "#234a78",
  accent: "#b4cde8",
});

// 追加授業のバッジ色。他ビュー (Dashboard / MonthView) の「追」バッジと
// 同じ EXTRA_LESSON_COLOR (緑系) から組み立てて統一感を保つ。
export const EXTRA_LESSON_META = Object.freeze({
  bg: EXTRA_LESSON_COLOR.bg,
  fg: EXTRA_LESSON_COLOR.deep,
  accent: EXTRA_LESSON_COLOR.color,
});

// 特別時程のバッジ色 (紫系)。Dashboard / ExcelGrid / WeekView の
// 特別時程バナー・チップと同系色で統一する。
export const DAY_SCHEDULE_META = Object.freeze({
  bg: "#efeafa",
  fg: "#4a3a8e",
  accent: "#8a78c8",
  icon: "⏰",
});
