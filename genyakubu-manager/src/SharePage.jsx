import { useEffect, useState } from "react";
import { decodeShareData } from "./utils/shareCodec";
import { SharedSubsView } from "./components/views/SharedSubsView";
import { colors, font } from "./styles/tokens";

/**
 * Lightweight page rendered for share URLs (#/share/<encoded>).
 * Decodes the payload and displays the read-only SharedSubsView.
 */
export function SharePage({ encoded }) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    decodeShareData(encoded)
      .then((data) => {
        if (!cancelled) {
          if (!data || !Array.isArray(data.substitutions)) {
            setState({ status: "error", data: null, error: "データ形式が不正です" });
          } else {
            setState({ status: "ok", data, error: null });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: "error",
            data: null,
            error: "共有リンクのデータを読み込めませんでした。リンクが破損している可能性があります。",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [encoded]);

  if (state.status === "loading") {
    return (
      <div
        style={{
          fontFamily: font.stack,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: colors.bg,
          color: colors.inkMuted,
          fontSize: 14,
        }}
      >
        読み込み中...
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        style={{
          fontFamily: font.stack,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: colors.bg,
          color: colors.accentRed,
          padding: 24,
          textAlign: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700 }}>読み込みエラー</div>
        <div style={{ fontSize: 13, color: colors.inkMuted }}>{state.error}</div>
        <a
          href={window.location.pathname}
          style={{
            marginTop: 12,
            fontSize: 13,
            color: colors.accentBlue,
            textDecoration: "none",
          }}
        >
          アプリを開く
        </a>
      </div>
    );
  }

  return <SharedSubsView data={state.data} />;
}
