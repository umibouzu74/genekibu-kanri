// ─── メインメニュー (2026-10-15) ─────────────────────────────────────
// 起動時の画面 (VIEWS.MENU) と、ダッシュボードの下の小さいメニューが共有する
// 定義。機能をカテゴリに分け、ボタンでその場所 (ビュー / 画面の中の
// セクション・タブ / ダイアログ) へ飛ぶ。
//
// - **アイコン・名前・権限はサイドバー (constants/sidebarMenu) から引く**
//   (navItem)。画面の中のセクションは EVENT_SECTIONS / TIMETABLE_SECTIONS、
//   コースマスター管理のタブは MASTER_TABS、授業管理のタブは SUBS_TABS から。名前を書き起こさない
//   (サイドバーと食い違わないように)
// - カテゴリの名前・アイコン・並びは constants/menuCategories (サイドバーと共有)
// - 並びは固定。使用頻度・履歴で並べ替えない (CLAUDE.md の A18)
// - 閲覧者には管理者専用の項目を出さない (visibleMainMenu)
//
// 項目の kind:
//   "view"      … view へ移る
//   "modal"     … ダイアログを開く (modal = サイドバーの modal と同じ名前)
//   "section"   … 休講・テスト期間・イベント画面の中のマネージャへ (section = EVENT_KIND)
//   "timetableSection" … 時間割管理の画面の中のカードへ (section = TIMETABLE_SECTION)
//   "masterTab" … コースマスター管理のタブへ (tab = MASTER_TAB)
//   "subsTab"   … 授業管理のタブへ (tab = SUBS_TABS の tab)
//   "staffTab"  … 講師管理のタブへ (tab = STAFF_TAB)

import { VIEWS } from "./views";
import { SIDEBAR_MENU } from "./sidebarMenu";
import { EVENT_KIND, EVENT_KIND_LABELS, EVENT_SECTIONS } from "./eventKinds";
import { MASTER_TAB, MASTER_TABS } from "./masterTabs";
import { TIMETABLE_SECTION, TIMETABLE_SECTIONS } from "./timetableSections";
import { SUBS_TABS } from "./subsTabs";
import { STAFF_TAB, STAFF_TABS } from "./staffTabs";
import { VIEW_CHORD_BY_VIEW } from "./chords";
import { MENU_CATEGORY, menuCategory } from "./menuCategories";

const SIDEBAR_BY_KEY = new Map(SIDEBAR_MENU.map((item) => [item.key, item]));

// サイドバーの項目 (ビュー / ダイアログ) をメニューの項目にする
function navItem(key, desc) {
  const item = SIDEBAR_BY_KEY.get(key);
  if (!item) throw new Error(`mainMenu: サイドバーに無い項目 ${key}`);
  const base = {
    key: `nav:${key}`,
    icon: item.icon,
    label: item.label,
    desc,
    adminOnly: Boolean(item.adminOnly),
    adminData: Boolean(item.adminData),
  };
  if (item.action === "modal") return { ...base, kind: "modal", modal: item.modal };
  return { ...base, kind: "view", view: key };
}

// 休講・テスト期間・イベント画面の中のマネージャ
function eventSection(kind, desc) {
  const sec = EVENT_SECTIONS.find((s) => s.kind === kind);
  return {
    key: `section:${kind}`,
    kind: "section",
    section: kind,
    icon: sec?.icon || "",
    label: EVENT_KIND_LABELS[kind],
    desc,
  };
}

// 時間割管理の画面の中のカード (表示期間設定・コース別終講日など)
function timetableSection(key, desc) {
  const sec = TIMETABLE_SECTIONS.find((s) => s.key === key);
  return {
    key: `timetable:${key}`,
    kind: "timetableSection",
    section: key,
    icon: sec.icon,
    label: sec.label,
    desc,
    adminOnly: Boolean(sec.adminOnly),
  };
}

// コースマスター管理のタブ
function masterTab(tab, desc) {
  const t = MASTER_TABS.find((x) => x.key === tab);
  return { key: `master:${tab}`, kind: "masterTab", tab, icon: t.icon, label: t.label, desc };
}

// 講師管理のタブ
function staffTab(tab, desc) {
  const t = STAFF_TABS.find((x) => x.key === tab);
  return { key: `staff:${tab}`, kind: "staffTab", tab, icon: t.icon, label: t.label, desc };
}

// 授業管理のタブ (アイコンはタブに無いので、ここで付ける)
function subsTab(tab, icon, desc) {
  const t = SUBS_TABS.find((x) => x.tab === tab);
  return { key: `subs:${tab}`, kind: "subsTab", tab, icon, label: t.label, desc };
}

/**
 * カテゴリ → 項目。並びはこのまま画面に出る。
 * @type {{key: string, icon: string, label: string, items: object[]}[]}
 */
