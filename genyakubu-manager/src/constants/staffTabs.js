// ─── 講師管理のタブ ─────────────────────────────────────────────────
// 講師管理 (旧「バイト管理」。StaffManagerView) のタブ。画面のタブ切替と、
// サイドバー (開いている間だけタブ名を出す)・メインメニュー・Cmd+K の導線で
// 共有する (MASTER_TABS と同じ狙い。画面名からは「講師の所属」に辿り着けない)。
// タブを増やすときはここに足すこと — 画面のタブもこの配列から作る。

export const STAFF_TAB = Object.freeze({
  STAFF: "staff",
  AFFILIATION: "affiliation",
  TEACHERS: "teachers",
  SUBJECTS: "subjects",
});

// 既定はバイト一覧 (旧「バイト管理」を開いたときと同じ画面から始める)
export const DEFAULT_STAFF_TAB = STAFF_TAB.STAFF;

export const STAFF_TABS = Object.freeze([
  { key: STAFF_TAB.STAFF, icon: "👥", label: "バイト一覧" },
  { key: STAFF_TAB.AFFILIATION, icon: "🏷", label: "講師の所属" },
  { key: STAFF_TAB.TEACHERS, icon: "📚", label: "担当教科・よみ" },
  { key: STAFF_TAB.SUBJECTS, icon: "📖", label: "教科マスター" },
]);

// 未知のタブキーを既定へ丸める。
export function normalizeStaffTab(tab) {
  return STAFF_TABS.some((t) => t.key === tab) ? tab : DEFAULT_STAFF_TAB;
}
