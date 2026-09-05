import { useCallback } from "react";
import { nextNumericId } from "../../utils/schema";

// ─── 学年タブの追加・並べ替え・削除 (RegularBuilderApp から 2026-09-05 に
// 切り出し)。activeTab (削除対象) は App が選択状態から解いて渡す。
//   onTabAdded(id)  … 追加後にその学年を選んで設定パネルを開く (App 側)
//   onTabRemoved()  … 削除後に選択を解く (App 側)
export function useTabOps({ project, saveProject, confirm, activeTab, onTabAdded, onTabRemoved }) {
  const addTab = useCallback(() => {
    // id は現在の描画時点で確定させ、追加後にその学年の設定を開く
    // (単独編集前提 — 同時編集での id 衝突は考慮しない)
    const id = nextNumericId(project.tabs);
    saveProject((p) => {
      // 直前の学年から曜日・時限の選択を引き継ぐ (講習版の「他へコピー」相当)
      const last = p.tabs[p.tabs.length - 1];
      return {
        ...p,
        tabs: [
          ...p.tabs,
          {
            id,
            name: `学年${id}`,
            grade: "",
            classes: [],
            days: last ? [...last.days] : ["月", "火", "水", "木", "金"],
            periodIds: last ? [...last.periodIds] : p.periods.map((x) => x.id),
            schedule: {},
          },
        ],
      };
    });
    onTabAdded?.(id);
  }, [project.tabs, saveProject, onTabAdded]);

  // 学年チップの並べ替え (セクションの並びはタブ定義順に追従する)
  const reorderTabs = useCallback(
    (fromIdx, toIdx) =>
      saveProject(
        (p) => {
          if (
            fromIdx === toIdx ||
            fromIdx < 0 ||
            toIdx < 0 ||
            fromIdx >= p.tabs.length ||
            toIdx >= p.tabs.length
          )
            return p;
          const tabs = [...p.tabs];
          const [moved] = tabs.splice(fromIdx, 1);
          tabs.splice(toIdx, 0, moved);
          return { ...p, tabs };
        },
        { atomic: true }
      ),
    [saveProject]
  );

  const removeTab = useCallback(async () => {
    if (!activeTab) return;
    const cellCount = Object.keys(activeTab.schedule).length;
    const ok = await confirm({
      title: "学年の削除",
      message: `学年「${activeTab.name}」を削除しますか？\n入力済みのセル ${cellCount} 件も削除されます。`,
      okLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    saveProject((p) => ({ ...p, tabs: p.tabs.filter((t) => t.id !== activeTab.id) }));
    onTabRemoved?.();
  }, [activeTab, confirm, saveProject, onTabRemoved]);

  return { addTab, reorderTabs, removeTab };
}
