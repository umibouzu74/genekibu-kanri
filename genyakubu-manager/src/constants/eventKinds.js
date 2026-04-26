// ─── Event kind constants ───────────────────────────────────────────
// 休講・テスト期間・特別イベントを横断的に扱う UI (EventCalendarView,
// EventSummaryCards, CommandPalette など) で共有するキーとメタデータ。
// 特別イベントの細分化された type メタは constants/specialEvents.js を
// 参照する。

export const EVENT_KIND = Object.freeze({
  HOLIDAY: "holiday",
  EXAM: "exam",
  SPECIAL: "special",
});

export const EVENT_KIND_LABELS = Object.freeze({
  [EVENT_KIND.HOLIDAY]: "休講",
  [EVENT_KIND.EXAM]: "テスト期間",
  [EVENT_KIND.SPECIAL]: "特別イベント",
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
