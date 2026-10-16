import { describe, expect, it } from "vitest";
import {
  SIDEBAR_CATEGORIES,
  SIDEBAR_CATEGORY_BY_VIEW,
  SIDEBAR_MENU,
  SIDEBAR_PINNED,
} from "./sidebarMenu";
import { MENU_CATEGORIES } from "./menuCategories";
import { MAIN_MENU } from "./mainMenu";
import { VIEWS } from "./views";
import { STAFF_TAB } from "./staffTabs";

// サイドバーはカテゴリごとに開け閉めする (2026-10-16)。項目はどれかの
// カテゴリに入れる (メインメニュー・ダッシュボードだけは常に上)
describe("SIDEBAR_MENU のカテゴリ", () => {
  it("常に上に出すのはメインメニューとダッシュボードだけ", () => {
    expect(SIDEBAR_PINNED.map((i) => i.key)).toEqual([VIEWS.MENU, VIEWS.DASH]);
  });

  it("ほかの項目はどれも知っているカテゴリに入り、key は重複しない", () => {
    const known = new Set(MENU_CATEGORIES.map((c) => c.key));
    for (const item of SIDEBAR_MENU) {
      if (SIDEBAR_PINNED.includes(item)) continue;
      expect(known.has(item.category)).toBe(true);
    }
    const keys = SIDEBAR_MENU.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SIDEBAR_MENU.some((i) => i.children)).toBe(false);
  });

  it("カテゴリの名前・並びはメインメニューと同じで、空のカテゴリは無い", () => {
    expect(SIDEBAR_CATEGORIES.map((c) => [c.key, c.label])).toEqual(
      MAIN_MENU.map((c) => [c.key, c.label])
    );
    expect(SIDEBAR_CATEGORIES.every((c) => c.items.length > 0)).toBe(true);
  });

  it("ビュー → カテゴリを引ける (今いる画面のカテゴリを開くため)", () => {
    expect(SIDEBAR_CATEGORY_BY_VIEW.get(VIEWS.MASTER)).toBe("timetable");
    expect(SIDEBAR_CATEGORY_BY_VIEW.get(VIEWS.LEAVE)).toBe("staff");
    expect(SIDEBAR_CATEGORY_BY_VIEW.has(VIEWS.DASH)).toBe(false);
  });

  it("講師管理のタブ (講師の所属) はメインメニューから直接開ける", () => {
    const items = MAIN_MENU.flatMap((c) => c.items);
    expect(items.some((i) => i.kind === "staffTab" && i.tab === STAFF_TAB.AFFILIATION)).toBe(true);
  });
});
