// ─── Design tokens ─────────────────────────────────────────────────
// Central definition of the color palette, spacing, radius, and
// typographic scale used across the app. Exposed as both JS
// constants (for inline styles) and CSS custom properties (for
// stylesheets and print/media queries).
export const colors = {
  // Brand / surface
  bg: "#f0f1f3",
  surface: "#ffffff",
  surfaceAlt: "#f8f9fa",
  border: "#e0e0e0",
  // Text
  ink: "#1a1a2e",
  inkMuted: "#666666",
  inkSubtle: "#888888",
  inkGhost: "#bbbbbb",
  // Accent
  primary: "#1a1a2e",
  primaryAlt: "#2a2a4e",
  accentBlue: "#2e6a9e",
  accentRed: "#c03030",
  accentGreen: "#2a7a4a",
  accentOrange: "#e67a00",
  // Tones
  danger: "#c44",
  dangerSoft: "#fff5f5",
  dangerBorder: "#ffcccc",
  success: "#2a7a2a",
  successSoft: "#e8f5e8",
  successBorder: "#bde0bd",
  info: "#1a1a6e",
  infoSoft: "#eef2ff",
  infoBorder: "#ccd6f5",
  warning: "#e6a800",
  warningSoft: "#fffbe6",
};

export const space = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 24,
};

export const radius = {
  sm: 3,
  md: 6,
  lg: 8,
  xl: 12,
  pill: 9999,
};

export const font = {
  stack:
    '"Hiragino Kaku Gothic Pro","Yu Gothic","Noto Sans JP",sans-serif',
};

// ─── CSS custom property serialization ─────────────────────────────
// Flattens the token objects into a CSS text block that can be
// injected into a <style> tag on :root. This keeps JS and CSS in
// sync from a single source.
export function tokensToCss() {
  const lines = [":root {"];
  for (const [k, v] of Object.entries(colors)) lines.push(`  --color-${k}: ${v};`);
  for (const [k, v] of Object.entries(space)) lines.push(`  --space-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(radius))
    lines.push(`  --radius-${k}: ${v === 9999 ? "9999px" : `${v}px`};`);
  lines.push(`  --font-stack: ${font.stack};`);
  lines.push("}");
  return lines.join("\n");
}
