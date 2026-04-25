import { colors } from "../styles/tokens";

// ─── FieldError ───────────────────────────────────────────────────
// Inline form validation message rendered below an input.
// Always announced via role="alert" so screen readers pick up the
// error as soon as it appears.
export function FieldError({ id, className, children, style }) {
  if (!children) return null;
  return (
    <div
      id={id}
      className={className}
      role="alert"
      style={{ fontSize: 11, color: colors.danger, marginTop: 2, ...style }}
    >
      {children}
    </div>
  );
}