export const MAIN_MENU = Object.freeze([
  {
    ...menuCategory(MENU_CATEGORY.TODAY),
    items: [
      navItem(VIEWS.ABSENCE_FLOW, "先生が休む日の代行・合同・移動・振替を、その日の時間割の上で組む"),
      navItem("multi-day-absence", "何日も休むときに、期間 × 先生で欠勤をまとめて登録"),
      navItem(VIEWS.SUBS, "代行の一覧・新規代行・月次集計"),
      subsTab("adjustment", "🔀", "合同・コマ移動・振替・コマ休講の一覧"),
      navItem(VIEWS.CONFIRMED_SUBS, "決まった代行を日付順に (印刷・共有用)"),
    ],
  },
  {
    ...menuCategory(MENU_CATEGORY.RESCHEDULE),
    items: [
      navItem("test-prep", "コースを選んで振替 (別の日・時間・教室へ) / 追加授業を登録"),
      navItem("day-reschedule", "ある日の授業をまとめて別の日へ振り替える"),
      eventSection(EVENT_KIND.EXTRA_LESSON, "講習の追加回・補講など、時間割に無い単発の授業"),
      eventSection(EVENT_KIND.DAY_SCHEDULE, "行事の日だけ 50 分授業・1 限カットなど時程を変える"),
    ],
  },
  {
    ...menuCategory(MENU_CATEGORY.CALENDAR),
    items: [
      eventSection(EVENT_KIND.HOLIDAY, "祝日・行事などで授業の無い日 (学年・科目で絞れる)"),
      eventSection(EVENT_KIND.EXAM, "学校のテスト期間 (授業を止める期間と特訓の日程)"),
      eventSection(EVENT_KIND.SPECIAL, "校外行事・式典・告知などの予定"),
      navItem(VIEWS.EVENTS, "休講・テスト期間・イベント・振替を月のカレンダーで"),
      navItem(VIEWS.YOTEIHYO, "学校の予定表 (Excel) と休講・振替の登録を突き合わせる"),
      navItem(VIEWS.FUZOKU_PLAN, "附属コースの月間の時程・確認テスト"),
    ],
  },
  {
    ...menuCategory(MENU_CATEGORY.STAFF),
    items: [
      navItem(VIEWS.ALL, "講師ごとの週のコマ数"),
      navItem(VIEWS.MINUTES, "期間内に講師ごとに教えた時間 (給与計算用)"),
      navItem(VIEWS.STAFF, "バイトの登録・出勤状況、講師の担当教科とよみ、教科マスター"),
      staffTab(STAFF_TAB.AFFILIATION, "講師を現役部 常勤 / 現役部 非常勤 / 予備校部に分ける (年度ごと)"),
      navItem(VIEWS.LEAVE, "現役部 常勤の有給・半休を月の表で入れる / 年度の日数を見る"),
      navItem(
        "month-batch",
        "バイト・講師の月間予定を何人分もまとめて印刷 / 1 人 1 枚の画像にして LINE などで送る"
      ),
      navItem(VIEWS.OFFSITE, "講師が他の校舎・学校へ授業に行く曜日と時間"),
    ],
  },
  {
    ...menuCategory(MENU_CATEGORY.TIMETABLE),
    items: [
      navItem(VIEWS.TIMETABLE, "時間割 (期) の一覧と有効期間・期間の全体像"),
      timetableSection(
        TIMETABLE_SECTION.DISPLAY_CUTOFF,
        "学年グループごとの表示期間 (開始日〜終了日) と初回のオリエン"
      ),
      timetableSection(
        TIMETABLE_SECTION.COHORT_CUTOFF,
        "学校別・曜日別のコースの終講日 (未設定のコースは最終授業日の案を出す)"
      ),
      timetableSection(
        TIMETABLE_SECTION.CLASS_SETS,
        "第N回を通算するコマの組 (中3 の火木 / 水金のようなコース分け)"
      ),
      masterTab(MASTER_TAB.LIST, "時間割のコマを追加・編集する"),
      masterTab(MASTER_TAB.BIWEEKLY, "隔週コマの A 週・B 週の基準日"),
      masterTab(MASTER_TAB.EXCEL, "曜日ごとの時間割を表で見る"),
      navItem(VIEWS.REGULAR_BUILDER, "次の期の時間割を組んで本体へ反映する"),
      navItem(VIEWS.BUILDER, "夏期・冬期・春期講習の時間割を組む"),
    ],
  },
  {
    ...menuCategory(MENU_CATEGORY.RECORDS),
    items: [
      navItem(VIEWS.HANDOVER, "責任者の申し送り・毎年のこと"),
      navItem("data-mgr", "バックアップの書き出し・読み込み"),
    ],
  },
]);

/**
 * 見ている人に出す項目だけのメニュー (項目の無くなったカテゴリは外す)。
 * @param {{isAdmin?: boolean, canUseAdminData?: boolean}} who
 *   canUseAdminData は useAppData.canUseAdminData (管理者 or Firebase 未設定)
 */
export function visibleMainMenu({ isAdmin = false, canUseAdminData = isAdmin } = {}) {
  return MAIN_MENU.map((cat) => ({
    ...cat,
    items: cat.items.filter(
      (item) => (!item.adminOnly || isAdmin) && (!item.adminData || canUseAdminData)
    ),
  })).filter((cat) => cat.items.length > 0);
}

/**
 * 項目のショートカット (g の次のキー)。ビューへ移る項目だけ。画面の中の
 * セクション・タブは g で開くと親の画面 (今のタブ) になるので出さない。
 * @param {object} item MAIN_MENU の項目
 * @returns {string|null}
 */
export function menuItemChord(item) {
  return item?.kind === "view" ? VIEW_CHORD_BY_VIEW.get(item.view) || null : null;
}
