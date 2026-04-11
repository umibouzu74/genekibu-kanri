// ─── Common inline style tokens ────────────────────────────────────
// Extracted from App.jsx. These keep the app visually unchanged while
// enabling reuse across the split component files.
export const S = {
  btn: (active) => ({
    padding: "6px 14px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    background: active ? "#1a1a2e" : "#e4e4e8",
    color: active ? "#fff" : "#444",
    transition: "all .15s",
  }),
  input: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #ccc",
    fontSize: 12,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  modal: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 24,
    width: 420,
    maxWidth: "90vw",
    maxHeight: "85vh",
    overflow: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,.3)",
  },
};
