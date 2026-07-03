// WCAG 2.x コントラスト比の計算ユーティリティ (E1e)。
//
// builder-* デザイントークンの「読めるテキスト」配色が WCAG AA を満たすかを
// テストで検証するために使う純粋関数群。外部依存 (axe-core 等) は足さない。
//
// 参照: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio

// "#rrggbb" / "#rgb" を { r, g, b } (0-255) に変換する。
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// sRGB の相対輝度 (relative luminance) を返す (0..1)。
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// 2 色のコントラスト比 (1..21) を返す。順序非依存。
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG AA のしきい値: 通常テキスト 4.5:1 / 大きいテキスト・UI 部品 3:1
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

// AA を満たすか判定する。large=true で大きいテキスト基準 (3:1)。
export function meetsAA(fg: string, bg: string, { large = false }: { large?: boolean } = {}): boolean {
  return contrastRatio(fg, bg) >= (large ? AA_LARGE : AA_NORMAL);
}
