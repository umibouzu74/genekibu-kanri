import { VIEW_CHORD_LABEL, CHORD_TIMEOUT_MS } from "../constants/chords";

// chord 待機中に画面左下に出すバッジ。
// - 第 1 キー (`g`) を受理し、第 2 キー入力までの 1.2 秒間表示される。
// - 第 2 キー候補のヒント一覧をコンパクトに併記する（A17）。
// - 残り時間を線形減衰バーで可視化する（A19）。
//
// 1 度マウント = 1 セッションの待機。次の chord は React 側で
// `chordWaiting` が一旦 false に戻ってから再度 true になることで、
// この要素が unmount → remount され、CSS アニメーションも初期化される。
export function ChordWaitingBadge({ open }) {
  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="g キーを受付中。対応する 2 キー目を入力してください。? でヘルプを表示。"
      className="no-print"
      style={{
        position: "fixed",
        bottom: 24,
        left: 24,
        background: "#1a1a2e",
        color: "#fff",
        padding: "8px 14px 10px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        boxShadow: "0 4px 20px rgba(0,0,0,.25)",
        zIndex: 2000,
        pointerEvents: "none",
        maxWidth: 480,
        overflow: "hidden",
      }}
    >
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <kbd
          style={{
            background: "#3a3a6e",
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          g
        </kbd>
        <span style={{ color: "#8a8aa0" }}>→</span>
        <span style={{ color: "#ccd" }}>次のキー…</span>
        <span style={{ marginLeft: 4, fontSize: 10, color: "#6a6a8e", fontWeight: 400 }}>
          ? でヘルプ
        </span>
      </div>
      {/* 第 2 キー候補ヒント（A17） */}
      <div
        aria-hidden="true"
        style={{
          marginTop: 6,
          display: "flex",
          flexWrap: "wrap",
          gap: "2px 8px",
          fontSize: 10,
          color: "#9a9ab8",
          fontWeight: 400,
        }}
      >
        {Object.entries(VIEW_CHORD_LABEL).map(([k, label]) => (
          <span key={k} style={{ display: "inline-flex", gap: 3, alignItems: "baseline" }}>
            <span style={{ color: "#ccc", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700 }}>
              {k}
            </span>
            <span>{label}</span>
          </span>
        ))}
      </div>
      {/* タイムアウト残量バー（A19） */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: "rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            height: "100%",
            background: "linear-gradient(90deg, #6a8aff, #8a6aff)",
            // CSS animation 名は App.jsx の <style> ブロック内で定義。
            animation: `chord-decay ${CHORD_TIMEOUT_MS}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}
