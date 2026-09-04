import { Component } from "react";
import { LS, SS } from "../constants/storageKeys";
import { colors } from "../styles/tokens";

// ─── ErrorBoundary ─────────────────────────────────────────────────
// Catches render-time errors in any descendant and shows a graceful
// fallback instead of a blank white screen. Logs the error to the
// console so it can be inspected in DevTools.
//
// 2 段構え (2026-09-04):
// - scope="app" (main.jsx のルート 1 枚): 何を描いても落ちるときの最後の砦。
//   「保存データを初期化」まで出す
// - scope="view" (App の #main-content 内): ビュー 1 つの描画バグで
//   サイドバーごと落とさない。`resetKey` (現在のビュー) が変われば自動で
//   復帰するので、別の画面へ移れば使い続けられる。初期化ボタンは出さない
//
// さらに、デプロイ直後にハッシュ付きチャンクが消えて lazy import が失敗する
// ケース (「新しい版が出た」だけでデータは無事) は両方の scope で判別し、
// 再読込だけを案内する。ここで「初期化」を見せると、単なるキャッシュ切れで
// 事務員がデータを消してしまう導線になる。

const CHUNK_LOAD_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk/i,
  // Vite: lazy チャンクが CSS (tailwind 等) を伴うとき、JS より先に
  // __vitePreload がこのメッセージで落ちる
  /Unable to preload CSS/i,
];

/** lazy import のチャンク取得失敗 (デプロイ後の古いタブ) か */
export function isChunkLoadError(err) {
  if (!err) return false;
  if (err.name === "ChunkLoadError") return true;
  const msg = String(err.message || err);
  return CHUNK_LOAD_PATTERNS.some((re) => re.test(msg));
}

const btnPrimary = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "none",
  background: "#1a1a2e",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
const btnSecondary = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#fff",
  color: "#333",
  fontWeight: 700,
  cursor: "pointer",
};
const btnDanger = {
  padding: "8px 16px",
  borderRadius: 6,
  border: `1px solid ${colors.dangerBorder}`,
  background: colors.dangerSoft,
  color: colors.danger,
  fontWeight: 700,
  cursor: "pointer",
};

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
    // ビュー復元 (sessionStorage) が原因のクラッシュを再読込のたびに
    // 繰り返さないよう、復元情報だけは即座に捨てる。次のリロードは
    // ダッシュボードから始まる (localStorage のデータは消さない)。
    try {
      Object.values(SS).forEach((k) => sessionStorage.removeItem(k));
    } catch {
      // ignore
    }
  }

  componentDidUpdate(prevProps) {
    // 別のビューへ移ったら自動で復帰する (view scope)。同じビューに留まる
    // 限りは落ちた画面を出し続け、「再試行」で明示的に描き直す
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ error: null });
  };

  // Uses window.confirm() intentionally — the custom useConfirm modal may
  // itself be broken when ErrorBoundary renders, so the native dialog is safer.
  handleClear = () => {
    if (!confirm("localStorage を初期化してリロードします。よろしいですか？")) return;
    try {
      Object.values(LS).forEach((k) => localStorage.removeItem(k));
      Object.values(SS).forEach((k) => sessionStorage.removeItem(k));
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const scope = this.props.scope || "app";
    const chunk = isChunkLoadError(error);

    const box = {
      fontFamily: '"Hiragino Kaku Gothic Pro","Yu Gothic","Noto Sans JP",sans-serif',
      padding: scope === "view" ? 20 : 32,
      maxWidth: 640,
      margin: scope === "view" ? "24px auto" : "48px auto",
      background: "#fff",
      borderRadius: 12,
      border: `1px solid ${chunk ? "#c9d6e8" : colors.dangerBorder}`,
      boxShadow: "0 8px 32px rgba(0,0,0,.08)",
    };
    const title = { fontSize: scope === "view" ? 15 : 18, marginBottom: 12 };
    const lead = { fontSize: 13, color: "#666", marginBottom: 16, lineHeight: 1.6 };

    if (chunk) {
      return (
        <div style={box} role="alert" data-testid="error-boundary-chunk">
          <h1 style={{ ...title, color: "#1a1a2e" }}>アプリが更新されました</h1>
          <p style={lead}>
            新しい版が配信されたため、この画面の読み込みに失敗しました。
            再読込すると新しい版で開き直します。保存データは消えません。
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={this.handleReload} style={btnPrimary}>
              再読込
            </button>
          </div>
        </div>
      );
    }

    const stack = (
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
        {String(error?.stack || error)}
      </pre>
    );

    if (scope === "view") {
      return (
        <div style={box} role="alert" data-testid="error-boundary-view">
          <h1 style={{ ...title, color: colors.danger }}>
            この画面の表示中にエラーが発生しました
          </h1>
          <p style={lead}>
            他の画面はサイドバーから引き続き使えます。同じ画面で繰り返し起きる
            場合は、再読込してから操作をやり直してください。
          </p>
          <details style={{ marginBottom: 16 }}>
            <summary style={{ fontSize: 11, color: "#888", cursor: "pointer" }}>
              エラーの詳細
            </summary>
            {stack}
          </details>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={this.handleRetry} style={btnPrimary}>
              再試行
            </button>
            <button type="button" onClick={this.handleReload} style={btnSecondary}>
              再読込
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={box} role="alert" data-testid="error-boundary-app">
        <h1 style={{ ...title, color: colors.danger }}>
          画面の描画中にエラーが発生しました
        </h1>
        <p style={lead}>
          ブラウザを再読込しても解消しない場合は、保存データが破損している可能性があります。
          下のボタンから初期化できます。
        </p>
        {stack}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={this.handleReload} style={btnPrimary}>
            再読込
          </button>
          <button type="button" onClick={this.handleClear} style={btnDanger}>
            保存データを初期化して再読込
          </button>
        </div>
      </div>
    );
  }
}
