import { S } from "../styles/common";

// 各ビュー上部に並べる印刷クイックボタン。メインドキュメントを直接
// `window.print()` するシンプル方式。App.jsx 末尾の `@media print`
// グローバルルール (サイドバー/ハンバーガーの非表示など) と各ビューが
// 自前で持つ印刷 CSS だけで仕上がるビュー (Dashboard / WeekView /
// EventCalendarView / ConfirmedSubsView / MasterView) で使う。
//
// ヘッダ・凡例・ページタイトルなど DOM に常設しづらい要素を紙面に
// 載せたいビュー (例: 月次カレンダー / タイムテーブル) は、トップバーの
// 🖨 ボタン (`handlePrint`) を使う。あちらは popup 経由で動的に HTML を
// 注入する別系統。
export function PrintButton({ label = "印刷", style }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title="このビューを印刷 (Ctrl/⌘ + P)"
      aria-label="このビューを印刷"
      className="no-print"
      style={{
        ...S.btn(false),
        fontSize: 12,
        padding: "4px 12px",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        ...style,
      }}
    >
      <span aria-hidden="true">🖨</span>
      <span>{label}</span>
    </button>
  );
}
