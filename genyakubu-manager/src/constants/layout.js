// ─── Layout constants ──────────────────────────────────────────────
// Shared layout dimensions & behavioural thresholds. Centralising
// these lets us tweak the UI globally without grepping through JSX.

export const LAYOUT = Object.freeze({
  /** Fixed sidebar width on desktop (px). Mirror of .sidebar-spacer. */
  SIDEBAR_WIDTH: 210,
});

export const BEHAVIOR = Object.freeze({
  /** Warn when a single teacher has this many slots on one weekday. */
  SLOT_OVERLOAD_THRESHOLD: 6,
});
