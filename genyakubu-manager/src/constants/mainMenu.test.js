import { describe, expect, it } from "vitest";
import { MAIN_MENU, menuItemChord, visibleMainMenu } from "./mainMenu";
import { SIDEBAR_MENU } from "./sidebarMenu";
import { VIEWS } from "./views";
import { EVENT_SECTIONS } from "./eventKinds";
import { MASTER_TABS } from "./masterTabs";
import { TIMETABLE_SECTION, TIMETABLE_SECTIONS } from "./timetableSections";
import { KOSHU_SEASONS } from "../timetable-builder/utils/seasons";

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
      // 休講・テスト期間・イベント / コースマスター管理は中のセクション・タブ、
      // 講習時間割作成は季節で並べる
      .filter(
        (k) => ![VIEWS.MENU, VIEWS.DASH, VIEWS.HOLIDAYS, VIEWS.MASTER, VIEWS.BUILDER].includes(k)
      );
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

  // 時間割管理は長い画面で、画面名からは下の方のカードに辿り着けない (C4)。
  // 一覧・全体像・時刻一括変換は「時間割管理」そのものの項目から開く
  it("時間割管理の表示期間設定・コース別終講日・授業セットもある", () => {
    const items = allItems(MAIN_MENU);
    for (const key of [
      TIMETABLE_SECTION.DISPLAY_CUTOFF,
      TIMETABLE_SECTION.COHORT_CUTOFF,
      TIMETABLE_SECTION.CLASS_SETS,
    ]) {
      const item = items.find((i) => i.kind === "timetableSection" && i.section === key);
      const sec = TIMETABLE_SECTIONS.find((s) => s.key === key);
      // 名前・アイコンは TIMETABLE_SECTIONS (サイドバーの子項目) と同じ
      expect(item).toMatchObject({ icon: sec.icon, label: sec.label, adminOnly: false });
    }
    // 時間割管理そのものも残す
    expect(items.some((i) => i.key === `nav:${VIEWS.TIMETABLE}`)).toBe(true);
  });

  // 講習は季節ごとに別の時間割 (2026-10-23)。「講習時間割作成」1 つではなく
  // 季節ごとに並べ、名前・アイコンは KOSHU_SEASONS (サイドバーの子項目) と同じ
  it("講習時間割作成は春期・夏期・冬期の 3 つ", () => {
    const items = allItems(MAIN_MENU).filter((i) => i.kind === "koshuSeason");
    expect(items.map((i) => i.season)).toEqual(KOSHU_SEASONS.map((s) => s.key));
    for (const item of items) {
      const s = KOSHU_SEASONS.find((x) => x.key === item.season);
      expect(item).toMatchObject({ icon: s.icon, label: `${s.label}の時間割` });
    }
    expect(items.every((i) => menuItemChord(i) === null)).toBe(true);
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

// バイト出勤表は経理 (閲覧者) が出すことが多い (2026-10-23)。授業時間の集計の
// タブだが、メニューから直接開けて、閲覧者にも出す
describe("バイト出勤表 (2026-10-23)", () => {
  it("講師・スタッフにタブの項目として並び、閲覧者にも出す", () => {
    const staff = MAIN_MENU.find((c) => c.key === "staff");
    const item = staff.items.find((i) => i.kind === "minutesTab");
    expect(item).toMatchObject({ tab: "attendance", icon: "🧾", label: "バイト出勤表" });
    expect(item.adminOnly).toBeFalsy();
    const viewer = allItems(visibleMainMenu({ isAdmin: false, canUseAdminData: false }));
    expect(viewer.some((i) => i.kind === "minutesTab")).toBe(true);
    expect(viewer.some((i) => i.key === `nav:${VIEWS.MINUTES}`)).toBe(true);
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
