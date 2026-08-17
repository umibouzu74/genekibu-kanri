// ─── localStorage keys ──────────────────────────────────────────────
// Single source of truth for all localStorage key strings used by the
// application.  Shared between App (read/write) and ErrorBoundary
// (clear-all on fatal error).

export const LS = {
  slots: "genyakubu-slots",
  holidays: "genyakubu-holidays",
  subs: "genyakubu-substitutions",
  partTime: "genyakubu-part-time-staff",
  subjectCategories: "genyakubu-subject-categories",
  subjects: "genyakubu-subjects",
  biweeklyBase: "genyakubu-biweekly-base",
  biweeklyAnchors: "genyakubu-biweekly-anchors",
  adjustments: "genyakubu-adjustments",
  timetables: "genyakubu-timetables",
  displayCutoff: "genyakubu-display-cutoff",
  activeTimetableId: "genyakubu-active-timetable",
  examPeriods: "genyakubu-exam-periods",
  teacherSubjects: "genyakubu-teacher-subjects",
  // 講師名 → よみ。バイトにも常勤講師にも付けたいので partTimeStaff の
  // 項目ではなく teacherSubjects と同型の独立マップにしてある。
  teacherKana: "genyakubu-teacher-kana",
  classSets: "genyakubu-class-sets",
  sessionOverrides: "genyakubu-session-overrides",
  examPrepSchedules: "genyakubu-exam-prep-schedules",
  specialEvents: "genyakubu-special-events",
  extraLessons: "genyakubu-extra-lessons",
  daySchedules: "genyakubu-day-schedules",
  eventVisibility: "genyakubu-event-visibility",
  regularBuilderProject: "genyakubu-regular-builder-project",
  // 通常時間割作成の表示トグル (1 bit)。明示トグルの保存であり、利用統計から
  // UI を自動変形する類 (A18 で却下) とは別物 (講習の usePersistedToggle と同型)。
  regularBuilderHideEmpty: "genyakubu-regular-builder-hide-empty",
  regularBuilderCompact: "genyakubu-regular-builder-compact",
  regularBuilderSplitCampus: "genyakubu-regular-builder-split-campus",
  regularBuilderSummary: "genyakubu-regular-builder-summary",
  regularBuilderSummarySpan: "genyakubu-regular-builder-summary-span",
  regularBuilderWeekView: "genyakubu-regular-builder-week-view",
  regularBuilderMultiDay: "genyakubu-regular-builder-multi-day",
  regularBuilderMonoPrint: "genyakubu-regular-builder-mono-print",
};

// ─── sessionStorage keys ────────────────────────────────────────────
// タブ単位の一時 UI 状態。リロードでは消えず、新しいタブ・ウィンドウでは
// まっさらから始まる (ビューの復元に localStorage を使うと、別タブで
// 開いた瞬間に前回の深い画面へ飛ばされてしまう)。
export const SS = {
  view: "genyakubu-session-view",
  teacher: "genyakubu-session-teacher",
  regularBuilderDay: "genyakubu-session-regb-day",
  regularBuilderDays: "genyakubu-session-regb-days",
};
