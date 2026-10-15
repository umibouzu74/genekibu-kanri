import { describe, expect, it } from "vitest";
import { MAIN_MENU, menuItemChord, visibleMainMenu } from "./mainMenu";
import { SIDEBAR_MENU } from "./sidebarMenu";
import { VIEWS } from "./views";
import { EVENT_SECTIONS } from "./eventKinds";
import { MASTER_TABS } from "./masterTabs";

const allItems = (menu) => menu.flatMap((cat) => cat.items);

describe("MAIN_MENU", () => {
  it("項目の key はメニュー全体で重複しない", () => {
    const keys = allItems(MAIN_MENU).map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // サイドバーに機能を足したらメニューにも足す (メニューから辿れない機能を作らない)。
  // メインメニュー自身と、メニューの先頭に大きく出すダッシュボードは除く
  it("サイドバーの項目 (ビュー / ダイアログ) はすべてメニューにある", () => {
    const inMenu = new Set(
      allItems(MAIN_MENU)
        .filter((i) => i.kind === "view" || i.kind === "modal")
        .map((i) => i.key.replace(/^nav:/, ""))
    );
    const sidebarKeys = SIDEBAR_MENU.flatMap((item) => [
      item.key,
      ...(item.children || []).map((c) => c.key),
    ])
      // 休講・テスト期間・イベント / コースマスター管理は中のセクション・タブで並べる
      .filter((k) => ![VIEWS.MENU, VIEWS.DASH, VIEWS.HOLIDAYS, VIEWS.MASTER].includes(k));
    expect(sidebarKeys.filter((k) => !inMenu.has(k))).toEqual([]);
  });

  it("休講・テスト期間・イベントのセクションとコースマスター管理のタブも全部ある", () => {
    const items = allItems(MAIN_MENU);
    for (const sec of EVENT_SECTIONS) {
      expect(items.some((i) => i.kind === "section" && i.section === sec.kind)).toBe(true);
    }
    for (const tab of MASTER_TABS) {
      expect(items.some((i) => i.kind === "masterTab" && i.tab === tab.key)).toBe(true);
    }
  });

  it("名前・アイコン・権限はサイドバーと同じ", () => {
    const testPrep = allItems(MAIN_MENU).find((i) => i.key === "nav:test-prep");
    expect(testPrep).toMatchObject({
      kind: "modal",
      modal: "testPrep",
      icon: "🎯",
      label: "テスト対策の振替・追加",
      adminOnly: true,
    });
    const handover = allItems(MAIN_MENU).find((i) => i.key === `nav:${VIEWS.HANDOVER}`);
    expect(handover).toMatchObject({ kind: "view", adminData: true });
  });
});

describe("月間予定の印刷・画像 (2026-10-15)", () => {
  it("講師・スタッフにダイアログの項目として並び、閲覧者にも出す", () => {
    const staff = MAIN_MENU.find((c) => c.key === "staff");
    const item = staff.items.find((i) => i.key === "nav:month-batch");
    expect(item).toMatchObject({
      kind: "modal",
      modal: "monthBatch",
      label: "月間予定の印刷・画像",
      adminOnly: false,
      adminData: false,
    });
    const viewer = allItems(visibleMainMenu({ isAdmin: false, canUseAdminData: false }));
    expect(viewer.some((i) => i.key === "nav:month-batch")).toBe(true);
  });
});

describe("menuItemChord", () => {
  it("ビューへ移る項目はそのビューの g chord を返す", () => {
    const items = allItems(MAIN_MENU);
    expect(menuItemChord(items.find((i) => i.key === `nav:${VIEWS.ABSENCE_FLOW}`))).toBe("a");
    expect(menuItemChord(items.find((i) => i.key === `nav:${VIEWS.MINUTES}`))).toBe("j");
  });

  it("ダイアログ・画面の中のセクション・タブには出さない (g では親の画面になる)", () => {
    const items = allItems(MAIN_MENU);
    for (const item of items.filter((i) => i.kind !== "view")) {
      expect(menuItemChord(item)).toBeNull();
    }
    expect(menuItemChord(null)).toBeNull();
  });
});

describe("visibleMainMenu", () => {
  it("閲覧者には管理者専用の項目と、管理者だけのデータの画面を出さない", () => {
    const items = allItems(visibleMainMenu({ isAdmin: false, canUseAdminData: false }));
    expect(items.some((i) => i.adminOnly)).toBe(false);
    expect(items.some((i) => i.adminData)).toBe(false);
    expect(items.some((i) => i.label === "代行確定一覧")).toBe(true);
  });

  it("管理者には全部出す", () => {
    const menu = visibleMainMenu({ isAdmin: true });
    expect(allItems(menu)).toHaveLength(allItems(MAIN_MENU).length);
  });

  it("Firebase 未設定の端末 (canUseAdminData だけ) では引継ぎメモは出す", () => {
    const items = allItems(visibleMainMenu({ isAdmin: false, canUseAdminData: true }));
    expect(items.some((i) => i.label === "引継ぎメモ")).toBe(true);
    expect(items.some((i) => i.label === "欠勤組み換え")).toBe(false);
  });
});
