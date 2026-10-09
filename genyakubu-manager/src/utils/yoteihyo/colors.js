// ─── Excel の色 (.xls / .xlsx 共通) ─────────────────────────────────
// 色番号 (パレット)・テーマ色 + 明るさ (tint) を "rrggbb" にする。
// .xls の XF (色番号は近い色の目安) と XFEXT (本当の色)、.xlsx の fgColor が
// 同じ色になるように、ここを共有する。

// 色番号 0〜7 は固定色、8〜63 は既定パレット (PALETTE レコードで上書きされる)。
export const FIXED_COLORS = ["000000", "ffffff", "ff0000", "00ff00", "0000ff", "ffff00", "ff00ff", "00ffff"];
// DEFAULT_PALETTE[i] が色番号 i + 8
// prettier-ignore
export const DEFAULT_PALETTE = [
  "000000", "ffffff", "ff0000", "00ff00", "0000ff", "ffff00", "ff00ff", "00ffff",
  "800000", "008000", "000080", "808000", "800080", "008080", "c0c0c0", "808080",
  "9999ff", "993366", "ffffcc", "ccffff", "660066", "ff8080", "0066cc", "ccccff",
  "000080", "ff00ff", "ffff00", "00ffff", "800080", "800000", "008080", "0000ff",
  "00ccff", "ccffff", "ccffcc", "ffff99", "99ccff", "ff99cc", "cc99ff", "ffcc99",
  "3366ff", "33cccc", "99cc00", "ffcc00", "ff9900", "ff6600", "666699", "969696",
  "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333",
];

// Office 既定テーマ (2013〜)。並びはセルの色の theme 番号の順
// (0 = 背景 1 (lt1)、1 = テキスト 1 (dk1)、2 = 背景 2 (lt2)、3 = テキスト 2 (dk2)、
// 4〜9 = アクセント 1〜6、10 / 11 = ハイパーリンク)。テーマの定義 (clrScheme) の
// 並び dk1, lt1, dk2, lt2 とは 0〜3 が入れ替わっている
// prettier-ignore
export const OFFICE_THEME = [
  "ffffff", "000000", "e7e6e6", "44546a", "4472c4", "ed7d31", "a5a5a5", "ffc000", "5b9bd5", "70ad47",
  "0563c1", "954f72",
];

/** 色番号 → "rrggbb" (64 / 65 などのシステム色は null) */
export function paletteColor(idx, palette = DEFAULT_PALETTE) {
  if (!Number.isInteger(idx) || idx < 0) return null;
  if (idx < 8) return FIXED_COLORS[idx];
  if (idx < 64) return palette[idx - 8] ?? null;
  return null;
}

function rgbToHsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l].map((x) => Math.round(x * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((x) => Math.round(x * 255));
}

/**
 * 明るさの調整 (tint: -1〜1)。Excel と同じく明度 (HSL の L) に掛ける。
 * 「白、背景 1、黒 + 基本色 15%」= 白に tint -0.15 = d9d9d9
 */
export function applyTint(hex, tint) {
  if (!tint || !/^[0-9a-f]{6}$/i.test(hex)) return hex;
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [h, s, l] = rgbToHsl(rgb);
  const l2 = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  return hslToRgb([h, s, Math.max(0, Math.min(1, l2))])
    .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0"))
    .join("");
}

/** テーマ色 (番号 + tint) → "rrggbb"。theme は OFFICE_THEME と同じ並びの表 */
export function themeColor(index, tint = 0, theme = OFFICE_THEME) {
  const base = theme[index];
  return base ? applyTint(base, tint) : null;
}

// ブックのテーマ (theme1.xml) の配色を、セルの theme 番号の順に並べ直す。
// 読めない色は Office 既定で補う
const SCHEME_ORDER = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
export function themeFromXml(xml) {
  if (typeof xml !== "string" || !xml.includes("clrScheme")) return OFFICE_THEME;
  return SCHEME_ORDER.map((name, i) => {
    const m = new RegExp(`<a:${name}>\\s*<a:(?:srgbClr\\s+val|sysClr[^>]*?lastClr)="([0-9A-Fa-f]{6})"`).exec(xml);
    return m ? m[1].toLowerCase() : OFFICE_THEME[i];
  });
}
