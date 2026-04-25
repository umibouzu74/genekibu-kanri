import { useEffect, useState } from "react";
import { db, authReady, authFailed, isConfigured } from "../firebase/config";
import { ref, onValue, off } from "firebase/database";
import { subscribeSyncActivity } from "../hooks/useSyncedStorage";
import { colors } from "../styles/tokens";

// ─── SyncStatus ─────────────────────────────────────────────────────
// A small indicator showing Firebase connection state.
//   Green  = connected
//   Red    = offline / disconnected
//   Orange = authentication failed
//   Grey   = Firebase not configured (localStorage-only mode)
//   Blue pulse = actively writing (pending sync)
export function SyncStatus({ isAdmin }) {
  const [connected, setConnected] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [pending, setPending] = useState(0);

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

  useEffect(() => subscribeSyncActivity(setPending), []);

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

  const roleLabel = isAdmin ? "管理者" : "閲覧者";
  const saving = pending > 0;
  const statusLabel = saving
    ? "保存中…"
    : connected
      ? "同期中"
      : "オフライン";

  const dotColor = saving
    ? "#6a8fff"
    : connected
      ? "#4caf50"
      : colors.danger;

  return (
    <div
      style={wrap}
      title={
        saving
          ? `クラウドへ保存中（${roleLabel}）`
          : connected
            ? `クラウド同期中（${roleLabel}）`
            : "オフライン（ローカル保存中）"
      }
      aria-live="polite"
    >
      <span
        style={{
          ...dot,
          background: dotColor,
          animation: saving ? "syncPulse 1s ease-in-out infinite" : "none",
        }}
      />
      <span style={label}>
        {statusLabel}
        {connected && !saving && (
          <span style={{ marginLeft: 4, color: isAdmin ? "#4caf50" : "#6a8fff" }}>
            [{roleLabel}]
          </span>
        )}
      </span>
      <style>{`@keyframes syncPulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
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
