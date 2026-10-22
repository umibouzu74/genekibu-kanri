import { useEffect, useState, useSyncExternalStore } from "react";
import { isConfigured } from "../firebase/config";
import { getCloudState, getLastCloudRead, subscribeCloudState } from "../firebase/cloudState";

// ─── クラウドのデータを読めていないときの警告 ────────────────────────
// 読み取りが拒否された・匿名ログインに失敗した・いつまでも応答が無いとき、
// 画面の上に出す。アプリは読めなくても動き続け、この端末に残っていた古い
// データ (一度も読めていない端末ではアプリに組み込まれた見本のデータ) を
// 出すので、知らせないと古い予定を本物と思って見てしまう (2026-10-22:
// 閲覧用の PC で代行が抜け、1学期の時間割・バイトが先頭のサイドバーが出ていた)。
//
// ログアウトの瞬間のように一時的に読めないことはあるので、少し待ってから出す。
// Firebase 未設定のローカルモード (開発・e2e) では出さない。

// 読み取りの拒否・ログインの失敗はすぐ戻ることがある (ログアウト → 匿名で
// 入り直し) ので少し待つ
const ERROR_DELAY_MS = 4000;
// 応答が無い (ネットワークの制限・オフライン) は、つながるまでの時間を見込む
const NO_DATA_DELAY_MS = 20000;
const MAX_LISTED_PATHS = 3;

function problemOf(state) {
  if (state.authError) return "auth";
  if (state.readErrors.size > 0) return "denied";
  if (!state.received) return "noData";
  return null;
}

function fmtDateTime(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function reasonText(problem, state) {
  if (problem === "auth") return `ログインの準備に失敗しました（${state.authError}）`;
  if (problem === "denied") {
    const paths = [...state.readErrors.keys()].map((p) => p.replace(/^appData\//, ""));
    const listed = paths.slice(0, MAX_LISTED_PATHS).join("、");
    const rest = paths.length > MAX_LISTED_PATHS ? ` ほか ${paths.length - MAX_LISTED_PATHS} 件` : "";
    const codes = [...new Set(state.readErrors.values())].join("・");
    return `読み取りを拒否されました（${codes}: ${listed}${rest}）`;
  }
  return "クラウドから応答がありません（ネットワークの制限・オフラインの可能性があります）";
}

export function CloudReadWarning() {
  const state = useSyncExternalStore(subscribeCloudState, getCloudState, getCloudState);
  const problem = isConfigured ? problemOf(state) : null;
  const [shown, setShown] = useState(null);

  useEffect(() => {
    if (!problem) {
      setShown(null);
      return undefined;
    }
    const timer = setTimeout(
      () => setShown(problem),
      problem === "noData" ? NO_DATA_DELAY_MS : ERROR_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [problem]);

  if (!problem || !shown) return null;

  const lastRead = getLastCloudRead();
  return (
    <div
      role="alert"
      className="no-print"
      style={{
        margin: "0 0 12px",
        padding: "10px 14px",
        borderRadius: 8,
        border: "1px solid #e0a020",
        background: "#fff6e0",
        color: "#5a3a00",
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      <div style={{ fontWeight: 800 }}>⚠ クラウドのデータを読み込めていません</div>
      <div>
        {lastRead
          ? `いま表示しているのは、この端末に残っていた ${fmtDateTime(lastRead)} 時点のデータです。それより後の代行・休講などの登録は入っていません。`
          : "この端末ではまだ一度も読み込めていないため、いま表示しているのはアプリに組み込まれた見本のデータです（実際の予定ではありません）。"}
      </div>
      <div style={{ fontSize: 12, color: "#7a5a20" }}>{reasonText(problem, state)}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: "4px 12px",
            borderRadius: 6,
            border: "1px solid #c08010",
            background: "#fff",
            color: "#5a3a00",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          再読み込み
        </button>
        <span style={{ fontSize: 12, color: "#7a5a20" }}>
          直らないときは、この文面（特にかっこの中）を管理者に伝えてください。
        </span>
      </div>
    </div>
  );
}
