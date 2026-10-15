// ─── サイドバーの項目 ────────────────────────────────────────────
// Sidebar が描く項目の定義。メインメニュー (constants/mainMenu) もここから
// アイコン・名前・権限 (adminOnly / adminData)・ダイアログの種類を引くので、
// 名前を変えるときはここだけ直せば両方に効く (書き起こさない)。
//
// 項目の形:
//   { key, icon, label }                   … ビュー (key = VIEWS の値)
//   children                                … 子のビュー (親の下に字下げで並ぶ)
//   sections                                … その画面を開いている間だけ出す
//                                             画面の中のセクション / タブ
//   action: "modal", modal                  … ビューではなくダイアログを開く
//   adminOnly                               … 管理者だけ (閲覧者には出さない)
//   adminData                               … 管理者だけが読めるデータの画面
//   badge                                   … 未処理の代行の件数を添える
//
// コンポーネントのファイルから定数を export すると Fast Refresh が効かなく
// なるので、ここに分けてある。

import { VIEWS } from "./views";
import { EVENT_SECTIONS } from "./eventKinds";
import { MASTER_TABS } from "./masterTabs";

export const SIDEBAR_MENU = [
  // 起動時の画面。機能をカテゴリごとに並べてボタンで飛ぶ (constants/mainMenu)
  { key: VIEWS.MENU, icon: "🏠", label: "メインメニュー" },
  { key: VIEWS.DASH, icon: "📋", label: "ダッシュボード" },
  {
    key: VIEWS.ALL, icon: "📊", label: "全講師一覧",
    children: [
      { key: VIEWS.MINUTES, icon: "⏱", label: "授業時間の集計" },
    ],
  },
  {
    key: VIEWS.TIMETABLE, icon: "🗓", label: "時間割管理",
    children: [
      // この 1 画面に 5 種類のマネージャが縦に並ぶ。ラベルからは「追加授業」
      // 「特別時程」に辿り着けないので、開いている間だけ中身をここに出す。
      {
        key: VIEWS.HOLIDAYS,
        icon: "📅",
        label: "休講・テスト期間・イベント",
        sections: EVENT_SECTIONS,
      },
      // 学校の予定表 (Excel) を読んで、休講・振替の登録の漏れを探す。
      // 休講の登録のすぐ下に置く (予定表が届いたときに使う)
      { key: VIEWS.YOTEIHYO, icon: "📑", label: "予定表チェック" },
      { key: VIEWS.EVENTS, icon: "🗒", label: "イベントカレンダー" },
      { key: VIEWS.BUILDER, icon: "🧩", label: "講習時間割作成" },
      { key: VIEWS.REGULAR_BUILDER, icon: "🏗", label: "通常時間割作成" },
    ],
  },
  // 附属コースの月間予定 (以前は Excel で管理していたもの)。学校の予定表を
  // 見ながら毎月組むので、時間割管理の子に埋めずに名前を出す
  { key: VIEWS.FUZOKU_PLAN, icon: "🎒", label: "附属の授業予定" },
  // 講師が他の校舎・学校へ授業に行く曜日と時間。講師の月間・代行候補に効く
  // 登録なので、時間割管理の子に埋めずに名前を出す
  { key: VIEWS.OFFSITE, icon: "🏫", label: "他校舎の授業" },
  // 管理者専用の画面 (閲覧者が開いても「管理者のみ」と出るだけの行き止まり
  // になるので、閲覧者には出さない。Cmd+K と g a も同じ)
  { key: VIEWS.ABSENCE_FLOW, icon: "🚑", label: "欠勤組み換え", adminOnly: true },
  // ビューではなくダイアログを開く項目。日単位の振替は「その日の作業」なので
  // 欠勤組み換えの隣に置く (機能が一覧のタブの中に埋もれないように)。
  {
    key: "day-reschedule",
    icon: "📅",
    label: "日まるごと振替",
    action: "modal",
    modal: "dayReschedule",
    adminOnly: true,
  },
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
  },
  // 複数日にまたがる欠勤 (インフル 1 週間など) を期間 × 講師で一度に登録する
  {
    key: "multi-day-absence",
    icon: "🤒",
    label: "複数日の欠勤登録",
    action: "modal",
    modal: "multiDayAbsence",
    adminOnly: true,
  },
  { key: VIEWS.SUBS, icon: "🔄", label: "授業管理", badge: true },
  { key: VIEWS.CONFIRMED_SUBS, icon: "✅", label: "代行確定一覧" },
  { key: VIEWS.STAFF, icon: "👥", label: "バイト管理" },
  // 講師の月間予定を何人分もまとめて印刷 / 画像にする (バイトに LINE で送る)。
  // 講師を選んだ後の月間のツールバーにしか無かったので名前を出す。開き方は
  // App の openMonthBatch (今の画面の状態を巻き添えにしない)。印刷・画像は
  // 書き込みではないので閲覧者にも出す
  {
    key: "month-batch",
    icon: "🖼",
    label: "月間予定の印刷・画像",
    action: "modal",
    modal: "monthBatch",
  },
  // この画面はタブが 3 枚あり、名前 (コースマスター管理) からは「隔週管理」に
  // 辿り着けない。開いている間だけタブ名をサイドバーに出す。
  { key: VIEWS.MASTER, icon: "⚙", label: "コースマスター管理", sections: MASTER_TABS },
  // 責任者の引継ぎメモ。閲覧者には読めないデータなので項目ごと出さない
  // (adminData: 管理者ログイン中、または Firebase 未設定の端末だけ)
  { key: VIEWS.HANDOVER, icon: "📝", label: "引継ぎメモ", adminData: true },
  { key: "data-mgr", icon: "💾", label: "データ管理", action: "modal", modal: "data" },
];
