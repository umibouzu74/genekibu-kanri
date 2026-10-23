// ─── 授業時間の集計のタブ ───────────────────────────────────────────
// 授業時間の集計 (TeachingMinutesView) のタブ。画面のタブ切替と、サイドバー
// (開いている間だけタブ名を出す)・メインメニュー・Cmd+K の導線で共有する
// (STAFF_TABS と同じ狙い。画面名「授業時間の集計」からは「バイト出勤表」に
// 辿り着けない)。タブを増やすときはここに足すこと — 画面のタブもこの配列から作る。

export const MINUTES_TAB = Object.freeze({
  SUMMARY: "summary",
  ATTENDANCE: "attendance",
});

export const DEFAULT_MINUTES_TAB = MINUTES_TAB.SUMMARY;

export const MINUTES_TABS = Object.freeze([
  { key: MINUTES_TAB.SUMMARY, icon: "⏱", label: "授業時間" },
  { key: MINUTES_TAB.ATTENDANCE, icon: "🧾", label: "バイト出勤表" },
]);

// 未知のタブキーを既定へ丸める。
export function normalizeMinutesTab(tab) {
  return MINUTES_TABS.some((t) => t.key === tab) ? tab : DEFAULT_MINUTES_TAB;
}
