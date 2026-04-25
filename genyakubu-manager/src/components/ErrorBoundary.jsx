import { Component } from "react";
import { LS } from "../constants/storageKeys";
import { colors } from "../styles/tokens";

// ─── ErrorBoundary ─────────────────────────────────────────────────
// Catches render-time errors in any descendant and shows a graceful
// fallback instead of a blank white screen. Logs the error to the
// console so it can be inspected in DevTools.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] render crashed:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  // Uses window.confirm() intentionally — the custom useConfirm modal may
  // itself be broken when ErrorBoundary renders, so the native dialog is safer.
  handleClear = () => {
    if (!confirm("localStorage を初期化してリロードします。よろしいですか？")) return;
    try {
      Object.values(LS).forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          fontFamily: '"Hiragino Kaku Gothic Pro","Yu Gothic","Noto Sans JP",sans-serif',
          padding: 32,
          maxWidth: 640,
          margin: "48px auto",
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #fcc",
          boxShadow: "0 8px 32px rgba(0,0,0,.08)",
        }}
        role="alert"
      >
        <h1 style={{ fontSize: 18, color: colors.danger, marginBottom: 12 }}>
          画面の描画中にエラーが発生しました
        </h1>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 16, lineHeight: 1.6 }}>
          ブラウザを再読込しても解消しない場合は、保存データが破損している可能性があります。
          下のボタンから初期化できます。
        </p>
        <pre
          style={{
            background: "#f7f7f8",
            padding: 12,
            borderRadius: 6,
            fontSize: 11,
            color: colors.danger,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            marginBottom: 16,
            maxHeight: 180,
            overflow: "auto",
          }}
        >
          {String(this.state.error?.stack || this.state.error)}
        </pre>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: "#1a1a2e",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            再読込
          </button>
          <button
            type="button"
            onClick={this.handleClear}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: `1px solid ${colors.dangerBorder}`,
              background: colors.dangerSoft,
              color: colors.danger,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            保存データを初期化して再読込
          </button>
        </div>
      </div>
    );
  }
}
