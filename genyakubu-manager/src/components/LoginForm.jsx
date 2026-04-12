import { useState } from "react";

// ─── LoginForm ──────────────────────────────────────────────────────
// Compact login/logout form shown in the sidebar.
//   - When not signed in as admin: shows email + password fields
//   - When signed in as admin: shows logout button
export function LoginForm({ isAdmin, onSignIn, onSignOut }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isAdmin) {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#8888aa" }}>管理者ログイン中</span>
          <button onClick={onSignOut} style={logoutBtn}>
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onSignIn(email, password);
      setEmail("");
      setPassword("");
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setError("メールまたはパスワードが違います");
      } else if (code === "auth/user-not-found") {
        setError("ユーザーが見つかりません");
      } else if (code === "auth/too-many-requests") {
        setError("ログイン試行回数を超えました。しばらく待ってください");
      } else {
        setError("ログインに失敗しました");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={wrap}>
      <div style={{ fontSize: 10, color: "#8888aa", marginBottom: 4 }}>管理者ログイン</div>
      <input
        type="email"
        placeholder="メールアドレス"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={input}
      />
      <input
        type="password"
        placeholder="パスワード"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        style={input}
      />
      {error && <div style={errStyle}>{error}</div>}
      <button type="submit" disabled={busy} style={submitBtn}>
        {busy ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}

const wrap = {
  padding: "8px 14px",
  borderTop: "1px solid #2a2a4e",
};

const input = {
  width: "100%",
  padding: "4px 6px",
  marginBottom: 4,
  borderRadius: 4,
  border: "1px solid #3a3a5e",
  background: "#2a2a4e",
  color: "#fff",
  fontSize: 10,
  boxSizing: "border-box",
  outline: "none",
};

const submitBtn = {
  width: "100%",
  padding: "4px 0",
  borderRadius: 4,
  border: "none",
  background: "#3a3a6e",
  color: "#fff",
  fontSize: 10,
  cursor: "pointer",
};

const logoutBtn = {
  padding: "2px 8px",
  borderRadius: 4,
  border: "1px solid #3a3a5e",
  background: "transparent",
  color: "#ccc",
  fontSize: 9,
  cursor: "pointer",
};

const errStyle = {
  fontSize: 9,
  color: "#f44",
  marginBottom: 4,
};
