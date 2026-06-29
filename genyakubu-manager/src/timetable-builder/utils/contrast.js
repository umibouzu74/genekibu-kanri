// WCAG 2.x コントラスト比の計算ユーティリティ (E1e)。
//
// builder-* デザイントークンの「読めるテキスト」配色が WCAG AA を満たすかを
// テストで検証するために使う純粋関数群。外部依存 (axe-core 等) は足さない。
//
// 参照: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio

/**
 * "#rrggbb" / "#rgb" を { r, g, b } (0-255) に変換する。
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb(hex) {
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

/**
 * sRGB の相対輝度 (relative luminance) を返す (0..1)。
 * @param {string} hex
 * @returns {number}
 */
export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * 2 色のコントラスト比 (1..21) を返す。順序非依存。
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG AA のしきい値: 通常テキスト 4.5:1 / 大きいテキスト・UI 部品 3:1
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

/**
 * AA を満たすか判定する。
 * @param {string} fg 前景 (テキスト) 色
 * @param {string} bg 背景色
 * @param {{ large?: boolean }} [opts] large=true で大きいテキスト基準 (3:1)
 * @returns {boolean}
 */
export function meetsAA(fg, bg, { large = false } = {}) {
  return contrastRatio(fg, bg) >= (large ? AA_LARGE : AA_NORMAL);
}
