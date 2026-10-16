// ─── 時間割管理の画面に縦に並ぶセクション ───────────────────────────
// TimetableManagerView の目次とアンカー id、サイドバーの子項目 (時間割管理を
// 開いている間だけ出す)・メインメニュー・Cmd+K で共有する (EVENT_SECTIONS と
// 同じ狙い)。この画面はカードが 6 枚縦に並んで長く、画面名 (「時間割管理」)
// からは「コース別終講日」「授業セット」に辿り着けない。コース別終講日は
// 下の方にあり、1 学年のコースが多いと折りたたまれて見つけにくかった (C4)。
//
// 並びは画面の上からの順 (目次もこの順に出す)。セクションを足すときはここに
// 足し、画面の側で timetableSectionAnchorId の id を付けること。
// adminOnly のセクションは閲覧者の画面に描かれない (時刻一括変換) ので、
// 目次・サイドバー・Cmd+K にも出さない。

export const TIMETABLE_SECTION = Object.freeze({
  LIST: "list",
  TIME_BULK: "timeBulk",
  OVERVIEW: "overview",
  DISPLAY_CUTOFF: "displayCutoff",
  COHORT_CUTOFF: "cohortCutoff",
  CLASS_SETS: "classSets",
});

export const TIMETABLE_SECTIONS = Object.freeze([
  { key: TIMETABLE_SECTION.LIST, icon: "🗂", label: "時間割一覧" },
  { key: TIMETABLE_SECTION.TIME_BULK, icon: "🕐", label: "時刻一括変換", adminOnly: true },
  { key: TIMETABLE_SECTION.OVERVIEW, icon: "📏", label: "期間の全体像" },
  { key: TIMETABLE_SECTION.DISPLAY_CUTOFF, icon: "📆", label: "表示期間設定" },
  { key: TIMETABLE_SECTION.COHORT_CUTOFF, icon: "🏁", label: "コース別終講日" },
  { key: TIMETABLE_SECTION.CLASS_SETS, icon: "🔢", label: "授業セット" },
]);

/** 見ている人の画面に出るセクションだけ (閲覧者には adminOnly を出さない) */
export function visibleTimetableSections(isAdmin) {
  return TIMETABLE_SECTIONS.filter((s) => !s.adminOnly || isAdmin);
}

// セクションのアンカー id ("tt-section-cohortCutoff" 等)。画面が付ける id と、
// 目次・サイドバー・メインメニューからのスクロール要求で共有する。
export function timetableSectionAnchorId(key) {
  return `tt-section-${key}`;
}
