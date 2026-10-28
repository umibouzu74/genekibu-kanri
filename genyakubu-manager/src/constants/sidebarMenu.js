// ─── サイドバーの項目 ────────────────────────────────────────────
// Sidebar が描く項目の定義。メインメニュー (constants/mainMenu) もここから
// アイコン・名前・権限 (adminOnly / adminData)・ダイアログの種類を引くので、
// 名前を変えるときはここだけ直せば両方に効く (書き起こさない)。
//
// 項目の形:
//   { key, icon, label }                   … ビュー (key = VIEWS の値)
//   category                                … 属するカテゴリ (constants/menuCategories)。
//                                             サイドバーはカテゴリごとに開け閉めする。
//                                             無い項目 (メインメニュー・ダッシュボード)
//                                             はカテゴリの上に常に出す
//   sections                                … その画面を開いている間だけ出す
//                                             画面の中のセクション / タブ
//   action: "modal", modal                  … ビューではなくダイアログを開く
//   adminOnly                               … 管理者だけ (閲覧者には出さない)
//   adminData                               … 管理者だけが読めるデータの画面
//   badge                                   … 未処理の代行の件数を添える
//
// 並びはカテゴリの中で上から順 (カテゴリの並びは MENU_CATEGORIES)。
// 2026-10-16 に「時間割管理」「全講師一覧」の下の子項目をやめ、カテゴリに
// 分けた (項目が 25 前後になり、全部並べると画面の高さに収まらなかった)。
//
// コンポーネントのファイルから定数を export すると Fast Refresh が効かなく
// なるので、ここに分けてある。

import { VIEWS } from "./views";
import { EVENT_SECTIONS } from "./eventKinds";
import { TIMETABLE_SECTIONS } from "./timetableSections";
import { MASTER_TABS } from "./masterTabs";
import { STAFF_TABS } from "./staffTabs";
import { MINUTES_TABS } from "./minutesTabs";
import { KOSHU_SEASONS } from "../timetable-builder/utils/seasons";
import { MENU_CATEGORIES, MENU_CATEGORY } from "./menuCategories";

const C = MENU_CATEGORY;

