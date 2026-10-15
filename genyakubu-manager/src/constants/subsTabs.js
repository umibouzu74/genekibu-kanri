// ─── 授業管理のタブ ─────────────────────────────────────────────────
// 授業管理 (SubstituteView) のタブのうち、名前で直接開けるもの。Cmd+K と
// メインメニューで共有する (画面名「授業管理」からは「時間割調整一覧」などに
// 辿り着けないので、タブ名で呼べるようにするのが目的)。
// tab の値は SubstituteView の setTab / initFilter.tab と同じ。

export const SUBS_TABS = Object.freeze([
  { tab: "list", label: "代行一覧" },
  { tab: "adjustment", label: "時間割調整一覧" },
  { tab: "override", label: "回数補正一覧" },
  { tab: "tally", label: "月次集計" },
  { tab: "chain", label: "玉突き代行" },
]);
