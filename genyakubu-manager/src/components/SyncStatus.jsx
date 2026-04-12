import { useEffect, useState } from "react";
import { db, authReady, authFailed, isConfigured } from "../firebase/config";
import { ref, onValue, off } from "firebase/database";

// ─── SyncStatus ─────────────────────────────────────────────────────
// A small indicator showing Firebase connection state.
//   Green  = connected
//   Red    = offline / disconnected
//   Orange = authentication failed
//   Grey   = Firebase not configured (localStorage-only mode)
export function SyncStatus() {
  const [connected, setConnected] = useState(false);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    if (!isConfigured || !db) return;

    let unmounted = false;
    authReady.then(() => {
      if (unmounted) return;
      if (authFailed) {
        setAuthError(true);
        return;
      }

      const connRef = ref(db, ".info/connected");
      onValue(connRef, (snap) => {
        if (!unmounted) setConnected(snap.val() === true);
      });
    });

    return () => {
      unmounted = true;
      if (db) off(ref(db, ".info/connected"));
    };
  }, []);

  if (!isConfigured) {
    return (
      <div style={wrap} title="ローカルモード（Firebase未設定）">
        <span style={{ ...dot, background: "#666" }} />
        <span style={label}>ローカル</span>
      </div>
    );
  }

  if (authError) {
    return (
      <div style={wrap} title="Firebase認証に失敗しました（ローカル保存中）">
        <span style={{ ...dot, background: "#e6a700" }} />
        <span style={label}>認証エラー</span>
      </div>
    );
  }

  return (
    <div
      style={wrap}
      title={connected ? "クラウド同期中" : "オフライン（ローカル保存中）"}
    >
      <span style={{ ...dot, background: connected ? "#4caf50" : "#c44" }} />
      <span style={label}>{connected ? "同期中" : "オフライン"}</span>
    </div>
  );
}

const wrap = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "8px 14px",
  borderTop: "1px solid #2a2a4e",
  fontSize: 10,
  color: "#8888aa",
};

const dot = {
  display: "inline-block",
  width: 7,
  height: 7,
  borderRadius: "50%",
  flexShrink: 0,
};

const label = { whiteSpace: "nowrap" };
