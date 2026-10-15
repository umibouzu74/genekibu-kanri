import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSvgMarkup,
  canShareFiles,
  MAX_CANVAS_PIXELS,
  pickCanvasScale,
  stripXmlInvalidChars,
} from "./htmlImage";

describe("buildSvgMarkup", () => {
  it("XHTML を幅 × 高さの SVG の foreignObject に包む (端数は切り上げ)", () => {
    const svg = buildSvgMarkup({
      xhtml: '<div xmlns="http://www.w3.org/1999/xhtml">x</div>',
      width: 1120,
      height: 586.2,
    });
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="587" viewBox="0 0 1120 587">' +
        '<foreignObject x="0" y="0" width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml">x</div>' +
        "</foreignObject></svg>"
    );
  });

  it("XML で読めない制御文字は落とす (画像全体が読めなくなるのを防ぐ)", () => {
    const svg = buildSvgMarkup({ xhtml: "<p>a\u0001b\u000bc\td</p>", width: 10, height: 10 });
    expect(svg).toContain("<p>abc\td</p>");
  });
});

describe("stripXmlInvalidChars", () => {
  it("タブ・改行・CR は残す", () => {
    expect(stripXmlInvalidChars("a\tb\nc\rd\u0000e")).toBe("a\tb\nc\rde");
  });
});

describe("pickCanvasScale", () => {
  it("上限に収まるなら希望の倍率のまま", () => {
    expect(pickCanvasScale({ width: 1120, height: 600, preferred: 2 })).toBe(2);
  });

  it("縦に長い紙面は iOS の canvas 上限に収まるよう倍率を下げる", () => {
    const s = pickCanvasScale({ width: 1120, height: 4000, preferred: 2 });
    expect(s).toBeLessThan(2);
    expect(1120 * 4000 * s * s).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });
});

describe("canShareFiles", () => {
  const original = { share: navigator.share, canShare: navigator.canShare };
  afterEach(() => {
    navigator.share = original.share;
    navigator.canShare = original.canShare;
  });

  it("navigator.share / canShare が無ければ false", () => {
    navigator.share = undefined;
    navigator.canShare = undefined;
    expect(canShareFiles([{}])).toBe(false);
  });

  it("canShare の答えをそのまま返す (例外は false)", () => {
    navigator.share = vi.fn();
    navigator.canShare = vi.fn(() => true);
    expect(canShareFiles([{}])).toBe(true);
    navigator.canShare = vi.fn(() => {
      throw new Error("x");
    });
    expect(canShareFiles([{}])).toBe(false);
  });
});
