// ─── View identifiers ──────────────────────────────────────────────
// Central definition of the view keys used in App state. Prevents typos
// and makes it easier to add or rename views.
export const VIEWS = Object.freeze({
  DASH: "dash",
  WEEK: "week",
  MONTH: "month",
  ALL: "all",
  MASTER: "master",
  HOLIDAYS: "holidays",
  SUBS: "subs",
  CONFIRMED_SUBS: "confirmed-subs",
  STAFF: "staff",
  COMPARE: "compare",
  TIMETABLE: "timetable",
  SHARED: "shared",
  ABSENCE_FLOW: "absence-flow",
  EVENTS: "events",
  BUILDER: "builder",
  REGULAR_BUILDER: "regular-builder",
  // 附属コース (水曜) の月間予定: 時程・科目・確認テスト・学校メモ
  FUZOKU_PLAN: "fuzoku-plan",
  // 引継ぎメモ (責任者が日々書き溜めて後任に渡す。管理者だけが読める)
  HANDOVER: "handover",
});
