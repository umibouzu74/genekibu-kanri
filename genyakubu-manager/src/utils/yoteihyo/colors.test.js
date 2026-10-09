import { describe, expect, it } from "vitest";
import { OFFICE_THEME, applyTint, paletteColor, themeColor, themeFromXml } from "./colors";

describe("colors", () => {
  it("色番号: 固定色・既定パレット・システム色", () => {
    expect(paletteColor(2)).toBe("ff0000");
    expect(paletteColor(55)).toBe("969696");
    expect(paletteColor(64)).toBeNull();
  });

  it("テーマ色の明るさ (Excel の「白、背景 1、黒 + 基本色 15%」など)", () => {
    expect(themeColor(0, -0.15)).toBe("d9d9d9");
    expect(themeColor(0, -0.35)).toBe("a6a6a6");
    expect(applyTint("ffc000", 0.4)).toBe("ffd966");
    expect(applyTint("4472c4", 0)).toBe("4472c4");
  });

  it("ブックのテーマの配色を、セルの theme 番号の順 (背景 1, テキスト 1, …) に並べる", () => {
    const xml =
      '<a:clrScheme name="x"><a:dk1><a:sysClr val="windowText" lastClr="111111"/></a:dk1>' +
      '<a:lt1><a:sysClr val="window" lastClr="FEFEFE"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2>' +
      '<a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1></a:clrScheme>';
    const t = themeFromXml(xml);
    expect(t.slice(0, 5)).toEqual(["fefefe", "111111", "eeece1", "1f497d", "4f81bd"]);
    expect(t[5]).toBe(OFFICE_THEME[5]); // 書かれていない色は Office 既定
    expect(themeFromXml(undefined)).toBe(OFFICE_THEME);
  });
});
