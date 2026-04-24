import { S } from "../styles/common";

// 各ビュー上部に並べる印刷クイックボタン。
// 既存の no-print / @media print CSS と組み合わせるだけで動作する。
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
