import { colors, font, radius, space } from "./tokens";

// ─── Common inline style tokens ────────────────────────────────────
// Low-level helpers used across the split component files. Prefer
// adding new helpers here (or more-specific colocated styles) over
// pasting new literal hex values and px numbers.
export const S = {
  btn: (active) => ({
    padding: "8px 14px",
    borderRadius: radius.md,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    background: active ? colors.primary : "#e4e4e8",
    color: active ? "#fff" : "#444",
    transition: "all .15s",
  }),
  input: {
    padding: "8px 10px",
    borderRadius: radius.md,
    border: "1px solid #ccc",
    fontSize: 14,
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
    background: colors.surface,
    borderRadius: radius.xl,
    padding: space["2xl"],
    width: "min(420px, 100%)",
    maxWidth: "90vw",
    // calc() を明示。一部古い UA で min() 内の減算が calc() 省略時にパース失敗する事例があるため。
    maxHeight: "min(85vh, calc(100dvh - 32px))",
    overflow: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,.3)",
  },
  // Panel used by SlotCard, Holiday list, section columns, etc.
  panel: {
    background: colors.surface,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
  },
  // Section header strip used by day rows.
  sectionHeader: (bg, fg) => ({
    background: bg,
    color: fg,
    padding: "10px 16px",
    borderRadius: radius.lg,
    fontWeight: 800,
    fontSize: 15,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  }),
  // Block-form label sitting above its input (e.g. SingleSubForm).
  formLabel: {
    fontSize: 12,
    fontWeight: 700,
    display: "block",
    marginBottom: 3,
  },
  // Horizontal label aligned to the right of a fixed-width column
  // (e.g. SlotForm rows).
  formLabelInline: {
    width: 70,
    fontSize: 12,
    fontWeight: 700,
    textAlign: "right",
    flexShrink: 0,
  },
  // 一覧操作列に並ぶアイコンボタン (✏️ / 🗑 / 📅 等)。
  // 視覚上は地味だが WCAG 2.5.5 / 2.5.8 の最小タッチ領域 (24x24 以上、
  // 推奨 44x44) を満たすため min-width / min-height を確保する。
  // ホバー時の薄いグレー背景は App.jsx のグローバル CSS 内で
  // `.icon-btn:hover` に当てている (インラインで :hover が書けないため)。
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    padding: 4,
    minWidth: 32,
    minHeight: 32,
    lineHeight: 1,
    borderRadius: radius.sm,
  },
};

// `S.iconBtn` を使う <button> に併せて指定する className。
// :hover / :focus-visible のグローバル CSS と紐付けるための識別子。
export const ICON_BTN_CLASS = "icon-btn";

export { colors, font, radius, space };
