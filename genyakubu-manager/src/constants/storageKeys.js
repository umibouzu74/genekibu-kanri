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
  // 附属の授業予定: 日付ごとの学校メモ (バス時刻) + 確認テストの手動指定。
  // 時程・休みは daySchedules / holidays / examPeriods のまま (utils/fuzokuPlan)
  fuzokuPlan: "genyakubu-fuzoku-plan",
  // 他校舎の授業 (講師が他の校舎・学校で授業をする曜日・時刻・期間)。
  // 塾の授業ではないので slots / extraLessons とは別 (utils/offsiteLessons)
  offsiteLessons: "genyakubu-offsite-lessons",
  // 引継ぎメモ (責任者が日々書き溜めて後任に渡す)。Firebase では
  // adminData/ (管理者だけが読める) に置く。データの初期化では消さない
  handoverNotes: "genyakubu-handover-notes",
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
  // 授業時間の集計の表示の好み (締め日・選んだ講師・合計に含める種別)。
  // 人が明示的に選んだものだけで、利用統計ではない (A18 とは別物)
  teachingMinutesClosingDay: "genyakubu-teaching-minutes-closing-day",
  teachingMinutesSelected: "genyakubu-teaching-minutes-selected",
  teachingMinutesIncluded: "genyakubu-teaching-minutes-included",
  // 予定表チェックで、予定表の講座とシステムのコマの対応を手で直した結果
  // (講座キー → { subjects } / { skip })。推定の上書きで、利用統計ではない
  yoteihyoMapping: "genyakubu-yoteihyo-mapping",
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
  // 授業時間の集計で見ている期間。講師名から月間を開いて戻ってきたときに
  // 今月へ戻らないように (タブ単位)
  teachingMinutesPeriod: "genyakubu-session-teaching-minutes-period",
};
