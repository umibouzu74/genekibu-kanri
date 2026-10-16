import { useLayoutEffect, useRef, useState } from "react";
import { S } from "../../../styles/common";

// ─── 欠勤組み換えの未保存バー (画面下に固定) ─────────────────────
// 欠勤組み換えの操作 (代行・欠勤・合同・移動・振替・コマ休講・回数補正) は
// 下書きで、「保存」を押すまでどこにも書かれない。以前は画面右下の小さな
// 浮きボタンだけで、下書きを作った直後の通知 (右下) に隠れたり、狭い画面
// (サイドパネルを開いたとき・iPad 縦) で見落としたりして、コマ休講を
// 下書きのまま離れていた (2026-10-16 の指摘)。
//
// - 下書きがある間だけ、本文の幅いっぱいのバーを画面下に固定して出す。
//   デスクトップ幅は固定サイドバーの右から (appShell.css の .draft-save-bar)
// - バーの高さを CSS 変数 --app-bottom-bar-height に書く。本文の下の余白
//   (AbsenceWorkflowView) と通知 (ToastContainer) の位置がこれを見て、
//   バーに隠れないようにする
// - 下書きが増えたら件数の札を一瞬強調する (足した直後に「まだ保存して
//   いない」と気付けるように)
// - 紙面には載せない (no-print)
//
// 保存・破棄の処理は呼び出し側 (確認ダイアログも含めて既存のもの) を使う。

export const BOTTOM_BAR_HEIGHT_VAR = "--app-bottom-bar-height";

export function DraftSaveBar({ count, summary = [], onSave, onDiscard }) {
  const ref = useRef(null);
  // 件数が増えたときだけ札を作り直して (key) 強調アニメーションを流し直す。
  // 前回の件数は state で持つ (描画中に前回の値と比べる React の定石)
  const [seen, setSeen] = useState({ count, pulse: 0 });
  if (count !== seen.count) {
    setSeen({ count, pulse: count > seen.count ? seen.pulse + 1 : seen.pulse });
  }
  const pulse = seen.pulse;

  useLayoutEffect(() => {
    const el = ref.current;
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (!el || !root) return undefined;
    const write = () => root.style.setProperty(BOTTOM_BAR_HEIGHT_VAR, `${el.offsetHeight}px`);
    write();
    // 狭い画面では折り返して高さが変わる
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(write) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty(BOTTOM_BAR_HEIGHT_VAR);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="region"
      aria-label="未保存の下書き"
      className="draft-save-bar no-print"
      style={{
        position: "fixed",
        right: 0,
        bottom: 0,
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        padding: "8px 16px",
        paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
        background: "#fff8e1",
        borderTop: "2px solid #e0a020",
        boxShadow: "0 -4px 14px rgba(0,0,0,.12)",
      }}
    >
      <div
        aria-live="polite"
        style={{
          flex: "1 1 220px",
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "2px 8px",
          fontSize: 12,
          color: "#6a4a00",
        }}
      >
        <strong
          key={pulse}
          className="draft-save-bar-count"
          style={{
            background: "#e0a020",
            color: "#fff",
            borderRadius: 12,
            padding: "2px 10px",
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          未保存の下書き {count} 件
        </strong>
        <span>「保存」を押すまで確定しません (他の画面・端末にも出ません)</span>
        {summary.length > 0 && (
          <span style={{ color: "#8a6a20", fontSize: 11 }}>{summary.join(" / ")}</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
        <button type="button" onClick={onDiscard} style={{ ...S.btn(false), fontSize: 12 }}>
          破棄
        </button>
        <button
          type="button"
          onClick={onSave}
          style={{
            background: "#2a6a9e",
            color: "#fff",
            padding: "8px 16px",
            border: "none",
            borderRadius: 6,
            fontWeight: 800,
            cursor: "pointer",
            fontSize: 13,
            whiteSpace: "nowrap",
          }}
        >
          {count} 件の変更を保存
        </button>
      </div>
    </div>
  );
}
