// ─── コースマスター管理のタブ ───────────────────────────────────────
// MasterView のタブ切替と、サイドバー / Cmd+K の導線で共有する。
// 画面名 (「コースマスター管理」) からは「隔週管理」に辿り着けないので、
// タブ名をサイドバーに出すのが目的 (EVENT_SECTIONS と同じ狙い)。
// タブを増やすときはここに足すこと — TabSwitcher もこの配列から作る。

export const MASTER_TAB = Object.freeze({
  LIST: "list",
  BIWEEKLY: "biweekly",
  EXCEL: "excel",
});

export const DEFAULT_MASTER_TAB = MASTER_TAB.LIST;

export const MASTER_TABS = Object.freeze([
  { key: MASTER_TAB.LIST, icon: "📃", label: "コマ一覧" },
  { key: MASTER_TAB.BIWEEKLY, icon: "🔁", label: "隔週管理" },
  { key: MASTER_TAB.EXCEL, icon: "▦", label: "時間割表" },
]);

// 未知のタブキー (古い localStorage 等) を既定へ丸める。
export function normalizeMasterTab(tab) {
  return MASTER_TABS.some((t) => t.key === tab) ? tab : DEFAULT_MASTER_TAB;
}