export const SIDEBAR_MENU = [
  // 起動時の画面。機能をカテゴリごとに並べてボタンで飛ぶ (constants/mainMenu)
  { key: VIEWS.MENU, icon: "🏠", label: "メインメニュー" },
  { key: VIEWS.DASH, icon: "📋", label: "ダッシュボード" },

  // ── 今日の対応 ──
  // 管理者専用の画面 (閲覧者が開いても「管理者のみ」と出るだけの行き止まり
  // になるので、閲覧者には出さない。Cmd+K と g a も同じ)
  {
    key: VIEWS.ABSENCE_FLOW,
    icon: "🚑",
    label: "欠勤組み換え",
    adminOnly: true,
    category: C.TODAY,
  },
  // 複数日にまたがる欠勤 (インフル 1 週間など) を期間 × 講師で一度に登録する
  {
    key: "multi-day-absence",
    icon: "🤒",
    label: "複数日の欠勤登録",
    action: "modal",
    modal: "multiDayAbsence",
    adminOnly: true,
    category: C.TODAY,
  },
  // バイトが出退勤のカードを通し忘れた日を残す (経理がバイト出勤表・月間で見る)。
  // その場で書くものなので今日の対応に置く。書き込みなので管理者だけ
  {
    key: "card-forget",
    icon: "💳",
    label: "カード忘れの記録",
    action: "modal",
    modal: "cardForget",
    adminOnly: true,
    category: C.TODAY,
  },
  { key: VIEWS.SUBS, icon: "🔄", label: "授業管理", badge: true, category: C.TODAY },
  { key: VIEWS.CONFIRMED_SUBS, icon: "✅", label: "代行確定一覧", category: C.TODAY },

  // ── 振替・追加授業 ──
  // テスト前の振替・追加授業 (高校部は学校ごとにテストの日程が違うので多い)
  // を、コースを選ぶだけで登録する。追加授業の画面の奥や欠勤組み換えの
  // 右クリックに埋めず、名前を出す
  {
    key: "test-prep",
    icon: "🎯",
    label: "テスト対策の振替・追加",
    action: "modal",
    modal: "testPrep",
    adminOnly: true,
    category: C.RESCHEDULE,
  },
  // ビューではなくダイアログを開く項目 (機能が一覧のタブの中に埋もれないように)
  {
    key: "day-reschedule",
    icon: "📅",
    label: "日まるごと振替",
    action: "modal",
    modal: "dayReschedule",
    adminOnly: true,
    category: C.RESCHEDULE,
  },

  // ── 予定・休み ──
  // この 1 画面に 5 種類のマネージャが縦に並ぶ。ラベルからは「追加授業」
  // 「特別時程」に辿り着けないので、開いている間だけ中身をここに出す。
  {
    key: VIEWS.HOLIDAYS,
    icon: "📅",
    label: "休講・テスト期間・イベント",
    sections: EVENT_SECTIONS,
    category: C.CALENDAR,
  },
  { key: VIEWS.EVENTS, icon: "🗒", label: "イベントカレンダー", category: C.CALENDAR },
  // 予備校部と現役部の予定を 1 枚に (上 = 予備校部、下 = 現役部)
  { key: VIEWS.YEAR_CAL, icon: "📆", label: "年間カレンダー", category: C.CALENDAR },
  // 学校の予定表 (Excel) を読んで、休講・振替の登録の漏れを探す
  { key: VIEWS.YOTEIHYO, icon: "📑", label: "予定表チェック", category: C.CALENDAR },
  // 附属コースの月間予定 (以前は Excel で管理していたもの)
  { key: VIEWS.FUZOKU_PLAN, icon: "🎒", label: "附属の授業予定", category: C.CALENDAR },

  // ── 講師・スタッフ ──
  { key: VIEWS.ALL, icon: "📊", label: "全講師一覧", category: C.STAFF },
  // 授業時間 / バイト出勤表 (給与用) のタブ。画面名からは「バイト出勤表」に
  // 辿り着けないので、開いている間だけタブ名を出す (講師管理と同じ)。経理など
  // 閲覧者も使うので adminOnly にしない (書き込みは端末の localStorage だけ)
  {
    key: VIEWS.MINUTES,
    icon: "⏱",
    label: "授業時間の集計",
    sections: MINUTES_TABS,
    category: C.STAFF,
  },
  // 講師管理 (旧「バイト管理」)。バイト一覧・講師の所属・担当教科とよみ・
  // 教科マスターのタブ。画面名からは「講師の所属」に辿り着けないので、
  // 開いている間だけタブ名を出す (コースマスター管理と同じ)
  { key: VIEWS.STAFF, icon: "👥", label: "講師管理", sections: STAFF_TABS, category: C.STAFF },
  // 現役部 常勤の有給・半休。人事の記録なので閲覧者には読めない (adminData)
  { key: VIEWS.LEAVE, icon: "🌴", label: "有給・半休", adminData: true, category: C.STAFF },
  // 講師の月間予定を何人分もまとめて印刷 / 画像にする (バイトに LINE で送る)。
  // 開き方は App の openMonthBatch (今の画面の状態を巻き添えにしない)。印刷・
  // 画像は書き込みではないので閲覧者にも出す
  {
    key: "month-batch",
    icon: "🖼",
    label: "月間予定の印刷・画像",
    action: "modal",
    modal: "monthBatch",
    category: C.STAFF,
  },
  // 講師が他の校舎・学校へ授業に行く曜日と時間。講師の月間・代行候補に効く
  { key: VIEWS.OFFSITE, icon: "🏫", label: "他校舎の授業", category: C.STAFF },

  // ── 時間割 ──
  // カードが 6 枚縦に並ぶ長い画面で、画面名からは「コース別終講日」「授業セット」
  // に辿り着けない。開いている間だけ中身をここに出す (休講・テスト期間・イベントと同じ)
  {
    key: VIEWS.TIMETABLE,
    icon: "🗓",
    label: "時間割管理",
    sections: TIMETABLE_SECTIONS,
    category: C.TIMETABLE,
  },
  // この画面はタブが 3 枚あり、名前 (コースマスター管理) からは「隔週管理」に
  // 辿り着けない。開いている間だけタブ名をサイドバーに出す。
  {
    key: VIEWS.MASTER,
    icon: "⚙",
    label: "コースマスター管理",
    sections: MASTER_TABS,
    category: C.TIMETABLE,
  },
  { key: VIEWS.REGULAR_BUILDER, icon: "🏗", label: "通常時間割作成", category: C.TIMETABLE },
  // 講習は春期・夏期・冬期で別の時間割 (季節ごとに保存先が別)。開いている間だけ
  // 季節を子項目に出し、押すとその季節に切り替える
  {
    key: VIEWS.BUILDER,
    icon: "🧩",
    label: "講習時間割作成",
    sections: KOSHU_SEASONS,
    category: C.TIMETABLE,
  },
  // 高校部・予備校の講習の担当 (講習時間割作成は中学の講習。こちらは本体が正で、
  // 講師の月間に出し、講習時間割作成が取り込んで自動NG にする)
  { key: VIEWS.SENIOR_KOSHU, icon: "🎓", label: "高校・予備校の講習", category: C.TIMETABLE },

  // ── 記録・データ ──
  // 責任者の引継ぎメモ。閲覧者には読めないデータなので項目ごと出さない
  // (adminData: 管理者ログイン中、または Firebase 未設定の端末だけ)
  { key: VIEWS.HANDOVER, icon: "📝", label: "引継ぎメモ", adminData: true, category: C.RECORDS },
  {
    key: "data-mgr",
    icon: "💾",
    label: "データ管理",
    action: "modal",
    modal: "data",
    category: C.RECORDS,
  },
];

/** カテゴリに属さない (常に上に出す) 項目 */
export const SIDEBAR_PINNED = SIDEBAR_MENU.filter((item) => !item.category);

/** カテゴリ → 項目 (MENU_CATEGORIES の並び)。項目の無いカテゴリも返す */
export const SIDEBAR_CATEGORIES = MENU_CATEGORIES.map((c) => ({
  ...c,
  items: SIDEBAR_MENU.filter((item) => item.category === c.key),
}));

/** ビュー key → そのビューが属するカテゴリ (今いる画面のカテゴリを開くため) */
export const SIDEBAR_CATEGORY_BY_VIEW = new Map(
  SIDEBAR_MENU.filter((item) => item.category && !item.action).map((item) => [
    item.key,
    item.category,
  ])
);
