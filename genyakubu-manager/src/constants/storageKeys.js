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
  // 廃止 (2026-10-21)。ヘッダの時間割セレクタの端末ごとの選択だった。
  // 「今の時間割」は日付から決める (utils/timetable.filterSlotsCurrentOn)。
  // 古い端末に残った値を起動時・初期化で消すためだけに残してある
  activeTimetableId: "genyakubu-active-timetable",
  // この端末で最後にクラウド (Firebase) から読めた日時 (ミリ秒)。読めないときの
  // 警告に「◯日時点のデータ」と出すため (firebase/cloudState)
  lastCloudRead: "genyakubu-last-cloud-read",
  examPeriods: "genyakubu-exam-periods",
  teacherSubjects: "genyakubu-teacher-subjects",
  // 講師名 → よみ。バイトにも常勤講師にも付けたいので partTimeStaff の
  // 項目ではなく teacherSubjects と同型の独立マップにしてある。
  teacherKana: "genyakubu-teacher-kana",
  classSets: "genyakubu-class-sets",
  sessionOverrides: "genyakubu-session-overrides",
  examPrepSchedules: "genyakubu-exam-prep-schedules",
  specialEvents: "genyakubu-special-events",
  // 特別イベントの表示設定 (全員共通、管理者が決める)。講師の月間予定に出す
  // 種別 { monthTypes: { school: false, ... } } (utils/specialEventDisplay)
  specialEventDisplay: "genyakubu-special-event-display",
  extraLessons: "genyakubu-extra-lessons",
  daySchedules: "genyakubu-day-schedules",
  // 附属の授業予定: 日付ごとの学校メモ (バス時刻) + 確認テストの手動指定。
  // 時程・休みは daySchedules / holidays / examPeriods のまま (utils/fuzokuPlan)
  fuzokuPlan: "genyakubu-fuzoku-plan",
  // 他校舎の授業 (講師が他の校舎・学校で授業をする曜日・時刻・期間)。
  // 塾の授業ではないので slots / extraLessons とは別 (utils/offsiteLessons)
  offsiteLessons: "genyakubu-offsite-lessons",
  // 予備校部の予定 (年間カレンダーの上半分。休校日・出勤者休日・行事)。
  // 現役部の特別イベントとは別に持つ (混ぜると講師の月間などに漏れる)。
  // utils/yobikoEvents
  yobikoEvents: "genyakubu-yobiko-events",
  // 引継ぎメモ (責任者が日々書き溜めて後任に渡す)。Firebase では
  // adminData/ (管理者だけが読める) に置く。データの初期化では消さない
  handoverNotes: "genyakubu-handover-notes",
  // 講師の所属 (年度ごとの区分の変更)。名前で持つ (teacherKana と同じく、
  // 時間割のコマにしか出てこない常勤にも付けたいので partTimeStaff の項目に
  // しない)。utils/teacherAffiliations
  teacherAffiliations: "genyakubu-teacher-affiliations",
  // 有給・半休 (現役部 常勤の休暇の記録)。人事の記録なので adminData/ に置く。
  // データの初期化では消さない (引継ぎメモと同じ)。utils/staffLeave
  staffLeave: "genyakubu-staff-leave",
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
  // 授業時間の集計の「バイト出勤表」タブの表示の好み (締め日 (既定 20 日)・単価・
  // 別の出勤にする空き時間)。人が明示的に選んだもので、利用統計ではない (A18 とは
  // 別物)。端末ごと (経理の端末は経理の端末の値)
  partTimeAttendanceClosingDay: "genyakubu-part-time-attendance-closing-day",
  partTimeAttendanceUnitPrice: "genyakubu-part-time-attendance-unit-price",
  partTimeAttendanceGapMinutes: "genyakubu-part-time-attendance-gap-minutes",
  // バイト出勤表の 1 日ずつの手での上書き ({ "<開始日>_<終了日>": { 講師名: { 日付: 日数 } } })。
  // その月の表だけのもので、アプリのデータ (appData) には書き戻さない = この端末だけ。
  // 期間は新しい方から 12 か月ぶん (utils/partTimeAttendance.setAttendanceOverride)
  partTimeAttendanceOverrides: "genyakubu-part-time-attendance-overrides",
  // サイドバーで人が開いたカテゴリ (constants/menuCategories の key の配列)。
  // 明示的な開け閉めの保存で、利用統計ではない (A18 とは別物)
  sidebarOpenCategories: "genyakubu-sidebar-open-categories",
  // 予定表チェックで、予定表の講座とシステムのコマの対応を手で直した結果
  // (講座キー → { subjects } / { skip })。推定の上書きで、利用統計ではない。
  // **旧版の端末だけの保存先** (2026-10-16 から yoteihyoCourseMapping へ移した)。
  // 読むだけで、共有した時点で消す (YoteihyoCheckView)
  yoteihyoMapping: "genyakubu-yoteihyo-mapping",
  // 予定表チェックの講座の対応 (同期データ、appData)。[{ course, subjects } | { course, skip }]。
  // 講座キーは RTDB のキーに使えない文字を含みうるので配列で持つ (utils/yoteihyo/courseMapping)
  yoteihyoCourseMapping: "genyakubu-yoteihyo-course-mapping",
  // 予定表チェックで「確認済み (対応不要)」にした食い違い (同期データ、appData)。
  // [{ date, course, fp, at }] (utils/yoteihyo/confirmations)
  yoteihyoConfirmed: "genyakubu-yoteihyo-confirmed",
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
  // 授業時間の集計で開いているタブ (授業時間 / バイト出勤表。constants/minutesTabs)
  teachingMinutesTab: "genyakubu-session-teaching-minutes-tab",
  // 講習時間割作成で開いている季節 (春期 / 夏期 / 冬期)。新しいタブでは
  // 次に来る講習から始める (timetable-builder/utils/seasons.defaultKoshuSeason)
  koshuSeason: "genyakubu-session-koshu-season",
};
